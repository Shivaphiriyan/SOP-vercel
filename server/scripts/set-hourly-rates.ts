import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenants.findMany();
  const acmeTenant = tenants.find(t => t.name === 'Acme Co.');
  if (!acmeTenant) {
    console.log('Acme Co. tenant not found');
    return;
  }

  console.log(`Setting hourly rates for users in Tenant: ${acmeTenant.name}`);

  await prisma.$transaction(async (tx) => {
    // Set RLS tenant context
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${acmeTenant.id}'`);

    // Update admin hourly rate
    const admin = await tx.users.findFirst({ where: { username: 'admin' } });
    if (admin) {
      await tx.users.update({
        where: { id: admin.id },
        data: { hourly_rate: 1500 }
      });
      console.log('Set admin hourly rate to 1500 LKR');
    }

    // Update operator1 hourly rate
    const operator1 = await tx.users.findFirst({ where: { username: 'operator1' } });
    if (operator1) {
      await tx.users.update({
        where: { id: operator1.id },
        data: { hourly_rate: 500 }
      });
      console.log('Set operator1 hourly rate to 500 LKR');
    }
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
