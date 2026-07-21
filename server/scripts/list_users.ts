import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Query all tenants
  const tenants = await prisma.tenants.findMany();
  console.log(`Found ${tenants.length} tenants.`);

  for (const tenant of tenants) {
    console.log(`\nTenant: ${tenant.name}`);
    
    // Set tenant context inside a transaction to bypass RLS for reading
    const users = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
      return await tx.users.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          hourly_rate: true
        }
      });
    });

    console.log(`Users:`, users);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
