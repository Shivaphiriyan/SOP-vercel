import { prisma } from '../src/context';
import bcrypt from 'bcrypt';

async function main() {
  console.log('--- STARTING SOP & CHECKLIST EXECUTION VERIFICATION ---');

  const API_URL = 'http://localhost:5000';

  try {
    // 1. Log in to get the JWT token
    console.log('1. Logging in as admin...');
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
      const errText = await loginRes.text();
      throw new Error(`Login failed with status ${loginRes.status}: ${errText}`);
    }

    const { token } = (await loginRes.json()) as { token: string };
    console.log('JWT Token acquired successfully!');

    // Get the tenant ID from the database for verification purposes later
    const tenant = await prisma.tenants.findFirst({ where: { name: 'Acme Co.' } });
    if (!tenant) throw new Error('Tenant Acme Co. not found in DB');
    const tenantId = tenant.id;

    // 2. Create a new SOP template (POST /sops)
    console.log('\n2. Creating a new SOP template...');
    const createRes = await fetch(`${API_URL}/sops`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Fire Safety Protocol',
        category: 'Safety',
        content: {
          steps: [
            'Alert supervisor and pull fire alarm',
            'Evacuate building immediately via nearest stairs',
            'Assemble at designated parking zone'
          ]
        }
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`SOP creation failed with status ${createRes.status}: ${errText}`);
    }

    const sop = (await createRes.json()) as any;
    console.log(`SUCCESS: SOP created. ID = ${sop.id}, version = ${sop.version}, is_current = ${sop.is_current}`);

    // 3. Create a new version of the SOP template (PUT /sops/:id)
    console.log('\n3. Creating a new version of the SOP template...');
    const updateRes = await fetch(`${API_URL}/sops/${sop.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Fire Safety Protocol (Updated)',
        category: 'Safety',
        content: {
          steps: [
            'Alert supervisor and pull fire alarm immediately',
            'Evacuate building immediately via nearest stairs',
            'Assemble at designated parking zone A'
          ]
        }
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`SOP version update failed with status ${updateRes.status}: ${errText}`);
    }

    const updatedSop = (await updateRes.json()) as any;
    console.log(`SUCCESS: New version created. ID = ${updatedSop.id}, version = ${updatedSop.version}, is_current = ${updatedSop.is_current}`);

    // Verify in DB that the previous version has is_current = false
    const previousSop = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return await tx.sop_templates.findUnique({ where: { id: sop.id } });
    });
    console.log(`Old SOP version check: is_current = ${previousSop?.is_current} (Expected: false)`);

    // 4. Fetch the single SOP (GET /sops/:id)
    console.log('\n4. Fetching a single SOP to trigger viewing audit log...');
    const getRes = await fetch(`${API_URL}/sops/${updatedSop.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!getRes.ok) {
      const errText = await getRes.text();
      throw new Error(`Fetching SOP failed with status ${getRes.status}: ${errText}`);
    }

    const fetchedSop = (await getRes.json()) as any;
    console.log(`SUCCESS: Fetched SOP ID = ${fetchedSop.id}`);

    // Verify in DB that the 'sop.viewed' audit log row is created
    const viewedAuditLogs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return await tx.audit_logs.findMany({
        where: {
          action: 'sop.viewed',
          tenant_id: tenantId
        }
      });
    });

    console.log(`Audit logs with action 'sop.viewed' count: ${viewedAuditLogs.length} (Expected: >= 1)`);
    if (viewedAuditLogs.length === 0) {
      throw new Error('Audit log row for viewed action was not created');
    }
    console.log('First viewed audit log entry metadata:', JSON.stringify(viewedAuditLogs[0].metadata));

    // 5. Start a run (POST /checklist-runs)
    console.log('\n5. Starting checklist run for the updated SOP template...');
    const startRunRes = await fetch(`${API_URL}/checklist-runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sopId: updatedSop.id })
    });

    if (!startRunRes.ok) {
      const errText = await startRunRes.text();
      throw new Error(`Starting checklist run failed with status ${startRunRes.status}: ${errText}`);
    }

    const runData = (await startRunRes.json()) as any;
    const runId = runData.run.id;
    const steps = runData.steps;
    console.log(`SUCCESS: Checklist run started. ID = ${runId}. Generated ${steps.length} steps.`);

    // 6. Test fail-to-sign if steps are incomplete (POST /sops/:id/sign)
    console.log('\n6. Testing signature rejection when steps are incomplete...');
    const preSignRes = await fetch(`${API_URL}/sops/${updatedSop.id}/sign`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ runId })
    });

    console.log(`Rejection test status: ${preSignRes.status} (Expected: 400)`);
    if (preSignRes.status !== 400) {
      throw new Error(`Allowed signing of checklist run when steps were incomplete (status = ${preSignRes.status})`);
    }
    const preSignErr = await preSignRes.json() as any;
    console.log('Rejection error message:', preSignErr.error);

    // 7. Complete each step in checklist run (PATCH /checklist-runs/:runId/steps/:stepId)
    console.log('\n7. Completing checklist run steps...');
    for (const step of steps) {
      console.log(`Completing step: "${step.description}"`);
      const stepRes = await fetch(`${API_URL}/checklist-runs/${runId}/steps/${step.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!stepRes.ok) {
        const errText = await stepRes.text();
        throw new Error(`Completing step failed with status ${stepRes.status}: ${errText}`);
      }

      const completedStep = (await stepRes.json()) as any;
      console.log(`Step complete. completed_by = ${completedStep.completed_by}, completed_at = ${completedStep.completed_at}`);
    }

    // 8. Sign the checklist run (POST /sops/:id/sign)
    console.log('\n8. Signing the checklist run with all steps complete...');
    const signRes = await fetch(`${API_URL}/sops/${updatedSop.id}/sign`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ runId })
    });

    if (!signRes.ok) {
      const errText = await signRes.text();
      throw new Error(`Signing failed with status ${signRes.status}: ${errText}`);
    }

    const signData = (await signRes.json()) as any;
    console.log(`SUCCESS: Checklist run signed. status = ${signData.run.status}, completed_at = ${signData.run.completed_at}`);

    // Verify in DB that the 'sop.signed' audit log row is created with correct metadata
    const signedAuditLogs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return await tx.audit_logs.findMany({
        where: {
          action: 'sop.signed',
          tenant_id: tenantId
        }
      });
    });

    console.log(`Audit logs with action 'sop.signed' count: ${signedAuditLogs.length} (Expected: >= 1)`);
    if (signedAuditLogs.length === 0) {
      throw new Error('Audit log row for signed action was not created');
    }
    console.log('First signed audit log entry metadata:', JSON.stringify(signedAuditLogs[0].metadata));

    // 9. Verify Audit Log Immutability (UPDATE / DELETE rejections)
    console.log('\n9. --- VERIFYING AUDIT LOG IMMUTABILITY ---');
    const targetLogId = signedAuditLogs[0].id;

    console.log('Attempting to UPDATE the audit_logs entry directly in the DB...');
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
        await tx.$executeRawUnsafe(`UPDATE audit_logs SET action = 'tampered' WHERE id = '${targetLogId}'`);
      });
      throw new Error('CRITICAL SECURITY BREACH: Database allowed UPDATE on audit_logs table!');
    } catch (error: any) {
      console.log('SUCCESS: Database rejected UPDATE on audit_logs.');
      console.log('Database Error Code:', error.code || 'N/A');
      console.log('Database Error Message:\n', error.message || error);
    }

    console.log('\nAttempting to DELETE the audit_logs entry directly from the DB...');
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
        await tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = '${targetLogId}'`);
      });
      throw new Error('CRITICAL SECURITY BREACH: Database allowed DELETE on audit_logs table!');
    } catch (error: any) {
      console.log('SUCCESS: Database rejected DELETE on audit_logs.');
      console.log('Database Error Code:', error.code || 'N/A');
      console.log('Database Error Message:\n', error.message || error);
    }

    console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');

  } catch (error) {
    console.error('\nFAIL: Verification test encountered an error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
