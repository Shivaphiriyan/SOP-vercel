import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with test tenant and admin user...');

  try {
    // 1. Look up or create Tenant "Acme Co."
    let tenant = await prisma.tenants.findFirst({
      where: { name: 'Acme Co.' }
    });

    if (!tenant) {
      tenant = await prisma.tenants.create({
        data: {
          name: 'Acme Co.',
          plan_tier: 'starter',
          billing_status: 'trial'
        }
      });
      console.log(`Created tenant "Acme Co." with ID: ${tenant.id}`);
    } else {
      console.log(`Found existing tenant "Acme Co." with ID: ${tenant.id}`);
    }

    // 2. Hash password "testpass123"
    const passwordHash = await bcrypt.hash('testpass123', 10);

    // 3. Look up or create User "admin" inside that tenant
    // Since users table has RLS, we must run the query in a transaction
    // with app.current_tenant set to the tenant ID.
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant!.id}'`);

      const existingUser = await tx.users.findFirst({
        where: {
          username: 'admin',
          tenant_id: tenant!.id
        }
      });

      if (existingUser) {
        console.log(`User "admin" already exists. Updating password...`);
        await tx.users.update({
          where: { id: existingUser.id },
          data: { password_hash: passwordHash }
        });
      } else {
        console.log(`Creating user "admin" in tenant "Acme Co."...`);
        await tx.users.create({
          data: {
            tenant_id: tenant!.id,
            username: 'admin',
            password_hash: passwordHash,
            role: 'admin',
            status: 'active'
          }
        });
      }

      // 4. Look up or create User "operator1" inside that tenant
      const existingOperator = await tx.users.findFirst({
        where: {
          username: 'operator1',
          tenant_id: tenant!.id
        }
      });

      if (existingOperator) {
        console.log(`User "operator1" already exists. Updating password...`);
        await tx.users.update({
          where: { id: existingOperator.id },
          data: { password_hash: passwordHash }
        });
        return existingOperator;
      } else {
        console.log(`Creating user "operator1" in tenant "Acme Co."...`);
        return await tx.users.create({
          data: {
            tenant_id: tenant!.id,
            username: 'operator1',
            password_hash: passwordHash,
            role: 'operator',
            status: 'active'
          }
        });
      }
    });

    console.log(`\nSuccessfully seeded users.`);
    console.log('\nUse the following details to test POST /auth/login:');
    console.log(`- tenantSlug: "acme-co"`);
    console.log(`- username:   "admin" or "operator1"`);
    console.log(`- password:   "testpass123"`);

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
