-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "action_url" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for notifications
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notifications_tenant_id_fkey') THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notifications_recipient_user_id_fkey') THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'notifications_actor_user_id_fkey') THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_recipient_created" ON "notifications"("tenant_id", "recipient_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_recipient_read" ON "notifications"("tenant_id", "recipient_user_id", "is_read");
CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_type" ON "notifications"("tenant_id", "type");

-- RLS for notifications
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_notifications') THEN
        CREATE POLICY tenant_isolation_notifications ON "notifications" USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notifications" TO app_user;

-- 2. Update audit_logs table
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_user_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_name_snapshot" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_email_snapshot" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entity_type" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "entity_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "old_values" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "new_values" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_method" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_path" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'success';

-- Foreign key for audit_logs actor_user_id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'audit_logs_actor_user_id_fkey') THEN
        ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_created" ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_actor" ON "audit_logs"("tenant_id", "actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_action" ON "audit_logs"("tenant_id", "action");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_entity" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- Ensure RLS on audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_audit_logs') THEN
        CREATE POLICY tenant_isolation_audit_logs ON "audit_logs" USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
    END IF;
END $$;

-- Permissions for audit_logs: strictly append-only (SELECT, INSERT)
GRANT SELECT, INSERT ON TABLE "audit_logs" TO app_user;
REVOKE UPDATE, DELETE ON TABLE "audit_logs" FROM app_user;
