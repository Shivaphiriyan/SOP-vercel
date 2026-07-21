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

  console.log(`Tenant: Acme Co. (${tenant.id})`);

  // Bypass RLS in a transaction
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
    
    const sops = await tx.sop_templates.findMany({
      orderBy: [{ title: 'asc' }, { version: 'asc' }]
    });

    const runs = await tx.checklist_runs.findMany({
      orderBy: { started_at: 'desc' }
    });

    return { sops, runs };
  });

  console.log('\n--- SOP TEMPLATES ---');
  for (const s of result.sops) {
    console.log(`ID: ${s.id} | Title: "${s.title}" | Version: ${s.version} | is_current: ${s.is_current} | archived: ${s.archived} | content steps: ${JSON.stringify((s.content as any)?.steps?.map((st: any) => st.description) || [])}`);
  }

  console.log('\n--- CHECKLIST RUNS ---');
  for (const r of result.runs) {
    console.log(`ID: ${r.id} | SOP ID: ${r.sop_id} | Status: ${r.status}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
