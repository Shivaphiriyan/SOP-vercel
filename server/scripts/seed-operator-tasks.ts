import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const tenants = await prisma.tenants.findMany();
    let targetTenantId = null;
    let operator = null;

    for (const tenant of tenants) {
      const users = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenant.id}'`);
        return await tx.users.findMany({
          where: { username: 'operator1' }
        });
      });

      if (users.length > 0) {
        operator = users[0];
        targetTenantId = tenant.id;
        break;
      }
    }

    if (!operator) {
      console.log('Operator1 not found in any tenant.');
      return;
    }

    console.log(`Found operator in tenant ${targetTenantId}`);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${targetTenantId}'`);
      
      const sops = await tx.sop_templates.findMany({
        where: { tenant_id: targetTenantId, is_current: true },
        take: 2
      });

      if (sops.length === 0) {
        console.log('No SOPs found');
        return;
      }

      for (const sop of sops) {
        const existingRun = await tx.checklist_runs.findFirst({
          where: { operator_id: operator.id, sop_id: sop.id, status: 'in_progress' }
        });

        if (!existingRun) {
          const run = await tx.checklist_runs.create({
            data: {
              tenant_id: targetTenantId,
              sop_id: sop.id,
              operator_id: operator.id,
              status: 'in_progress'
            }
          });

          let stepDescriptions = [];
          if (sop.content && typeof sop.content === 'object') {
            const contentObj = sop.content as any;
            if (Array.isArray(contentObj.steps)) {
              stepDescriptions = contentObj.steps.map((s: any) => s.description || '').filter(Boolean);
            } else if (Array.isArray(contentObj)) {
              stepDescriptions = contentObj.map((s: any) => s.description || '').filter(Boolean);
            }
          }

          if (stepDescriptions.length === 0) {
            stepDescriptions = ['Default step'];
          }

          const stepsData = stepDescriptions.map((desc: string) => ({
            tenant_id: targetTenantId,
            run_id: run.id,
            description: desc
          }));

          await tx.steps.createMany({
            data: stepsData
          });
          
          console.log(`Seeded checklist run for SOP: ${sop.title}`);
        } else {
          console.log(`Checklist run already exists for SOP: ${sop.title}`);
        }
      }
    });

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
