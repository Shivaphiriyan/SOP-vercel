import { basePrisma, tenantStorage, prisma } from '../src/context';
import { createAuditLog } from '../src/services/audit.service';

async function runSettingsPersistenceTest() {
  console.log('=== Starting Company Settings Persistence Verification ===\n');

  try {
    // 1. Fetch first available tenant
    const tenant = await prisma.tenants.findFirst();
    if (!tenant) {
      console.error('❌ No tenant found in database.');
      process.exit(1);
    }

    console.log(`[1] Found test tenant: ID = ${tenant.id}, Current Name = "${tenant.name}"`);
    console.log(`    Current Location: Lat = ${tenant.location_lat}, Lng = ${tenant.location_lng}, Radius = ${tenant.location_radius_m}m`);
    console.log(`    Current Leave Notice: ${tenant.leave_notice_days} days\n`);

    // 2. Perform test update on tenant settings
    const testName = `Updated Corp ${Date.now()}`;
    const testLat = 6.9271;
    const testLng = 79.8612;
    const testRadius = 250;
    const testNoticeDays = 5;

    console.log(`[2] Updating tenant settings with new values:`);
    console.log(`    New Name: "${testName}"`);
    console.log(`    New Geofence: ${testLat}, ${testLng} (Radius: ${testRadius}m)`);
    console.log(`    New Leave Notice: ${testNoticeDays} days`);

    const updatedTenant = await prisma.tenants.update({
      where: { id: tenant.id },
      data: {
        name: testName,
        location_lat: testLat,
        location_lng: testLng,
        location_radius_m: testRadius,
        leave_notice_days: testNoticeDays
      }
    });

    console.log('\n[3] Re-querying PostgreSQL database directly via Prisma to verify persistence...');
    const reQueriedTenant = await prisma.tenants.findUnique({
      where: { id: tenant.id }
    });

    if (!reQueriedTenant) {
      throw new Error('Failed to re-query updated tenant from database.');
    }

    // Verify all fields in DB match test input
    const isNameValid = reQueriedTenant.name === testName;
    const isLatValid = reQueriedTenant.location_lat === testLat;
    const isLngValid = reQueriedTenant.location_lng === testLng;
    const isRadiusValid = reQueriedTenant.location_radius_m === testRadius;
    const isNoticeValid = reQueriedTenant.leave_notice_days === testNoticeDays;

    console.log(`    - Name Persisted: ${isNameValid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`    - Latitude Persisted: ${isLatValid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`    - Longitude Persisted: ${isLngValid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`    - Radius Persisted: ${isRadiusValid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`    - Leave Notice Days Persisted: ${isNoticeValid ? '✅ PASSED' : '❌ FAILED'}`);

    if (isNameValid && isLatValid && isLngValid && isRadiusValid && isNoticeValid) {
      console.log('\n✅ ALL SETTINGS FIELDS ARE GENUINELY PERSISTED TO POSTGRESQL DATABASE.');
    } else {
      console.error('\n❌ PERSISTENCE VERIFICATION FAILED.');
      process.exit(1);
    }

    // 4. Test Audit Service
    console.log('\n[4] Creating audit log entry using createAuditLog service under tenant context...');
    await basePrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`);
      return tenantStorage.run(tx, async () => {
        await createAuditLog({
          tenantId: tenant.id,
          actorUserId: null,
          action: 'settings.updated',
          entityType: 'tenant',
          entityId: tenant.id,
          description: `Updated company settings for '${testName}'`,
          oldValues: { name: tenant.name, location_radius_m: tenant.location_radius_m },
          newValues: { name: testName, location_radius_m: testRadius },
          status: 'success'
        });
      });
    });

    console.log('    Audit log created successfully via AuditService ✅');

  } catch (error) {
    console.error('❌ Error during settings test:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSettingsPersistenceTest();
