import { Router } from 'express';
import { getPrisma } from '../context';
import { authenticateUser, setTenantContext, requireRole } from '../middleware/auth';
import { createAuditLog } from '../services/audit.service';
import { createNotification } from '../services/notification.service';

const router = Router();

// ==========================================
// SOP Management (Restricted to Admins)
// ==========================================

/**
 * POST /sops
 * Create a new SOP template
 */
router.post('/sops', authenticateUser, setTenantContext, requireRole('admin'), async (req, res, next) => {
  const { title, category, content } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Missing title' });
  }

  try {
    const sop = await getPrisma().sop_templates.create({
      data: {
        tenant_id: req.user!.tenantId,
        created_by: req.user!.userId,
        title,
        category: category || null,
        content: content || {},
        version: 1,
        is_current: true
      }
    });

    await createAuditLog(
      {
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: 'sop.created',
        entityType: 'sop_template',
        entityId: sop.id,
        description: `Created SOP procedure template '${sop.title}'`,
        newValues: { title: sop.title, category: sop.category, version: 1 }
      },
      req
    );

    res.status(201).json(sop);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /sops/:id
 * Creates a new version: increments version, archives old, sets new as current.
 */
router.put('/sops/:id', authenticateUser, setTenantContext, requireRole('admin'), async (req, res, next) => {
  const { id } = req.params;
  const { title, category, content } = req.body;

  try {
    // 1. Find the active SOP template version
    const activeSop = await getPrisma().sop_templates.findFirst({
      where: {
        id,
        is_current: true
      }
    });

    if (!activeSop) {
      return res.status(404).json({ error: 'Active SOP template not found' });
    }

    // 2. Set is_current = false on the old row
    await getPrisma().sop_templates.update({
      where: { id: activeSop.id },
      data: { is_current: false }
    });

    // 3. Insert a new row with incremented version and is_current = true
    const newSop = await getPrisma().sop_templates.create({
      data: {
        tenant_id: req.user!.tenantId,
        created_by: req.user!.userId,
        title: title !== undefined ? title : activeSop.title,
        category: category !== undefined ? category : activeSop.category,
        content: content !== undefined ? content : (activeSop.content as any),
        version: activeSop.version + 1,
        is_current: true
      }
    });

    await createAuditLog(
      {
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: 'sop.updated',
        entityType: 'sop_template',
        entityId: newSop.id,
        description: `Updated SOP procedure '${newSop.title}' to version ${newSop.version}`,
        oldValues: { version: activeSop.version },
        newValues: { version: newSop.version, title: newSop.title }
      },
      req
    );

    res.json(newSop);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sops
 * List all current-version SOPs for this tenant
 */
router.get('/sops', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const sops = await (getPrisma().sop_templates as any).findMany({
      where: {
        is_current: true,
        archived: false
      }
    });

    res.json(sops);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Checklist Execution & Public SOP Fetch
// ==========================================

/**
 * GET /sops/:id
 * Fetch a single SOP and insert an audit_logs row (action='sop.viewed')
 */
router.get('/sops/:id', authenticateUser, setTenantContext, async (req, res, next) => {
  const { id } = req.params;

  try {
    const sop = await getPrisma().sop_templates.findUnique({
      where: { id }
    });

    if (!sop) {
      return res.status(404).json({ error: 'SOP template not found' });
    }

    // Insert audit log row
    await createAuditLog(
      {
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: 'sop.viewed',
        entityType: 'sop_template',
        entityId: id,
        description: `Viewed SOP template '${sop.title}'`
      },
      req
    );

    res.json(sop);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /sops/:id
 * Soft-delete (archive) an SOP template. Restricted to admins.
 */
router.delete('/sops/:id', authenticateUser, setTenantContext, requireRole('admin'), async (req, res, next) => {
  const { id } = req.params;

  try {
    const sop = await getPrisma().sop_templates.findUnique({
      where: { id }
    });

    if (!sop) {
      return res.status(404).json({ error: 'SOP template not found' });
    }

    const updated = await (getPrisma().sop_templates as any).update({
      where: { id },
      data: { archived: true }
    });

    // Insert audit log row
    await createAuditLog(
      {
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: 'sop.deleted',
        entityType: 'sop_template',
        entityId: id,
        description: `Archived SOP template '${sop.title}'`
      },
      req
    );

    res.json({ message: 'SOP template deleted successfully', sop: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /checklist-runs/me
 * Fetch all pending checklist runs assigned to the logged-in operator
 */
router.get('/checklist-runs/me', authenticateUser, setTenantContext, async (req, res, next) => {
  try {
    const runs = await getPrisma().checklist_runs.findMany({
      where: {
        operator_id: req.user!.userId,
        status: { not: 'completed' }
      },
      include: {
        sop_templates: {
          select: { title: true, category: true, content: true }
        },
        steps: {
          select: { id: true, completed_at: true }
        }
      },
      orderBy: { started_at: 'desc' }
    });
    res.json(runs);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /checklist-runs/:id
 * Fetch a specific checklist run by ID
 */
router.get('/checklist-runs/:id', authenticateUser, setTenantContext, async (req, res, next) => {
  const { id } = req.params;
  try {
    const run = await getPrisma().checklist_runs.findUnique({
      where: { id },
      include: {
        sop_templates: true,
        steps: { orderBy: { id: 'asc' } }
      }
    });

    if (!run) {
      return res.status(404).json({ error: 'Checklist run not found' });
    }

    res.json(run);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /checklist-runs
 * Start a run for a given sopId (creates checklist_runs + steps rows)
 */
router.post('/checklist-runs', authenticateUser, setTenantContext, async (req, res, next) => {
  const { sopId, operatorId } = req.body;

  if (!sopId) {
    return res.status(400).json({ error: 'Missing sopId' });
  }

  try {
    // 1. Fetch template
    const sop = await getPrisma().sop_templates.findUnique({
      where: { id: sopId }
    });

    if (!sop) {
      return res.status(404).json({ error: 'SOP template not found' });
    }

    let targetOperatorId = req.user!.userId;
    if (operatorId && ['admin', 'supervisor'].includes(req.user!.role)) {
      const targetUser = await getPrisma().users.findFirst({
        where: { id: operatorId }
      });
      if (!targetUser) {
        return res.status(404).json({ error: 'Assigned operator not found' });
      }
      targetOperatorId = operatorId;
    }

    // 2. Create the checklist run
    const run = await getPrisma().checklist_runs.create({
      data: {
        tenant_id: req.user!.tenantId,
        sop_id: sopId,
        operator_id: targetOperatorId,
        status: 'in_progress'
      }
    });

    // 3. Extract step descriptions from SOP content
    let stepDescriptions: string[] = [];
    if (sop.content && typeof sop.content === 'object') {
      const contentObj = sop.content as any;
      if (Array.isArray(contentObj.steps)) {
        stepDescriptions = contentObj.steps.map((s: any) => {
          if (typeof s === 'string') return s;
          if (s && typeof s === 'object' && typeof s.description === 'string') return s.description;
          return '';
        }).filter((s: string) => s.length > 0);
      } else if (Array.isArray(contentObj)) {
        stepDescriptions = contentObj.map((s: any) => {
          if (typeof s === 'string') return s;
          if (s && typeof s === 'object' && typeof s.description === 'string') return s.description;
          return '';
        }).filter((s: string) => s.length > 0);
      }
    }

    if (stepDescriptions.length === 0) {
      stepDescriptions = ['Default step'];
    }

    // 4. Create the steps in DB
    const stepsData = stepDescriptions.map((desc) => ({
      tenant_id: req.user!.tenantId,
      run_id: run.id,
      description: desc
    }));

    await getPrisma().steps.createMany({
      data: stepsData
    });

    // Retrieve full steps
    const steps = await getPrisma().steps.findMany({
      where: { run_id: run.id }
    });

    await createAuditLog(
      {
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: 'sop.assigned',
        entityType: 'checklist_run',
        entityId: run.id,
        description: `Assigned SOP '${sop.title}' checklist run to user '${targetOperatorId}'`,
        newValues: { runId: run.id, sopId: sop.id, operatorId: targetOperatorId }
      },
      req
    );

    if (targetOperatorId !== req.user!.userId) {
      await createNotification({
        tenantId: req.user!.tenantId,
        recipientUserId: targetOperatorId,
        actorUserId: req.user!.userId,
        type: 'sop_assigned',
        title: 'New SOP Assigned',
        message: `You have been assigned a new checklist run for '${sop.title}'.`,
        entityType: 'checklist_run',
        entityId: run.id,
        actionUrl: '/sops'
      });
    }

    res.status(201).json({ run, steps });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /checklist-runs/:runId/steps/:stepId
 * Mark a step complete (sets completed_by and completed_at on server-side)
 */
router.patch('/checklist-runs/:runId/steps/:stepId', authenticateUser, setTenantContext, async (req, res, next) => {
  const { runId, stepId } = req.params;
  const { evidence_url, is_complete } = req.body || {};

  try {
    const step = await getPrisma().steps.findFirst({
      where: {
        id: stepId,
        run_id: runId
      }
    });

    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const updateData: any = {};
    if (evidence_url !== undefined) {
      updateData.evidence_url = evidence_url;
    }

    if (is_complete !== false) {
      updateData.completed_by = req.user!.userId;
      updateData.completed_at = new Date();
    }

    const updatedStep = await getPrisma().steps.update({
      where: { id: step.id },
      data: updateData
    });

    if (evidence_url) {
      await createAuditLog(
        {
          tenantId: req.user!.tenantId,
          actorUserId: req.user!.userId,
          action: 'evidence.submitted',
          entityType: 'step',
          entityId: stepId,
          description: `Submitted evidence photo for step '${step.description}'`,
          newValues: { evidence_url }
        },
        req
      );
    }

    res.json(updatedStep);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /sops/:id/sign
 * Signs a checklist run: verifies steps are complete, updates status, and inserts audit log.
 */
router.post('/sops/:id/sign', authenticateUser, setTenantContext, async (req, res, next) => {
  const { id: sopId } = req.params;
  const { runId } = req.body;

  if (!runId) {
    return res.status(400).json({ error: 'Missing runId' });
  }

  try {
    // 1. Fetch checklist run
    const run = await getPrisma().checklist_runs.findFirst({
      where: {
        id: runId,
        sop_id: sopId
      }
    });

    if (!run) {
      return res.status(404).json({ error: 'Checklist run not found for this SOP' });
    }

    // 2. Fetch steps and verify ALL are completed
    const steps = await getPrisma().steps.findMany({
      where: { run_id: runId }
    });

    if (steps.length === 0) {
      return res.status(400).json({ error: 'Checklist run has no steps' });
    }

    const allCompleted = steps.every((s) => s.completed_at !== null);
    if (!allCompleted) {
      return res.status(400).json({ error: 'Cannot sign SOP: Not all steps are completed' });
    }

    // 3. Update checklist run status to completed and set completed_at
    const updatedRun = await getPrisma().checklist_runs.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completed_at: new Date()
      }
    });

    // 4. Fetch the SOP version
    const sop = await getPrisma().sop_templates.findUnique({
      where: { id: sopId }
    });
    const version = sop ? sop.version : 1;

    // 5. Create audit log row
    await createAuditLog(
      {
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: 'sop.signed',
        entityType: 'checklist_run',
        entityId: runId,
        description: `Completed and signed checklist run for '${sop?.title || sopId}' (v${version})`,
        newValues: { status: 'completed', completed_at: updatedRun.completed_at }
      },
      req
    );

    res.json({ success: true, run: updatedRun });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /checklist-runs
 * Fetch all checklist runs for the current tenant (Admin, Supervisor, Auditor only)
 */
router.get('/checklist-runs', authenticateUser, setTenantContext, async (req, res, next) => {
  if (!['admin', 'supervisor', 'auditor'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const runs = await getPrisma().checklist_runs.findMany({
      include: {
        sop_templates: {
          select: { title: true, category: true, version: true }
        },
        users: {
          select: { username: true }
        },
        steps: {
          select: { id: true, completed_at: true }
        }
      },
      orderBy: { started_at: 'desc' }
    });
    res.json(runs);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /checklist-runs/:runId/admin-complete
 * Force complete a checklist run by an admin or supervisor. Requires a reason.
 */
router.patch('/checklist-runs/:runId/admin-complete', authenticateUser, setTenantContext, async (req, res, next) => {
  const { role, userId } = req.user!;
  if (role !== 'admin' && role !== 'supervisor') {
    return res.status(403).json({ error: 'Access denied. Admin or supervisor role required.' });
  }

  const { runId } = req.params;
  const { reason } = req.body || {};

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'A valid override reason is mandatory.' });
  }

  try {
    const run = await getPrisma().checklist_runs.findFirst({
      where: {
        id: runId
      }
    });

    if (!run) {
      return res.status(404).json({ error: 'Checklist run not found' });
    }

    if (run.status !== 'in_progress') {
      return res.status(400).json({ error: 'Only in-progress checklist runs can be force-completed.' });
    }

    const db = getPrisma();
    // 1. Update checklist run status
    const updatedRun = await db.checklist_runs.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completed_at: new Date(),
        completed_by_admin_override: true,
        overridden_by: userId,
        override_reason: reason.trim()
      }
    });

    // 2. Log in audit_logs
    await createAuditLog(
      {
        tenantId: run.tenant_id,
        actorUserId: userId,
        action: 'checklist.admin_override_complete',
        entityType: 'checklist_run',
        entityId: run.id,
        description: `Admin override: Force completed checklist run with reason '${reason.trim()}'`,
        newValues: { status: 'completed', override_reason: reason.trim() }
      },
      req
    );

    res.json(updatedRun);
  } catch (error) {
    next(error);
  }
});

export default router;
