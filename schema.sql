-- =====================================================================
-- SOP SaaS Platform — Database Schema (PostgreSQL)
-- Fully updated for Production Deployment
-- =====================================================================

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. TENANTS  (the "companies" that sign up)
-- =====================================================================
CREATE TABLE tenants (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    plan_tier         text NOT NULL DEFAULT 'starter'
                        CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
    billing_status    text NOT NULL DEFAULT 'trial'
                        CHECK (billing_status IN ('trial', 'active', 'past_due', 'cancelled')),
    location_lat      double precision,
    location_lng      double precision,
    location_radius_m double precision,
    leave_notice_days integer DEFAULT 3,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 2. USERS  (employees; every user belongs to exactly one tenant)
-- =====================================================================
CREATE TABLE users (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username          text NOT NULL,
    password_hash     text NOT NULL,          -- bcrypt/argon2 hash
    role              text NOT NULL DEFAULT 'operator'
                        CHECK (role IN ('admin', 'supervisor', 'operator', 'auditor', 'employee')),
    status            text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('invited', 'active', 'disabled')),
    hourly_rate       numeric(10,2),          -- payroll calc
    page_permissions  jsonb DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),

    -- unique username per tenant
    UNIQUE (tenant_id, username)
);

-- =====================================================================
-- 3. SOP_TEMPLATES  (the procedures themselves, versioned)
-- =====================================================================
CREATE TABLE sop_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by      uuid NOT NULL REFERENCES users(id),
    title           text NOT NULL,
    category        text,
    version         int  NOT NULL DEFAULT 1,
    is_current      boolean NOT NULL DEFAULT true,   -- false when replaced by newer version
    content         jsonb NOT NULL DEFAULT '{}',     -- steps layout
    archived        boolean DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. CHECKLIST_RUNS  (one execution of an SOP by one operator)
-- =====================================================================
CREATE TABLE checklist_runs (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sop_id                        uuid NOT NULL REFERENCES sop_templates(id),
    operator_id                   uuid NOT NULL REFERENCES users(id),
    status                        text NOT NULL DEFAULT 'in_progress'
                                      CHECK (status IN ('in_progress', 'completed', 'overdue')),
    started_at                    timestamptz NOT NULL DEFAULT now(),
    completed_at                  timestamptz,
    completed_by_admin_override   boolean DEFAULT false,
    overridden_by                 uuid,
    override_reason               text
);

-- =====================================================================
-- 5. STEPS  (individual checklist items inside a run)
-- =====================================================================
CREATE TABLE steps (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    run_id          uuid NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
    description     text NOT NULL,
    evidence_url    text,                    -- photo upload URL
    completed_by    uuid REFERENCES users(id),
    completed_at    timestamptz
);

-- =====================================================================
-- 6. AUDIT_LOGS  (immutable — append-only)
-- =====================================================================
CREATE TABLE audit_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id),
    action          text NOT NULL,           -- e.g. 'sop.viewed', 'step.completed'
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 7. ATTENDANCE_LOGS  (GPS check-in / check-out)
-- =====================================================================
CREATE TABLE attendance_logs (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id               uuid NOT NULL REFERENCES users(id),
    check_in_at           timestamptz NOT NULL DEFAULT now(),
    check_in_lat          double precision,
    check_in_lng          double precision,
    check_in_accuracy_m   double precision,
    check_out_at          timestamptz,
    check_out_lat         double precision,
    check_out_lng         double precision,
    check_out_accuracy_m  double precision
);

-- =====================================================================
-- 8. LEAVE_REQUESTS  (submitted by operators, reviewed by supervisor/admin)
-- =====================================================================
CREATE TABLE leave_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id),
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    reason          text,
    status          text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'declined')),
    reviewed_by     uuid REFERENCES users(id),
    reviewed_at     timestamptz,
    is_emergency    boolean DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (end_date >= start_date)
);

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX idx_users_tenant            ON users (tenant_id);
CREATE INDEX idx_sop_templates_tenant    ON sop_templates (tenant_id);
CREATE INDEX idx_checklist_runs_tenant   ON checklist_runs (tenant_id);
CREATE INDEX idx_steps_tenant            ON steps (tenant_id);
CREATE INDEX idx_audit_logs_tenant       ON audit_logs (tenant_id);
CREATE INDEX idx_attendance_logs_tenant  ON attendance_logs (tenant_id);
CREATE UNIQUE INDEX idx_attendance_logs_active_user ON attendance_logs (tenant_id, user_id) WHERE check_out_at IS NULL;
CREATE INDEX idx_leave_requests_tenant   ON leave_requests (tenant_id);

-- =====================================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================================
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users
    ON users USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_sop_templates
    ON sop_templates USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_checklist_runs
    ON checklist_runs USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_steps
    ON steps USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_audit_logs
    ON audit_logs USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_attendance_logs
    ON attendance_logs USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_leave_requests
    ON leave_requests USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- =====================================================================
-- ROLES & GRANULAR DML PERMISSIONS
-- =====================================================================

-- Note: Run these commands as the superuser/owner to set up the restricted app_user role.
-- CREATE ROLE app_user WITH LOGIN PASSWORD 'your-strong-password-here';

-- Grant SELECT, INSERT, and UPDATE permissions to app_user (no DELETE, enforcing soft delete)
GRANT SELECT, INSERT, UPDATE ON TABLE tenants TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE users TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE sop_templates TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE checklist_runs TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE steps TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE attendance_logs TO app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE leave_requests TO app_user;

-- audit_logs: strictly append-only. Grant SELECT and INSERT. Revoke UPDATE and DELETE.
GRANT SELECT, INSERT ON TABLE audit_logs TO app_user;
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM app_user;
