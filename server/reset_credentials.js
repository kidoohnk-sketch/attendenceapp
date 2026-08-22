/**
 * Credential Reset Script
 * Updates usernames and passwords for teacher and owner accounts.
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
    const teacherHash = bcrypt.hashSync('Teacher@123', 10);
    const ownerHash   = bcrypt.hashSync('rama@234', 10);

    // --- Update / Insert Teacher ---
    // Try to update existing teacher by role
    const teacherRes = await client.execute({
      sql: `UPDATE users SET username = ?, password = ?, name = ? WHERE role = 'teacher'`,
      args: ['Teacher', teacherHash, 'Teacher'],
    });

    if (teacherRes.rowsAffected === 0) {
      // No teacher row exists — insert one
      await client.execute({
        sql: `INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, 'teacher')`,
        args: ['Teacher', 'Teacher', teacherHash],
      });
      console.log('✅ Teacher account created.');
    } else {
      console.log(`✅ Teacher account updated (${teacherRes.rowsAffected} row(s) updated).`);
    }

    // --- Update / Insert Owner ---
    const ownerRes = await client.execute({
      sql: `UPDATE users SET username = ?, password = ?, name = ? WHERE role = 'owner'`,
      args: ['RD', ownerHash, 'RD'],
    });

    if (ownerRes.rowsAffected === 0) {
      await client.execute({
        sql: `INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, 'owner')`,
        args: ['RD', 'RD', ownerHash],
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

    console.log('\n🔑 New credentials:');
    console.log('   Teacher → username: Teacher  |  password: Teacher@123');
    console.log('   Owner   → username: RD       |  password: rama@234');

  } catch (err) {
    console.error('❌ Error resetting credentials:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

resetCredentials();
