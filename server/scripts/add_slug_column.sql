-- Add slug column and unique constraint
ALTER TABLE "public"."tenants" ADD COLUMN IF NOT EXISTS "slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "public"."tenants" ("slug");
