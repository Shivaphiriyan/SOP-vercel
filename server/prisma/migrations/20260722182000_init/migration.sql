-- =====================================================================
-- Production Initial Database Migration (Prisma + PostgreSQL RLS)
-- =====================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tenants Table
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "plan_tier" TEXT NOT NULL DEFAULT 'starter',
    "billing_status" TEXT NOT NULL DEFAULT 'trial',
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "location_radius_m" DOUBLE PRECISION,
    "leave_notice_days" INTEGER DEFAULT 3,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenants_plan_tier_check" CHECK ("plan_tier" IN ('starter', 'growth', 'enterprise')),
    CONSTRAINT "tenants_billing_status_check" CHECK ("billing_status" IN ('trial', 'active', 'past_due', 'cancelled'))
);

-- 3. Users Table
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "status" TEXT NOT NULL DEFAULT 'active',
    "hourly_rate" DECIMAL(10,2),
    "page_permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_role_check" CHECK ("role" IN ('admin', 'supervisor', 'operator', 'auditor')),
    CONSTRAINT "users_status_check" CHECK ("status" IN ('invited', 'active', 'disabled')),
    CONSTRAINT "users_tenant_id_username_key" UNIQUE ("tenant_id", "username"),
    CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- 4. SOP Templates Table
CREATE TABLE "sop_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB NOT NULL DEFAULT '{}',
    "archived" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sop_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sop_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "sop_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 5. Checklist Runs Table
CREATE TABLE "checklist_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sop_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_admin_override" BOOLEAN NOT NULL DEFAULT false,
    "overridden_by" UUID,
    "override_reason" TEXT,

    CONSTRAINT "checklist_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "checklist_runs_status_check" CHECK ("status" IN ('in_progress', 'completed', 'overdue')),
    CONSTRAINT "checklist_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "checklist_runs_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sop_templates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "checklist_runs_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 6. Steps Table
CREATE TABLE "steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_url" TEXT,
    "completed_by" UUID,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "steps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "checklist_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "steps_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 7. Audit Logs Table
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 8. Attendance Logs Table
CREATE TABLE "attendance_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "check_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_in_lat" DOUBLE PRECISION,
    "check_in_lng" DOUBLE PRECISION,
    "check_in_accuracy_m" DOUBLE PRECISION,
    "check_out_at" TIMESTAMPTZ(6),
    "check_out_lat" DOUBLE PRECISION,
    "check_out_lng" DOUBLE PRECISION,
    "check_out_accuracy_m" DOUBLE PRECISION,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "attendance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 9. Leave Requests Table
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'declined')),
    CONSTRAINT "leave_requests_date_check" CHECK ("end_date" >= "start_date"),
    CONSTRAINT "leave_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "leave_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- 10. Indexes
CREATE INDEX "idx_users_tenant" ON "users"("tenant_id");
CREATE INDEX "idx_sop_templates_tenant" ON "sop_templates"("tenant_id");
CREATE INDEX "idx_checklist_runs_tenant" ON "checklist_runs"("tenant_id");
CREATE INDEX "idx_steps_tenant" ON "steps"("tenant_id");
CREATE INDEX "idx_audit_logs_tenant" ON "audit_logs"("tenant_id");
CREATE INDEX "idx_attendance_logs_tenant" ON "attendance_logs"("tenant_id");
CREATE INDEX "idx_leave_requests_tenant" ON "leave_requests"("tenant_id");

-- 11. Row-Level Security (RLS) Enablement & Forced Security for Table Owners
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "sop_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sop_templates" FORCE ROW LEVEL SECURITY;

ALTER TABLE "checklist_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_runs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "steps" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "attendance_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_logs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_requests" FORCE ROW LEVEL SECURITY;

-- 12. RLS Tenant Isolation Policies
CREATE POLICY "tenant_isolation_users" ON "users"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY "tenant_isolation_sop_templates" ON "sop_templates"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY "tenant_isolation_checklist_runs" ON "checklist_runs"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY "tenant_isolation_steps" ON "steps"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY "tenant_isolation_audit_logs" ON "audit_logs"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY "tenant_isolation_attendance_logs" ON "attendance_logs"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY "tenant_isolation_leave_requests" ON "leave_requests"
    FOR ALL USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

-- 13. Optional Role Grants (Conditional for non-owner app_user role if provisioned)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE "tenants" TO app_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE "users" TO app_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE "sop_templates" TO app_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE "checklist_runs" TO app_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE "steps" TO app_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE "attendance_logs" TO app_user;
    GRANT SELECT, INSERT, UPDATE ON TABLE "leave_requests" TO app_user;
    GRANT SELECT, INSERT ON TABLE "audit_logs" TO app_user;
    REVOKE UPDATE, DELETE ON TABLE "audit_logs" FROM app_user;
  END IF;
END $$;
