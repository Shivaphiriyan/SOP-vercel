import { Client } from 'pg';

async function run() {
  console.log('Starting migration as postgres superuser...');
  const client = new Client({
    connectionString: 'postgresql://postgres:root@localhost:5432/sop_saas'
  });

  try {
    await client.connect();
    
    // 1. Alter Table to add column
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS page_permissions JSONB DEFAULT \'{}\';');
    console.log('Successfully added page_permissions column via pg client');

    // 2. Query all users (bypassing RLS because we are logged in as postgres superuser)
    console.log('Querying existing users to migrate...');
    const result = await client.query('SELECT id, username, role FROM users;');
    const users = result.rows;
    console.log(`Found ${users.length} users to migrate.`);

    for (const user of users) {
      let perms = {};
      if (user.role === 'admin' || user.role === 'supervisor') {
        perms = { attendance: true, leaveRequests: true, payroll: true, sopLibrary: true };
      } else if (user.role === 'operator') {
        perms = { attendance: true, leaveRequests: true, payroll: false, sopLibrary: true };
      } else if (user.role === 'auditor') {
        perms = { attendance: false, leaveRequests: false, payroll: false, sopLibrary: true };
      } else {
        perms = { attendance: true, leaveRequests: true, payroll: true, sopLibrary: true };
      }

      await client.query(
        'UPDATE users SET page_permissions = $1 WHERE id = $2;',
        [JSON.stringify(perms), user.id]
      );
      console.log(`Migrated user "${user.username}" (role: ${user.role}) -> ${JSON.stringify(perms)}`);
    }

    console.log('Migration completed successfully!');
  } catch (err: any) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

run();
