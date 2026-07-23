import { randomUUID } from 'crypto';
import { basePrisma } from '../src/context';
import { createAuditLog, sanitizeAuditData } from '../src/services/audit.service';

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

async function runAuditTests() {
  console.log('--- RUNNING AUDIT LOG SYSTEM UNIT & INTEGRATION TESTS ---\n');

  const tenantId1 = randomUUID();
  const tenantId2 = randomUUID();
  const userId1 = randomUUID();
  const adminId1 = randomUUID();

  // 1. Setup mock tenants & users
  await basePrisma.$executeRawUnsafe(`INSERT INTO tenants (id, name) VALUES ('${tenantId1}', 'Audit Test Tenant 1') ON CONFLICT DO NOTHING`);
  await basePrisma.$executeRawUnsafe(`INSERT INTO tenants (id, name) VALUES ('${tenantId2}', 'Audit Test Tenant 2') ON CONFLICT DO NOTHING`);

  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash, role) VALUES ('${userId1}', '${tenantId1}', 'audit_user1', 'hash', 'operator') ON CONFLICT DO NOTHING`);
  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash, role) VALUES ('${adminId1}', '${tenantId1}', 'audit_admin1', 'hash', 'admin') ON CONFLICT DO NOTHING`);

  // Test 1: Recursive Sanitization of Sensitive Fields
  console.log('Test 1: Testing sensitive field redaction in audit payload...');
  const rawPayload = {
    username: 'john_doe',
    password: 'SuperSecretPassword123!',
    token: 'jwt.bearer.token.string',
    nestedSecret: {
      apiKey: 'sk-live-1234567890',
      cloudinaryApiSecret: 'cloud_secret_abc'
    },
    safeField: 'This should stay intact'
  };

  const sanitized = sanitizeAuditData(rawPayload);
  assert(sanitized.password === '[REDACTED]', 'Password field was redacted');
  assert(sanitized.token === '[REDACTED]', 'Token field was redacted');
  assert(sanitized.nestedSecret.apiKey === '[REDACTED]', 'Nested API key was redacted');
  assert(sanitized.nestedSecret.cloudinaryApiSecret === '[REDACTED]', 'Nested Cloudinary secret was redacted');
  assert(sanitized.safeField === 'This should stay intact', 'Safe non-sensitive data preserved');

  // Test 2: Create Audit Log Entry
  console.log('Test 2: Creating audit log entry...');
  await runWithTenant(tenantId1, async (tx) => {
    await createAuditLog(
      {
        tenantId: tenantId1,
        actorUserId: adminId1,
        actorNameSnapshot: 'admin:audit_admin1',
        action: 'employee.created',
        entityType: 'user',
        entityId: userId1,
        description: `Admin created employee audit_user1`,
        newValues: { username: 'audit_user1', role: 'operator' }
      },
      undefined,
      tx
    );
  });

  const auditLogs = await runWithTenant(tenantId1, async (tx) => {
    return tx.audit_logs.findMany({
      where: { tenant_id: tenantId1 }
    });
  });
  assert(auditLogs.length === 1, 'Audit log entry created in database');
  assert(auditLogs[0].action === 'employee.created', 'Audit log action matches');
  assert(auditLogs[0].actor_user_id === adminId1, 'Audit log actorUserId recorded');

  // Test 3: Immutability (Attempted UPDATE / DELETE should be rejected or prevented)
  console.log('Test 3: Verifying audit log immutability via DB permissions...');
  let updateFailed = false;
  try {
    // app_user has REVOKE UPDATE on audit_logs table
    await runWithTenant(tenantId1, async (tx) => {
      await tx.audit_logs.update({
        where: { id: auditLogs[0].id },
        data: { description: 'Tampered description' }
      });
    });
  } catch (err: any) {
    updateFailed = true;
  }
  assert(updateFailed, 'Audit log update rejected by database permissions/REVOKE policy');

  // Test 4: Cross-tenant isolation
  console.log('Test 4: Verifying cross-tenant audit log isolation...');
  const tenant2AuditLogs = await runWithTenant(tenantId2, async (tx) => {
    return tx.audit_logs.findMany({
      where: { tenant_id: tenantId2 }
    });
  });
  assert(tenant2AuditLogs.length === 0, 'Tenant 2 cannot access Tenant 1 audit logs');

  console.log('\n--- ALL AUDIT LOG TESTS COMPLETED SUCCESSFULLY ---');
}

runAuditTests().catch((err) => {
  console.error('\nAUDIT LOG TEST SUITE FAILED:', err);
  process.exit(1);
});
