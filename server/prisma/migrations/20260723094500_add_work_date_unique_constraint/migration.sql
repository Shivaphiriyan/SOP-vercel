-- AlterTable: Add work_date column to attendance_logs
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "work_date" DATE NOT NULL DEFAULT CURRENT_DATE;

-- Populate work_date from check_in_at for any pre-existing rows
UPDATE "attendance_logs" SET "work_date" = ("check_in_at" AT TIME ZONE 'UTC')::DATE WHERE "work_date" IS NULL;

-- CreateUniqueIndex: unique_tenant_user_work_date
CREATE UNIQUE INDEX IF NOT EXISTS "unique_tenant_user_work_date" ON "attendance_logs"("tenant_id", "user_id", "work_date");
