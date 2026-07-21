import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing connection to database...');
    const tenantCount = await prisma.tenants.count();
    console.log(`Connection successful! Total tenants: ${tenantCount}`);
    
    const tenantsList = await prisma.tenants.findMany();
    console.log('Tenants list:', tenantsList);
  } catch (error) {
    console.error('Database connection test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
