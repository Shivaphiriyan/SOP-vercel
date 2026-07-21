const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE sop_templates ADD COLUMN archived BOOLEAN DEFAULT false;`);
    console.log('Successfully added archived column');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('Column already exists');
    } else {
      console.error('Failed:', err.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

run();
