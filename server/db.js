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
    // 1. Create Users Table (allowing teacher, owner, staff)
    await query.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE,
        password TEXT,
        google_email TEXT UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('teacher', 'owner', 'staff'))
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

    // 2.1. Safe migration: add photo_url column if it doesn't already exist
    try {
      await query.run('ALTER TABLE students ADD COLUMN photo_url TEXT');
      console.log('Migration: photo_url column added to students table.');
    } catch (e) {
      // Column already exists — this is expected on subsequent starts, ignore silently
      if (!e.message || !e.message.includes('duplicate column')) {
        const msg = e.message || '';
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          throw e;
        }
      }
    }

    // 2.2 Safe migration: add teacher_id column if it doesn't already exist
    try {
      await query.run('ALTER TABLE students ADD COLUMN teacher_id INTEGER REFERENCES users(id)');
      console.log('Migration: teacher_id column added to students table.');
    } catch (e) {
      if (!e.message || !e.message.includes('duplicate column')) {
        const msg = e.message || '';
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          throw e;
        }
      }
    }

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

    // 3.7 Create Staff Members Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS staff_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date_added TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        photo_url TEXT
      )
    `);

    // 3.8 Create Staff Attendance Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS staff_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_member_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
        marked_by TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (staff_member_id) REFERENCES staff_members(id) ON DELETE CASCADE,
        UNIQUE(staff_member_id, date)
      )
    `);

    // 4. Force Reset & Seed EXACT 4 Users
    console.log('Resetting users to exact 4 required accounts...');
    
    try {
      await query.run('PRAGMA foreign_keys = OFF');
      await query.run('DROP TABLE IF EXISTS users');
      await query.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          username TEXT UNIQUE,
          password TEXT,
          google_email TEXT UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('teacher', 'owner', 'staff'))
        )
      `);
      await query.run('PRAGMA foreign_keys = ON');
    } catch (err) {
      console.warn('Re-creating users table warning:', err.message);
    }

    const rdHash = bcrypt.hashSync('rama@7761', 10);
    const lnHash = bcrypt.hashSync('lnhnk@34', 10);
    const teacher1Hash = bcrypt.hashSync('Teacher@3124', 10);
    const teacher2Hash = bcrypt.hashSync('Teacher@9834', 10);

    // 1. Owner: Principal
    await query.run(
      'INSERT INTO users (id, name, username, password, google_email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [1, 'Principal', 'rd', rdHash, 'owner-google@gmail.com', 'owner']
    );

    // 2. Staff: LN
    await query.run(
      'INSERT INTO users (id, name, username, password, google_email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [2, 'LN', 'ln', lnHash, 'staff-google@gmail.com', 'staff']
    );

    // 3. Teacher 1
    await query.run(
      'INSERT INTO users (id, name, username, password, google_email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [3, 'Teacher 1', 'teacher1', teacher1Hash, 'teacher1-google@gmail.com', 'teacher']
    );

    // 4. Teacher 2
    await query.run(
      'INSERT INTO users (id, name, username, password, google_email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [4, 'Teacher 2', 'teacher2', teacher2Hash, 'teacher2-google@gmail.com', 'teacher']
    );

    console.log('Successfully seeded the 4 clean accounts: Principal (rd), LN (ln), Teacher 1 (teacher1), Teacher 2 (teacher2)!');
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
