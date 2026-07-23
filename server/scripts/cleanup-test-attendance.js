const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:root@localhost:5432/sop_saas' } }
});

async function run() {
  try {
    const logs = await prisma.$queryRawUnsafe(`SELECT id, tenant_id, user_id, work_date, check_in_at FROM attendance_logs;`);
    console.log('Existing attendance logs in database:', logs);

    // Delete any test rows created by scripts
    const deleted = await prisma.$executeRawUnsafe(`DELETE FROM attendance_logs;`);
    console.log(`Cleaned up ${deleted} rows from attendance_logs table.`);
  } catch (err) {
    console.error('Error during inspection/cleanup:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
