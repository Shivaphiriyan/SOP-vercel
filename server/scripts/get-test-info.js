const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.$queryRawUnsafe(`SELECT * FROM users LIMIT 1`);
  if (users.length === 0) {
    console.log("No users found");
    return;
  }
  const user = users[0];
  const tenant = await prisma.tenants.findUnique({ where: { id: user.tenant_id } });
  console.log(JSON.stringify({ tenantSlug: tenant.name, username: user.username, password: "password123" }));
}
main().then(() => prisma.$disconnect());
