import { prisma } from '../src/context';
import bcrypt from 'bcrypt';

async function main() {
  console.log('--- STARTING RLS AND AUTH VERIFICATION ---');

  try {
    // 1. Seed Tenant
    console.log('Seeding test tenant "Acme Corp"...');
    let tenant = await prisma.tenants.findFirst({ where: { name: 'Acme Corp' } });
    if (!tenant) {
      tenant = await prisma.tenants.create({
        data: {
          name: 'Acme Corp',
          plan_tier: 'enterprise',
          billing_status: 'active'
        }
      });
      console.log(`Created test tenant: ID = ${tenant.id}`);
    } else {
      console.log(`Using existing test tenant: ID = ${tenant.id}`);
    }

    // 2. Seed User inside that tenant
    console.log('Seeding test user "admin" in "Acme Corp"...');
    const passwordHash = await bcrypt.hash('password123', 10);
    const tenantId = tenant.id;
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      
      const existingUser = await tx.users.findFirst({
        where: {
          username: 'admin',
          tenant_id: tenantId
        }
      });

      if (existingUser) {
        console.log(`User "admin" exists. Updating password...`);
        return await tx.users.update({
          where: { id: existingUser.id },
          data: { password_hash: passwordHash }
        });
      } else {
        console.log(`User "admin" does not exist. Creating...`);
        return await tx.users.create({
          data: {
            tenant_id: tenantId,
            username: 'admin',
            password_hash: passwordHash,
            role: 'admin',
            status: 'active'
          }
        });
      }
    });
    console.log(`Seeded test user: ID = ${user.id}, role = ${user.role}`);

    // 3. Verify Raw DB RLS behaviors
    console.log('\n--- VERIFYING RAW DB RLS BEHAVIORS ---');

    // A. Querying users WITH tenant context set in transaction
    console.log('Querying users WITH tenant context set...');
    const usersWithContext = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
      return await tx.users.findMany();
    });
    console.log(`Found ${usersWithContext.length} users with context. Expected: 1.`);
    if (usersWithContext.length !== 1 || usersWithContext[0].id !== user.id) {
      throw new Error('RLS check failed: User was not retrieved with valid tenant context.');
    }
    console.log('SUCCESS: Tenant context query retrieved the correct user.');

    // B. Querying users WITHOUT tenant context set
    console.log('Querying users WITHOUT tenant context set (should fail closed and return 0 rows)...');
    const usersWithoutContext = await prisma.users.findMany();
    console.log(`Found ${usersWithoutContext.length} users without context. Expected: 0.`);
    if (usersWithoutContext.length !== 0) {
      throw new Error('RLS check failed: Leak detected! Query returned user data without tenant context.');
    }
    console.log('SUCCESS: Query without tenant context returned 0 rows (Failed closed).');

    // 4. Verify API HTTP Endpoints
    console.log('\n--- VERIFYING API HTTP ENDPOINTS ---');
    const API_URL = 'http://localhost:5000';

    // A. Verify Login
    console.log('Testing POST /auth/login...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'password123',
        tenantSlug: 'acme-corp'
      })
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed with status ${loginRes.status}: ${errText}`);
    }

    const { token } = (await loginRes.json()) as { token: string };
    console.log(`SUCCESS: Logged in and received JWT token: ${token.substring(0, 20)}...`);

    // B. Verify GET /me
    console.log('Testing GET /me with valid JWT...');
    const meRes = await fetch(`${API_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!meRes.ok) {
      const errText = await meRes.text();
      throw new Error(`GET /me failed with status ${meRes.status}: ${errText}`);
    }

    const meUser = (await meRes.json()) as any;
    console.log(`SUCCESS: GET /me returned user: ID = ${meUser.id}, username = ${meUser.username}, tenant_id = ${meUser.tenant_id}`);
    if (meUser.id !== user.id) {
      throw new Error('GET /me returned incorrect user details');
    }

    // C. Verify Fail Closed Route: GET /test-no-context
    console.log('Testing GET /test-no-context (which runs query without setting context)...');
    const noContextRes = await fetch(`${API_URL}/test-no-context`);
    if (!noContextRes.ok) {
      const errText = await noContextRes.text();
      throw new Error(`GET /test-no-context failed with status ${noContextRes.status}: ${errText}`);
    }

    const noContextUsers = (await noContextRes.json()) as any[];
    console.log(`GET /test-no-context returned ${noContextUsers.length} users. Expected: 0.`);
    if (noContextUsers.length !== 0) {
      throw new Error('Leak detected! GET /test-no-context returned rows when tenant context was not set.');
    }
    console.log('SUCCESS: GET /test-no-context returned 0 rows (Failed closed at HTTP/middleware layer).');

    console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    console.error('\nFAIL: Verification test encountered an error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
