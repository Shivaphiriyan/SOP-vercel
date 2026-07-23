import { randomUUID } from 'crypto';
import { basePrisma } from '../src/context';
import { createNotification, createManyNotifications, createRoleNotification } from '../src/services/notification.service';

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

async function runNotificationTests() {
  console.log('--- RUNNING NOTIFICATION SYSTEM UNIT & INTEGRATION TESTS ---\n');

  const tenantId1 = randomUUID();
  const tenantId2 = randomUUID();
  const userId1 = randomUUID();
  const userId2 = randomUUID();

  // 1. Setup mock tenants & users
  await basePrisma.$executeRawUnsafe(`INSERT INTO tenants (id, name) VALUES ('${tenantId1}', 'Notif Test Tenant 1') ON CONFLICT DO NOTHING`);
  await basePrisma.$executeRawUnsafe(`INSERT INTO tenants (id, name) VALUES ('${tenantId2}', 'Notif Test Tenant 2') ON CONFLICT DO NOTHING`);

  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash, role) VALUES ('${userId1}', '${tenantId1}', 'notif_user1', 'hash', 'operator') ON CONFLICT DO NOTHING`);
  await executeRawWithTenant(tenantId1, `INSERT INTO users (id, tenant_id, username, password_hash, role) VALUES ('${userId2}', '${tenantId1}', 'notif_user2', 'hash', 'admin') ON CONFLICT DO NOTHING`);
  await executeRawWithTenant(tenantId2, `INSERT INTO users (id, tenant_id, username, password_hash, role) VALUES ('${userId1}', '${tenantId2}', 'notif_t2_user', 'hash', 'operator') ON CONFLICT DO NOTHING`);

  // Test 1: Create notification
  console.log('Test 1: Creating notification for User 1...');
  const notif1 = await runWithTenant(tenantId1, async (tx) => {
    return createNotification(
      {
        tenantId: tenantId1,
        recipientUserId: userId1,
        actorUserId: userId2,
        type: 'leave_approved',
        title: 'Leave Approved',
        message: 'Your leave request has been approved.',
        actionUrl: '/leave_requests'
      },
      tx
    );
  });
  assert(!!notif1.id, 'Notification created successfully');
  assert(notif1.is_read === false, 'Notification defaults to unread');

  // Test 2: Unread count
  console.log('Test 2: Verifying unread count...');
  const unreadCount = await runWithTenant(tenantId1, async (tx) => {
    return tx.notifications.count({
      where: { tenant_id: tenantId1, recipient_user_id: userId1, is_read: false }
    });
  });
  assert(unreadCount === 1, 'Unread notification count is 1');

  // Test 3: Deduplication
  console.log('Test 3: Testing deduplication within short window...');
  const duplicateResult = await runWithTenant(tenantId1, async (tx) => {
    return createNotification(
      {
        tenantId: tenantId1,
        recipientUserId: userId1,
        actorUserId: userId2,
        type: 'leave_approved',
        title: 'Leave Approved',
        message: 'Your leave request has been approved.',
        actionUrl: '/leave_requests'
      },
      tx
    );
  });
  assert(duplicateResult.id === notif1.id, 'Deduplication prevented duplicate notification insertion');

  // Test 4: Mark as read
  console.log('Test 4: Marking notification as read...');
  const updatedNotif = await runWithTenant(tenantId1, async (tx) => {
    return tx.notifications.update({
      where: { id: notif1.id },
      data: { is_read: true, read_at: new Date() }
    });
  });
  assert(updatedNotif.is_read === true, 'Notification marked as read');
  assert(updatedNotif.read_at !== null, 'Read timestamp recorded');

  // Test 5: Role-based notification
  console.log('Test 5: Creating role-based notification for Admins...');
  await runWithTenant(tenantId1, async (tx) => {
    await createRoleNotification(
      tenantId1,
      ['admin'],
      {
        type: 'leave_submitted',
        title: 'New Leave Request',
        message: 'A new leave request awaits review.'
      },
      tx
    );
  });

  const adminNotifs = await runWithTenant(tenantId1, async (tx) => {
    return tx.notifications.findMany({
      where: { tenant_id: tenantId1, recipient_user_id: userId2 }
    });
  });
  assert(adminNotifs.length === 1, 'Admin recipient received role notification');

  // Test 6: Cross-tenant isolation
  console.log('Test 6: Verifying cross-tenant isolation for notifications...');
  const tenant2Notifs = await runWithTenant(tenantId2, async (tx) => {
    return tx.notifications.findMany({
      where: { tenant_id: tenantId2 }
    });
  });
  assert(tenant2Notifs.length === 0, 'Tenant 2 cannot read Tenant 1 notifications');

  console.log('\n--- ALL NOTIFICATION TESTS COMPLETED SUCCESSFULLY ---');
}

runNotificationTests().catch((err) => {
  console.error('\nNOTIFICATION TEST SUITE FAILED:', err);
  process.exit(1);
});
