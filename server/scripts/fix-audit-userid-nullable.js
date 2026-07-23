const { Client } = require('pg');

async function run() {
  console.log('Connecting to PostgreSQL as superuser...');
  const client = new Client({
    connectionString: 'postgresql://postgres:root@localhost:5432/sop_saas'
  });

  try {
    await client.connect();
    console.log('Altering audit_logs user_id column to DROP NOT NULL...');
    await client.query(`
      ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
    `);
    console.log('✓ Column user_id is now nullable!');
  } catch (err) {
    console.error('Failed to alter column:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
