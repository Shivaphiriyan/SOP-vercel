-- =====================================================================
-- SOP SaaS Platform — Initial Database Schema (PostgreSQL)
-- Phase 1: Data model & core security
-- =====================================================================

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. TENANTS  (the "companies" that sign up)
-- =====================================================================
CREATE TABLE tenants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    plan_tier       text NOT NULL DEFAULT 'starter'
                        CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
    billing_status  text NOT NULL DEFAULT 'trial'
                        CHECK (billing_status IN ('trial', 'active', 'past_due', 'cancelled')),
    location_lat      double precision,
    location_lng      double precision,
    location_radius_m double precision,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 2. USERS  (employees; every user belongs to exactly one tenant)
-- =====================================================================
CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username        text NOT NULL,
    password_hash   text NOT NULL,          -- store bcrypt/argon2 hash, never plain text
    role            text NOT NULL DEFAULT 'operator'
                        CHECK (role IN ('admin', 'supervisor', 'operator', 'auditor')),
    status          text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('invited', 'active', 'disabled')),
    hourly_rate     numeric(10,2),          -- NULL until set by an admin; used by payroll calc
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- a username only has to be unique WITHIN a tenant, not globally
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
    is_current      boolean NOT NULL DEFAULT true,   -- flips to false when a new version replaces it
    content         jsonb NOT NULL DEFAULT '{}',     -- steps/text/images live here for v1 simplicity
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. CHECKLIST_RUNS  (one execution of an SOP by one operator)
-- =====================================================================
CREATE TABLE checklist_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sop_id          uuid NOT NULL REFERENCES sop_templates(id),
    operator_id     uuid NOT NULL REFERENCES users(id),
    status          text NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress', 'completed', 'overdue')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

-- =====================================================================
-- 5. STEPS  (individual checklist items inside a run)
-- =====================================================================
CREATE TABLE steps (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    run_id          uuid NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
    description     text NOT NULL,
    evidence_url    text,                    -- optional photo/attachment proof
    completed_by    uuid REFERENCES users(id),
    completed_at    timestamptz
);

-- =====================================================================
-- 6. AUDIT_LOGS  (immutable — append-only, never updated or deleted)
-- =====================================================================
CREATE TABLE audit_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id),
    action          text NOT NULL,           -- e.g. 'sop.viewed', 'step.completed', 'user.login'
    metadata        jsonb NOT NULL DEFAULT '{}',  -- ip, device, sop_id, step_id, etc.
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 7. ATTENDANCE_LOGS  (GPS-tagged check-in / check-out per shift)
-- =====================================================================
CREATE TABLE attendance_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id),
    check_in_at     timestamptz NOT NULL DEFAULT now(),   -- server timestamp, never client-sent
    check_in_lat    double precision,
    check_in_lng    double precision,
    check_in_accuracy_m double precision,
    check_out_at    timestamptz,
    check_out_lat   double precision,
    check_out_lng   double precision,
    check_out_accuracy_m double precision
);

-- =====================================================================
-- 8. LEAVE_REQUESTS  (submitted by operators, reviewed by admin/supervisor)
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
    created_at      timestamptz NOT NULL DEFAULT now(),

    CHECK (end_date >= start_date)
);

-- =====================================================================
-- INDEXES — every tenant_id column should be indexed, since it's on
-- almost every WHERE clause (via RLS) that will ever run against these tables
-- =====================================================================
CREATE INDEX idx_users_tenant            ON users (tenant_id);
CREATE INDEX idx_sop_templates_tenant    ON sop_templates (tenant_id);
CREATE INDEX idx_checklist_runs_tenant   ON checklist_runs (tenant_id);
CREATE INDEX idx_steps_tenant            ON steps (tenant_id);
CREATE INDEX idx_audit_logs_tenant       ON audit_logs (tenant_id);
CREATE INDEX idx_attendance_logs_tenant  ON attendance_logs (tenant_id);
CREATE INDEX idx_leave_requests_tenant   ON leave_requests (tenant_id);

-- =====================================================================
-- ROW-LEVEL SECURITY (RLS) — the core tenant-isolation mechanism
--
-- How this works end to end:
--   1. When a user logs in, your app verifies their password and looks
--      up their tenant_id.
--   2. On EVERY database connection/transaction used to serve that
--      user's request, your app runs:
--           SET app.current_tenant = '<their-tenant-id>';
--   3. Postgres then automatically filters every query against these
--      tables to only rows matching that tenant_id — even if your API
--      code forgets a WHERE clause, or has a bug, or someone tampers
--      with a request.
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

-- Audit logs: enforce append-only at the database level too.
-- No one — not even a company admin — should be able to UPDATE or DELETE a log row.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

-- =====================================================================
-- NOTES FOR BEGINNERS — read before writing app code
-- =====================================================================
--
-- 1. `current_setting('app.current_tenant', true)` — the `true` second
--    argument means "don't error if it's not set, just return null."
--    This matters: if your app *forgets* to set the tenant on a
--    connection, every RLS-protected query will return ZERO rows
--    instead of leaking another tenant's data. Fail closed, not open.
--
-- 2. Your database connection user must NOT be a superuser / table
--    owner for RLS to actually apply. By default, Postgres table
--    owners bypass RLS entirely. Create a dedicated, non-superuser
--    role for your app to connect as, e.g.:
--        CREATE ROLE app_user LOGIN PASSWORD '...';
--        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
--        REVOKE DELETE ON audit_logs FROM app_user;
--
-- 3. In your backend, at the start of every request (inside a
--    transaction), run something like:
--        BEGIN;
--        SET LOCAL app.current_tenant = '<tenant_id from the JWT>';
--        -- ... run your actual queries here ...
--        COMMIT;
--    `SET LOCAL` (not plain `SET`) scopes the setting to just that
--    transaction, so it can never leak into another user's request on
--    a pooled connection.
--
-- 4. The `tenants` table itself has NO RLS policy — that's intentional.
--    There's no "tenant of a tenant." Access to the tenants table
--    should instead be restricted at the application layer (e.g. only
--    an internal admin/support role can query it directly).
--
-- 5. Test isolation constantly as you build: log in as a user in
--    Tenant A, then try to fetch a record ID that belongs to Tenant B
--    directly by its UUID. It should come back as "not found" — not
--    "forbidden." Returning "forbidden" would confirm the record
--    exists, which is a small but real information leak.
-- =====================================================================
