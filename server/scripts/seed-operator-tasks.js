const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://app_user:sop123@localhost:5432/sop_saas'
    }
  }
});

async function run() {
  try {
    const operator = await prisma.users.findFirst({
      where: { username: 'operator1' }
    });

    if (!operator) {
      console.log('Operator1 not found');
      // show all users
      const users = await prisma.users.findMany();
      console.log(users.map(u => u.username));
      return;
    }

    const sops = await prisma.sop_templates.findMany({
      where: { tenant_id: operator.tenant_id, is_current: true },
      take: 2
    });

    if (sops.length === 0) {
      console.log('No SOPs found');
      // let's create a test SOP
      const sop = await prisma.sop_templates.create({
        data: {
          tenant_id: operator.tenant_id,
          created_by: operator.id,
          title: 'Daily Store Opening Checklist',
          category: 'Operations',
          content: {
            status: 'published',
            steps: [
              { description: 'Unlock front door', requiresPhoto: false },
              { description: 'Turn on lights', requiresPhoto: false },
              { description: 'Take photo of clean floor', requiresPhoto: true }
            ]
          }
        }
      });
      sops.push(sop);
    }

    for (const sop of sops) {
      const existingRun = await prisma.checklist_runs.findFirst({
        where: { operator_id: operator.id, sop_id: sop.id, status: 'in_progress' }
      });

      if (!existingRun) {
        const run = await prisma.checklist_runs.create({
          data: {
            tenant_id: operator.tenant_id,
            sop_id: sop.id,
            operator_id: operator.id,
            status: 'in_progress'
          }
        });

        let stepDescriptions = [];
        let requiresPhotoFlags = [];
        if (sop.content && typeof sop.content === 'object') {
          const contentObj = sop.content;
          if (Array.isArray(contentObj.steps)) {
            stepDescriptions = contentObj.steps.map((s) => s.description || '').filter(Boolean);
            requiresPhotoFlags = contentObj.steps.map((s) => s.requiresPhoto || false);
          } else if (Array.isArray(contentObj)) {
            stepDescriptions = contentObj.map((s) => s.description || '').filter(Boolean);
            requiresPhotoFlags = contentObj.map((s) => s.requiresPhoto || false);
          }
        }

        if (stepDescriptions.length === 0) {
          stepDescriptions = ['Default step'];
          requiresPhotoFlags = [false];
        }

        const stepsData = stepDescriptions.map((desc, idx) => ({
          tenant_id: operator.tenant_id,
          run_id: run.id,
          description: desc
        }));

        await prisma.steps.createMany({
          data: stepsData
        });
        
        console.log(`Seeded checklist run for SOP: ${sop.title}`);
      } else {
        console.log(`Checklist run already exists for SOP: ${sop.title}`);
      }
    }

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
