import { basePrisma } from '../src/context';
import { randomUUID } from 'crypto';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`✓ PASSED: ${message}`);
}

async function runWithTenant<T>(tenantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
    return fn(tx);
  });
}

async function executeRawWithTenant(tenantId: string, sql: string) {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
    await tx.$executeRawUnsafe(sql);
  });
}

async function runDuplicateAttendanceTests() {
  console.log('--- RUNNING DUPLICATE ATTENDANCE BUSINESS RULES & CONSTRAINTS TESTS ---\n');

  const tenantId1 = randomUUID();
  const tenantId2 = randomUUID();
  const userId1 = randomUUID();
  const userId2 = randomUUID();
  const concurrentUser = randomUUID();

  // Ensure test tenants exist in DB
  await basePrisma.$executeRawUnsafe(`INSERT INTO tenants (id, name) VALUES ('${tenantId1}', 'Test Tenant 1') ON CONFLICT DO NOTHING`);
  await basePrisma.$executeRawUnsafe(`INSERT INTO tenants (id, name) VALUES ('${tenantId2}', 'Test Tenant 2') ON CONFLICT DO NOTHING`);

  // Ensure test users exist in DB with tenant context set
  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash) VALUES ('${userId1}', '${tenantId1}', 'user1', 'hash') ON CONFLICT DO NOTHING`);
  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash) VALUES ('${userId2}', '${tenantId1}', 'user2', 'hash') ON CONFLICT DO NOTHING`);
  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash) VALUES ('${concurrentUser}', '${tenantId1}', 'user-conc', 'hash') ON CONFLICT DO NOTHING`);
  await executeRawWithTenant(tenantId2, `INSERT INTO users (id, tenant_id, username, password_hash) VALUES ('${userId1}', '${tenantId2}', 'user1-t2', 'hash') ON CONFLICT DO NOTHING`);

  const todayDate = new Date();
  todayDate.setUTCHours(0, 0, 0, 0);

  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setUTCDate(todayDate.getUTCDate() + 1);

  // Test 1: First check-in succeeds
  console.log('Test 1: First check-in for Tenant 1 User 1 on todayDate...');
  const firstCheckIn = await runWithTenant(tenantId1, async (tx) => {
    return tx.attendance_logs.create({
      data: {
        tenant_id: tenantId1,
        user_id: userId1,
        work_date: todayDate,
        check_in_at: new Date(),
        check_in_lat: 9.6615,
        check_in_lng: 80.0255
      }
    });
  });
  assert(!!firstCheckIn.id, 'First check-in log created successfully');

  // Test 2: Second check-in on same work_date is blocked by DB unique constraint
  console.log('Test 2: Second check-in on same day for Tenant 1 User 1...');
  let secondCheckInBlocked = false;
  try {
    await runWithTenant(tenantId1, async (tx) => {
      return tx.attendance_logs.create({
        data: {
          tenant_id: tenantId1,
          user_id: userId1,
          work_date: todayDate,
          check_in_at: new Date(),
          check_in_lat: 9.6615,
          check_in_lng: 80.0255
        }
      });
    });
  } catch (err: any) {
    if (err?.code === 'P2002' || String(err).includes('unique_tenant_user_work_date')) {
      secondCheckInBlocked = true;
    }
  }
  assert(secondCheckInBlocked, 'Second check-in on same day caught by database unique constraint (P2002)');

  // Test 3: Checkout succeeds
  console.log('Test 3: Checkout for Tenant 1 User 1...');
  const checkoutTime = new Date();
  const updatedLog = await runWithTenant(tenantId1, async (tx) => {
    return tx.attendance_logs.update({
      where: { id: firstCheckIn.id },
      data: { check_out_at: checkoutTime }
    });
  });
  assert(updatedLog.check_out_at !== null, 'Checkout succeeded and recorded timestamp');

  // Test 4: Second checkout is blocked (no active open session exists)
  console.log('Test 4: Second checkout blocked...');
  const activeSession = await runWithTenant(tenantId1, async (tx) => {
    return tx.attendance_logs.findFirst({
      where: { tenant_id: tenantId1, user_id: userId1, check_out_at: null }
    });
  });
  assert(activeSession === null, 'No active open session found after checkout');

  // Test 5: Checkout without check-in is blocked
  console.log('Test 5: Checkout without check-in for User 2...');
  const activeUser2Session = await runWithTenant(tenantId1, async (tx) => {
    return tx.attendance_logs.findFirst({
      where: { tenant_id: tenantId1, user_id: userId2, check_out_at: null }
    });
  });
  assert(activeUser2Session === null, 'User 2 has no active check-in session');

  // Test 6: Next-day check-in succeeds for User 1
  console.log('Test 6: Next-day check-in for User 1...');
  const nextDayCheckIn = await runWithTenant(tenantId1, async (tx) => {
    return tx.attendance_logs.create({
      data: {
        tenant_id: tenantId1,
        user_id: userId1,
        work_date: tomorrowDate,
        check_in_at: tomorrowDate,
        check_in_lat: 9.6615,
        check_in_lng: 80.0255
      }
    });
  });
  assert(!!nextDayCheckIn.id, 'Next-day check-in for User 1 created successfully');

  // Test 7: Cross-tenant records do not conflict
  console.log('Test 7: Cross-tenant check-in for Tenant 2 on same work_date...');
  const tenant2CheckIn = await runWithTenant(tenantId2, async (tx) => {
    return tx.attendance_logs.create({
      data: {
        tenant_id: tenantId2,
        user_id: userId1,
        work_date: todayDate,
        check_in_at: new Date(),
        check_in_lat: 9.6615,
        check_in_lng: 80.0255
      }
    });
  });
  assert(!!tenant2CheckIn.id, 'Cross-tenant check-in with same user_id succeeded without conflict');

  // Test 8: Concurrent duplicate check-in requests handled safely
  console.log('Test 8: Concurrent duplicate check-in simulation...');
  const workDateConc = new Date('2026-08-01T00:00:00Z');

  const attempts = await Promise.allSettled([
    runWithTenant(tenantId1, (tx) => tx.attendance_logs.create({ data: { tenant_id: tenantId1, user_id: concurrentUser, work_date: workDateConc } })),
    runWithTenant(tenantId1, (tx) => tx.attendance_logs.create({ data: { tenant_id: tenantId1, user_id: concurrentUser, work_date: workDateConc } }))
  ]);

  const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
  const rejected = attempts.filter((a) => a.status === 'rejected');
  assert(fulfilled.length === 1, 'Exactly one concurrent check-in succeeded');
  assert(rejected.length === 1, 'Exactly one concurrent check-in failed with unique constraint rejection');

  console.log('\n--- ALL DUPLICATE ATTENDANCE TESTS COMPLETED SUCCESSFULLY ---');

  // Clean up created test data
  try {
    await basePrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '00000000-0000-0000-0000-000000000000'`);
      await tx.$executeRawUnsafe(`DELETE FROM attendance_logs WHERE tenant_id IN ('${tenantId1}', '${tenantId2}')`);
      await tx.$executeRawUnsafe(`DELETE FROM users WHERE tenant_id IN ('${tenantId1}', '${tenantId2}')`);
      await tx.$executeRawUnsafe(`DELETE FROM tenants WHERE id IN ('${tenantId1}', '${tenantId2}')`);
    });
  } catch (err) {
    // Ignore cleanup error
  }
}

runDuplicateAttendanceTests()
  .catch((err) => {
    console.error('\nDUPLICATE ATTENDANCE TEST SUITE FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });
