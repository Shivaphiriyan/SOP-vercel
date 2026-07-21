const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://app_user:sop123@localhost:5432/sop_saas'
    }
  }
});

async function run() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE sop_templates ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;`);
    console.log('Successfully added archived column');
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
