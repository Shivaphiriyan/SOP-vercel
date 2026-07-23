const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Connecting to PostgreSQL as superuser...');
  const client = new Client({
    connectionString: 'postgresql://postgres:root@localhost:5432/sop_saas'
  });

  try {
    await client.connect();
    const migrationSqlPath = path.join(__dirname, '../prisma/migrations/20260723103000_add_notifications_and_audit_logs/migration.sql');
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    console.log('Executing Notifications & Audit Logs DDL migration...');
    await client.query(sql);
    console.log('✓ Migration executed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
