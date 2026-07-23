const { Client } = require('pg');

async function applyMigration() {
  console.log('Connecting to PostgreSQL as postgres superuser...');
  let client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/sop_saas'
  });

  try {
    await client.connect();
  } catch (e) {
    console.log('Trying connection with empty password...');
    client = new Client({
      connectionString: 'postgresql://postgres@localhost:5432/sop_saas'
    });
    await client.connect();
  }

  try {
    console.log('Executing DDL: Adding work_date column and unique_tenant_user_work_date index...');
    await client.query(`
      ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "work_date" DATE NOT NULL DEFAULT CURRENT_DATE;
      UPDATE "attendance_logs" SET "work_date" = ("check_in_at" AT TIME ZONE 'UTC')::DATE WHERE "work_date" IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "unique_tenant_user_work_date" ON "attendance_logs"("tenant_id", "user_id", "work_date");
    `);

    console.log('Granting SELECT, INSERT, UPDATE permissions to app_user...');
    await client.query(`
      GRANT SELECT, INSERT, UPDATE ON TABLE "attendance_logs" TO app_user;
    `);

    console.log('✓ Migration executed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
