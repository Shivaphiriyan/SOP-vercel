import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('testpass123', 10);
  
  // Update op-test inside the transaction context to set password
  const tenant = await prisma.tenants.findFirst({ where: { name: 'Acme Co.' } });
  if (!tenant) throw new Error('Acme Co. tenant not found');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
    
    // Find op-test user
    const opTest = await tx.users.findFirst({ where: { username: 'op-test' } });
    if (opTest) {
      await tx.users.update({
        where: { id: opTest.id },
        data: { password_hash: passwordHash }
      });
      console.log('Successfully updated op-test password to: testpass123');
    } else {
      console.log('op-test user not found');
    }
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
