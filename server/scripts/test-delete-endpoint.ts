import { prisma } from '../src/context';

async function main() {
  const API_URL = 'http://localhost:5000';
  
  // 1. Log in
  console.log('Logging in as admin...');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'testpass123',
      tenantSlug: 'acme-co'
    })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }
  
  const { token } = (await loginRes.json()) as { token: string };
  console.log('JWT Token acquired successfully!');

  const tenant = await prisma.tenants.findFirst({ where: { name: 'Acme Co.' } });
  if (!tenant) throw new Error('Tenant Acme Co. not found');

  // Find a current SOP that has checklist runs
  const sop = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
    // Find an SOP that has runs
    const run = await tx.checklist_runs.findFirst();
    if (!run) return null;
    return await tx.sop_templates.findUnique({
      where: { id: run.sop_id }
    });
  });

  if (!sop) {
    console.log('No current, unarchived SOP found in database');
    return;
  }

  console.log(`Found SOP to delete via API: ID=${sop.id}, Title="${sop.title}"`);

  // Call DELETE endpoint
  console.log(`Sending DELETE /sops/${sop.id}...`);
  const deleteRes = await fetch(`${API_URL}/sops/${sop.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`Response Status: ${deleteRes.status}`);
  const deleteData = await deleteRes.json();
  console.log('Response Body:', deleteData);
}

main()
  .catch((e) => console.error('Error executing test-delete-endpoint:', e))
  .finally(() => prisma.$disconnect());
