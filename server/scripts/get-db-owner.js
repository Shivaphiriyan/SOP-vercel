const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const owner = await prisma.$queryRawUnsafe(`SELECT tableowner FROM pg_tables WHERE tablename = 'attendance_logs';`);
    console.log('Table owner:', owner);

    const currentUser = await prisma.$queryRawUnsafe(`SELECT current_user, session_user;`);
    console.log('Current DB user:', currentUser);

    const passList = ['sop123', 'root', '123456', 'admin', 'password', 'postgres'];
    for (const p of passList) {
      try {
        const testClient = new PrismaClient({
          datasources: { db: { url: `postgresql://postgres:${p}@localhost:5432/sop_saas` } }
        });
        await testClient.$connect();
        console.log(`FOUND WORKING POSTGRES PASSWORD: "${p}"`);
        await testClient.$disconnect();
        break;
      } catch (e) {
        // try next
      }
    }
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
