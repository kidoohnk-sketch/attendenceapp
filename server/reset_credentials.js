/**
 * Credential Reset Script (Fixed - lowercase usernames to match server login logic)
 * The server does: WHERE username = username.toLowerCase()
 * So usernames must be stored in lowercase.
 *
 * Run with: node reset_credentials.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function resetCredentials() {
  try {
    console.log('Connecting to database...');

    // Hash new passwords
    const teacherHash = bcrypt.hashSync('Teacher@3124', 10);
    const ownerHash   = bcrypt.hashSync('rama@7761', 10);

    // NOTE: Server lowercases username on login, so store usernames in lowercase!
    // Teacher → stored as "teacher", login with username: Teacher (case-insensitive)
    // Owner   → stored as "rd",      login with username: RD      (case-insensitive)

    // --- Update Teacher ---
    const teacherRes = await client.execute({
      sql: `UPDATE users SET username = ?, password = ?, name = ? WHERE role = 'teacher'`,
      args: ['teacher', teacherHash, 'Teacher'],
    });

    if (teacherRes.rowsAffected === 0) {
      await client.execute({
        sql: `INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, 'teacher')`,
        args: ['Teacher', 'teacher', teacherHash],
      });
      console.log('✅ Teacher account created.');
    } else {
      console.log(`✅ Teacher account updated (${teacherRes.rowsAffected} row(s) updated).`);
    }

    // --- Update Owner ---
    const ownerRes = await client.execute({
      sql: `UPDATE users SET username = ?, password = ?, name = ? WHERE role = 'owner'`,
      args: ['rd', ownerHash, 'RD'],
    });

    if (ownerRes.rowsAffected === 0) {
      await client.execute({
        sql: `INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, 'owner')`,
        args: ['RD', 'rd', ownerHash],
      });
      console.log('✅ Owner account created.');
    } else {
      console.log(`✅ Owner account updated (${ownerRes.rowsAffected} row(s) updated).`);
    }

    // --- Show final state ---
    const users = await client.execute({ sql: `SELECT id, name, username, role FROM users`, args: [] });
    console.log('\n📋 Current users in database:');
    console.table(users.rows.map(r => ({
      id:       r.id,
      name:     r.name,
      username: r.username,
      role:     r.role,
    })));

    console.log('\n🔑 Working credentials (username is case-insensitive at login):');
    console.log('   Teacher → username: Teacher  |  password: Teacher@3124');
    console.log('   Owner   → username: RD       |  password: rama@7761');

  } catch (err) {
    console.error('❌ Error resetting credentials:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

resetCredentials();
