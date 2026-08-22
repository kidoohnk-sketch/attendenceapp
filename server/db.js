const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.warn("WARNING: TURSO_DATABASE_URL environment variable is not defined. Falling back to local file.");
}

const client = createClient({
  url: url || 'file:local.db',
  authToken: authToken
});

// Helper function to query database using Libsql client
const query = {
  all: async (sql, params = []) => {
    try {
      const res = await client.execute({ sql, args: params });
      return res.rows;
    } catch (err) {
      console.error(`SQL ERROR (all): ${sql}`, err);
      throw err;
    }
  },
  get: async (sql, params = []) => {
    try {
      const res = await client.execute({ sql, args: params });
      return res.rows[0] || null;
    } catch (err) {
      console.error(`SQL ERROR (get): ${sql}`, err);
      throw err;
    }
  },
  run: async (sql, params = []) => {
    try {
      const res = await client.execute({ sql, args: params });
      // In @libsql/client, lastInsertRowid is a BigInt. We convert to Number.
      const lastId = res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined;
      return { id: lastId, changes: res.rowsAffected };
    } catch (err) {
      console.error(`SQL ERROR (run): ${sql}`, err);
      throw err;
    }
  }
};

// Initialize schema and seed data
const initDb = async () => {
  try {
    // 1. Create Users Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE,
        password TEXT,
        google_email TEXT UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('teacher', 'owner'))
      )
    `);

    // 2. Create Students Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date_added TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      )
    `);

    // 3. Create Attendance Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
        marked_by TEXT NOT NULL, -- teacher name
        timestamp TEXT NOT NULL, -- ISO date string
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE(student_id, date)
      )
    `);

    // 3.5. Create Holidays Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
        description TEXT NOT NULL
      )
    `);

    // 3.6. Create OTP Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);

    // 4. Seed Default Users if empty
    const userCount = await query.get('SELECT COUNT(*) as count FROM users');
    if (userCount.count === 0) {
      console.log('Seeding default users...');
      const teacherHash = bcrypt.hashSync('teacher123', 10);
      const ownerHash = bcrypt.hashSync('owner123', 10);

      await query.run(
        'INSERT INTO users (name, username, password, google_email, role) VALUES (?, ?, ?, ?, ?)',
        ['Priya Sharma', 'teacher', teacherHash, 'teacher-google@gmail.com', 'teacher']
      );
      await query.run(
        'INSERT INTO users (name, username, password, google_email, role) VALUES (?, ?, ?, ?, ?)',
        ['Rohan Sen', 'owner', ownerHash, 'owner-google@gmail.com', 'owner']
      );
      console.log('Default users seeded successfully!');
    }

    // Student roster starts clean and empty.
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
};

module.exports = {
  db: client, // Export client under db for maximum compatibility
  query,
  initDb
};
