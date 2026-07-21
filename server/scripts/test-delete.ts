import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenants.findFirst({
    where: { name: 'Acme Co.' }
  });

  if (!tenant) {
    console.log('Acme Co. tenant not found');
    return;
  }

  // Find a current SOP template
  const sop = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
    return await tx.sop_templates.findFirst({
      where: { is_current: true, archived: false }
    });
  });

  if (!sop) {
    console.log('No current SOP found');
    return;
  }

  console.log(`Found SOP to delete: ID=${sop.id}, Title="${sop.title}"`);

  // Try to soft-delete it
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
      
      const updated = await tx.sop_templates.update({
        where: { id: sop.id },
        data: { archived: true }
      });
      
      return updated;
    });
    console.log('Soft-delete query succeeded:', result);
  } catch (err: any) {
    console.error('Soft-delete query failed:', err.message);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
