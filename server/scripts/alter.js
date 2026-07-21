const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/sop_saas'
  });
  
  try {
    await client.connect();
    await client.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false;');
    console.log('Success!');
  } catch (err) {
    console.error('Failed to alter as postgres:', err.message);
    
    try {
      console.log('Trying with postgres (no password)...');
      const client2 = new Client({
        connectionString: 'postgresql://postgres@localhost:5432/sop_saas'
      });
      await client2.connect();
      await client2.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false;');
      console.log('Success with no password!');
      await client2.end();
    } catch (err2) {
      console.error('Failed with no password:', err2.message);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

run();
