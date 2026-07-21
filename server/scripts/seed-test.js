const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenants.create({
    data: {
      name: 'Test Tenant 3',
      location_lat: 40.7128,
      location_lng: -74.0060,
      location_radius_m: 500
    }
  });

  const hash = await bcrypt.hash('password123', 10);
  
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
    await tx.$executeRawUnsafe(`
      INSERT INTO users (tenant_id, username, password_hash, role) 
      VALUES ('${tenant.id}', 'testuser3', '${hash}', 'operator');
    `);
  });

  console.log("Created tenant and user!");
  console.log("Tenant Slug: test-tenant-3");
  console.log("Username: testuser3");
  console.log("Password: password123");
}
main().catch(console.error).finally(() => prisma.$disconnect());
