import { getPrisma } from '../src/context';

async function checkDuplicates() {
  console.log('Checking database for duplicate attendance records per tenant, user, and work date...');

  const logs = await getPrisma().attendance_logs.findMany({
    orderBy: { check_in_at: 'asc' }
  });

  const grouped = new Map<string, typeof logs>();

  for (const log of logs) {
    const workDateStr = new Date(log.check_in_at).toISOString().split('T')[0];
    const key = `${log.tenant_id}:${log.user_id}:${workDateStr}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(log);
  }

  const duplicates: { key: string; count: number; logs: typeof logs }[] = [];

  for (const [key, recordGroup] of grouped.entries()) {
    if (recordGroup.length > 1) {
      duplicates.push({ key, count: recordGroup.length, logs: recordGroup });
    }
  }

  console.log(`Total attendance logs: ${logs.length}`);
  console.log(`Unique (tenant, user, date) groups: ${grouped.size}`);
  console.log(`Duplicate groups found: ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log('\n--- MIGRATION BLOCKER REPORT: DUPLICATE ATTENDANCE FOUND ---');
    duplicates.forEach((d) => {
      console.log(`Group Key: ${d.key} (${d.count} records)`);
      d.logs.forEach((l) => {
        console.log(`  ID: ${l.id} | CheckIn: ${l.check_in_at.toISOString()} | CheckOut: ${l.check_out_at?.toISOString() || 'null'}`);
      });
    });
  } else {
    console.log('\n✓ No duplicate attendance records found in database.');
  }

  process.exit(0);
}

checkDuplicates().catch((err) => {
  console.error('Error checking duplicates:', err);
  process.exit(1);
});
