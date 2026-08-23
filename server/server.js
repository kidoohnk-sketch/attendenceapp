const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query, initDb, db } = require('./db');
const { startScheduler, notifySubmission, sendMonthlyReport, getNotificationEvents, logNotification } = require('./notifications');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'my-chhota-school-super-secret-key-1357';

const getIndiaDateString = (d = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '4mb' })); // Increased to allow Base64 photo uploads


// Auth Middleware to protect routes and inject user
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

// Role Check Middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Unauthorized role.' });
    }
    next();
  };
};

// Ensure DB initialization completes on serverless cold starts
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await initDb();
      dbInitialized = true;
    } catch (err) {
      console.error('Database initialization error during request:', err);
    }
  }
  next();
});

// ---------------- API ENDPOINTS ----------------

// 1. Auth Login Route (Local Credentials)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    if (!user.password) {
      return res.status(401).json({ message: 'This account is set up for Google login. Please Sign In with Google.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server login error.' });
  }
});

// 1.2 Google Authentication Verification
app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Google ID token is required.' });
  }

  let email = '';
  let name = '';

  try {
    // A. Handle Simulation Tokens for testing
    if (token.startsWith('simulation-token-')) {
      const parts = token.split('-');
      const mockRole = parts[2] || 'teacher'; // simulation-token-teacher or simulation-token-owner
      email = `${mockRole}-google@gmail.com`;
      name = `Demo Google ${mockRole.charAt(0).toUpperCase() + mockRole.slice(1)}`;
      logNotification(`SIMULATION: Google Sign-in verified for email: ${email}`, 'info');
    } else {
      // B. Real Google token verification
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      const payload = await response.json();
      
      if (!payload || !payload.email) {
        return res.status(400).json({ message: 'Invalid Google authentication token.' });
      }

      email = payload.email;
      name = payload.name || payload.given_name || 'Google User';
    }

    // C. Check database for existing user
    const user = await query.get('SELECT * FROM users WHERE google_email = ?', [email.toLowerCase()]);
    
    if (user) {
      // Existing Google user: issue JWT session
      const sessionToken = jwt.sign(
        { id: user.id, name: user.name, role: user.role, email: user.google_email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return res.json({
        isNew: false,
        token: sessionToken,
        user: {
          id: user.id,
          name: user.name,
          role: user.role
        }
      });
    } else {
      // New Google user: return payload to prompt role selection
      return res.json({
        isNew: true,
        email: email.toLowerCase(),
        name: name
      });
    }
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(500).json({ message: 'Google authentication failed: ' + err.message });
  }
});

// 1.3 Google Registration
app.post('/api/auth/google/register', async (req, res) => {
  const { email, name, role } = req.body;

  if (!email || !name || !role) {
    return res.status(400).json({ message: 'Email, Name, and Role are required.' });
  }

  if (!['teacher', 'owner', 'staff'].includes(role)) {
    return res.status(400).json({ message: 'Invalid user role selected.' });
  }

  try {
    // Check if user already exists
    const existing = await query.get('SELECT * FROM users WHERE google_email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Insert user
    const result = await query.run(
      'INSERT INTO users (name, google_email, role) VALUES (?, ?, ?)',
      [name, email.toLowerCase(), role]
    );

    // Issue JWT
    const sessionToken = jwt.sign(
      { id: result.id, name: name, role: role, email: email.toLowerCase() },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    logNotification(`New Google account registered: "${name}" (${email}) as role ${role.toUpperCase()}.`, 'info');

    res.status(201).json({
      token: sessionToken,
      user: {
        id: result.id,
        name,
        role
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

// 1.4 Send OTP Verification Code
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await query.run('DELETE FROM otps WHERE email = ?', [email.toLowerCase()]);
    await query.run(
      'INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)',
      [email.toLowerCase(), otp, expiresAt]
    );

    const { sendOtpEmail } = require('./notifications');
    await sendOtpEmail(email.toLowerCase(), otp);

    res.json({ message: 'Verification code sent successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to dispatch verification code: ' + err.message });
  }
});

// In-memory brute-force protection for OTP verification
const otpAttempts = new Map(); // { email: { count, blockUntil } }

// 1.5 Verify OTP Code & Login/Register
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp, name, role } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP verification code are required.' });
  }

  const emailKey = email.toLowerCase();
  const attempts = otpAttempts.get(emailKey) || { count: 0, blockUntil: null };

  if (attempts.blockUntil && new Date(attempts.blockUntil) > new Date()) {
    const remaining = Math.ceil((new Date(attempts.blockUntil) - new Date()) / 60000);
    return res.status(429).json({
      message: `Too many failed attempts. Locked out. Please try again in ${remaining} minutes.`
    });
  }

  try {
    const isMock = email.toLowerCase().includes('google@gmail.com') || email.toLowerCase().includes('simulation');
    
    if (isMock && otp === '123456') {
      logNotification(`SIMULATION: OTP verified successfully for email ${email} with bypass code.`, 'info');
      otpAttempts.delete(emailKey);
    } else {
      const row = await query.get('SELECT * FROM otps WHERE email = ?', [email.toLowerCase()]);
      if (!row) {
        return res.status(400).json({ message: 'No verification code sent for this email.' });
      }

      const now = new Date().toISOString();
      if (row.otp !== otp) {
        attempts.count += 1;
        if (attempts.count >= 5) {
          attempts.blockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes lockout
          otpAttempts.set(emailKey, attempts);
          return res.status(429).json({ message: 'Too many failed verification attempts. Locked out for 10 minutes.' });
        }
        otpAttempts.set(emailKey, attempts);
        return res.status(400).json({ message: `Invalid verification code. ${5 - attempts.count} attempts remaining.` });
      }
      if (row.expires_at < now) {
        return res.status(400).json({ message: 'Verification code has expired.' });
      }

      await query.run('DELETE FROM otps WHERE email = ?', [email.toLowerCase()]);
      otpAttempts.delete(emailKey); // reset attempts on success
    }

    let user = await query.get('SELECT * FROM users WHERE google_email = ?', [email.toLowerCase()]);

    if (!user) {
      if (!name || !role) {
        return res.status(400).json({
          message: 'Account not found. Please provide name and role to complete registration.'
        });
      }
      
      const result = await query.run(
        'INSERT INTO users (name, google_email, role) VALUES (?, ?, ?)',
        [name, email.toLowerCase(), role]
      );
      
      user = {
        id: result.id,
        name,
        role,
        google_email: email.toLowerCase()
      };
      logNotification(`New Google account verified via OTP: "${name}" (${email}) as role ${role.toUpperCase()}.`, 'info');
    } else {
      logNotification(`Google account logged in via OTP: "${user.name}" (${email}).`, 'info');
    }

    const sessionToken = jwt.sign(
      { id: user.id, name: user.name, role: user.role, email: user.google_email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: sessionToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed: ' + err.message });
  }
});

// 1.6 Forgot Password - Send OTP
app.post('/api/auth/forgot-password/send-otp', async (req, res) => {
  const { username, email } = req.body;

  if (!username || !email) {
    return res.status(400).json({ message: 'Username and registered email address are required.' });
  }

  try {
    const user = await query.get(
      'SELECT * FROM users WHERE username = ? AND google_email = ?',
      [username, email.toLowerCase()]
    );

    if (!user) {
      return res.status(404).json({ message: 'No account found with this username and email combination.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await query.run('DELETE FROM otps WHERE email = ?', [email.toLowerCase()]);
    await query.run(
      'INSERT INTO otps (email, otp, expires_at) VALUES (?, ?, ?)',
      [email.toLowerCase(), otp, expiresAt]
    );

    const { sendOtpEmail } = require('./notifications');
    await sendOtpEmail(email.toLowerCase(), otp);

    res.json({ message: 'Password reset verification code sent successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send verification code: ' + err.message });
  }
});

// 1.7 Forgot Password - Reset password
app.post('/api/auth/forgot-password/reset', async (req, res) => {
  const { username, email, otp, newPassword } = req.body;

  if (!username || !email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Username, email, OTP code, and new password are required.' });
  }

  const emailKey = email.toLowerCase();
  const attempts = otpAttempts.get(emailKey) || { count: 0, blockUntil: null };

  if (attempts.blockUntil && new Date(attempts.blockUntil) > new Date()) {
    const remaining = Math.ceil((new Date(attempts.blockUntil) - new Date()) / 60000);
    return res.status(429).json({ message: `Too many failed attempts. Locked out. Please try again in ${remaining} minutes.` });
  }

  try {
    const user = await query.get(
      'SELECT * FROM users WHERE username = ? AND google_email = ?',
      [username, email.toLowerCase()]
    );

    if (!user) {
      return res.status(404).json({ message: 'Account not found with this username and email.' });
    }

    const isMock = email.toLowerCase().includes('google@gmail.com') || email.toLowerCase().includes('simulation');
    
    if (isMock && otp === '123456') {
      otpAttempts.delete(emailKey);
    } else {
      const row = await query.get('SELECT * FROM otps WHERE email = ?', [email.toLowerCase()]);
      if (!row) {
        return res.status(400).json({ message: 'No verification code found for this email.' });
      }

      const now = new Date().toISOString();
      if (row.otp !== otp) {
        attempts.count += 1;
        if (attempts.count >= 5) {
          attempts.blockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          otpAttempts.set(emailKey, attempts);
          return res.status(429).json({ message: 'Too many failed verification attempts. Locked out for 10 minutes.' });
        }
        otpAttempts.set(emailKey, attempts);
        return res.status(400).json({ message: `Invalid verification code. ${5 - attempts.count} attempts remaining.` });
      }

      if (row.expires_at < now) {
        return res.status(400).json({ message: 'Verification code has expired.' });
      }

      await query.run('DELETE FROM otps WHERE email = ?', [email.toLowerCase()]);
      otpAttempts.delete(emailKey);
    }

    const bcrypt = require('bcryptjs');
    const newHash = bcrypt.hashSync(newPassword, 10);
    await query.run('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);

    logNotification(`Password reset successfully for local account: "${user.username}".`, 'info');
    res.json({ message: 'Password updated successfully. Please log in with your new password.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reset password: ' + err.message });
  }
});

// 1.8 Change Username (Local Credentials verified)
app.post('/api/auth/change-username', async (req, res) => {
  const { username, password, newUsername } = req.body;

  if (!username || !password || !newUsername) {
    return res.status(400).json({ message: 'Current username, current password, and new username are required.' });
  }

  try {
    const user = await query.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(404).json({ message: 'Account not found with this username.' });
    }

    const bcrypt = require('bcryptjs');
    if (!user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: 'Incorrect current password.' });
    }

    const existing = await query.get('SELECT id FROM users WHERE username = ?', [newUsername]);
    if (existing) {
      return res.status(400).json({ message: 'New username is already taken. Please choose another.' });
    }

    await query.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, user.id]);

    logNotification(`Username changed successfully from "${username}" to "${newUsername}" for user "${user.name}".`, 'info');
    res.json({ message: 'Username updated successfully. Please log in with your new username.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to change username: ' + err.message });
  }
});

// 1.9 Get list of teachers (Owner only)
app.get('/api/teachers', authenticate, requireRole(['owner']), async (req, res) => {
  try {
    const teachers = await query.all("SELECT id, name, username, google_email FROM users WHERE role = 'teacher' ORDER BY name ASC");
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving teachers: ' + err.message });
  }
});

// 2. Students Route (Get student list)
app.get('/api/students', authenticate, async (req, res) => {
  const { active } = req.query;
  
  try {
    let sql = 'SELECT * FROM students';
    const params = [];
    
    if (req.user.role === 'teacher') {
      sql += ' WHERE (teacher_id IS NULL OR teacher_id = ?)';
      params.push(req.user.id);
      
      if (active !== undefined) {
        sql += ' AND active = ?';
        params.push(parseInt(active));
      }
    } else {
      if (active !== undefined) {
        sql += ' WHERE active = ?';
        params.push(parseInt(active));
      }
    }
    
    sql += ' ORDER BY name ASC';
    
    const students = await query.all(sql, params);
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving students: ' + err.message });
  }
});

// 3. Add Student Route (Teacher or Owner)
app.post('/api/students', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Student name is required.' });
  }

  try {
    const today = getIndiaDateString();
    let teacherId = null;
    if (req.user.role === 'teacher') {
      teacherId = req.user.id;
    }
    const result = await query.run(
      'INSERT INTO students (name, date_added, active, teacher_id) VALUES (?, ?, 1, ?)',
      [name.trim(), today, teacherId]
    );
    
    logNotification(`Student "${name.trim()}" added to roster by ${req.user.name}.`, 'info');
    res.status(201).json({ id: result.id, name: name.trim(), date_added: today, active: 1 });
  } catch (err) {
    res.status(500).json({ message: 'Error adding student: ' + err.message });
  }
});

// 4. Update Student Route (Toggle active state or edit name)
app.put('/api/students/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;

  if (active === undefined) {
    return res.status(400).json({ message: 'Active status is required.' });
  }

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ message: 'Student name cannot be empty.' });
  }

  try {
    const student = await query.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const updatedName = name !== undefined ? name.trim() : student.name;
    const updatedActive = parseInt(active); // 1 or 0

    await query.run(
      'UPDATE students SET name = ?, active = ? WHERE id = ?',
      [updatedName, updatedActive, id]
    );

    const statusText = updatedActive === 1 ? 'ACTIVE' : 'INACTIVE';
    logNotification(`Student "${updatedName}" record updated by ${req.user.name}.`, 'info');

    res.json({ id: parseInt(id), name: updatedName, active: updatedActive });
  } catch (err) {
    res.status(500).json({ message: 'Error updating student: ' + err.message });
  }
});

// 4.5 Update Student Teacher Assignment (Owner only)
app.put('/api/students/:id/teacher', authenticate, requireRole(['owner']), async (req, res) => {
  const { id } = req.params;
  const { teacher_id } = req.body;

  try {
    const student = await query.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    await query.run('UPDATE students SET teacher_id = ? WHERE id = ?', [teacher_id || null, id]);
    
    logNotification(`Student "${student.name}" assigned to teacher by ${req.user.name}.`, 'info');
    res.json({ message: 'Student assigned successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Error assigning student: ' + err.message });
  }
});

// --- STAFF MANAGEMENT ROUTES ---

// 1. Get Staff Members List
app.get('/api/staff-members', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { active } = req.query;
  try {
    let sql = 'SELECT * FROM staff_members';
    const params = [];
    if (active !== undefined) {
      sql += ' WHERE active = ?';
      params.push(parseInt(active));
    }
    sql += ' ORDER BY name ASC';
    const staff = await query.all(sql, params);
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving staff members: ' + err.message });
  }
});

// 2. Add Staff Member
app.post('/api/staff-members', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Staff member name is required.' });
  }

  try {
    const today = getIndiaDateString();
    const result = await query.run(
      'INSERT INTO staff_members (name, date_added, active) VALUES (?, ?, 1)',
      [name.trim(), today]
    );
    
    logNotification(`Staff member "${name.trim()}" added to roster by ${req.user.name}.`, 'info');
    res.status(201).json({ id: result.id, name: name.trim(), date_added: today, active: 1 });
  } catch (err) {
    res.status(500).json({ message: 'Error adding staff member: ' + err.message });
  }
});

// 3. Update Staff Member Status (Toggle Active/Inactive or Edit Name)
app.put('/api/staff-members/:id', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;

  if (active === undefined) {
    return res.status(400).json({ message: 'Active status is required.' });
  }

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ message: 'Staff member name cannot be empty.' });
  }

  try {
    const member = await query.get('SELECT * FROM staff_members WHERE id = ?', [id]);
    if (!member) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    const updatedName = name !== undefined ? name.trim() : member.name;
    const updatedActive = parseInt(active);

    await query.run(
      'UPDATE staff_members SET name = ?, active = ? WHERE id = ?',
      [updatedName, updatedActive, id]
    );

    const statusText = updatedActive === 1 ? 'ACTIVE' : 'INACTIVE';
    logNotification(`Staff member "${updatedName}" record updated by ${req.user.name}.`, 'info');

    res.json({ id: parseInt(id), name: updatedName, active: updatedActive });
  } catch (err) {
    res.status(500).json({ message: 'Error updating staff member: ' + err.message });
  }
});

// 3.5 Delete Staff Member Permanently
app.delete('/api/staff-members/:id', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { id } = req.params;

  try {
    const member = await query.get('SELECT * FROM staff_members WHERE id = ?', [id]);
    if (!member) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    await query.run('DELETE FROM staff_members WHERE id = ?', [id]);
    logNotification(`Staff member "${member.name}" permanently deleted by ${req.user.name}.`, 'warning');

    res.json({ message: 'Staff member deleted permanently.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting staff member: ' + err.message });
  }
});

// 4. Get Staff Attendance by Date
app.get('/api/staff-attendance', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ message: 'Date parameter is required.' });
  }

  try {
    const records = await query.all(
      `SELECT sa.id, sa.staff_member_id, sm.name as staff_name, sa.date, sa.status, sa.marked_by, sa.timestamp
       FROM staff_attendance sa
       JOIN staff_members sm ON sa.staff_member_id = sm.id
       WHERE sa.date = ?
       ORDER BY sm.name ASC`,
      [date]
    );
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving staff attendance: ' + err.message });
  }
});

// 5. Submit Staff Attendance
app.post('/api/staff-attendance', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { date, attendance } = req.body;
  if (!date || !Array.isArray(attendance)) {
    return res.status(400).json({ message: 'Date and attendance array are required.' });
  }

  try {
    const timestamp = new Date().toISOString();
    const markedBy = req.user.name;
    let presentCount = 0;
    let absentCount = 0;

    for (const item of attendance) {
      const { staff_member_id, status } = item;
      if (!staff_member_id || !['Present', 'Absent'].includes(status)) continue;

      if (status === 'Present') presentCount++;
      if (status === 'Absent') absentCount++;

      const existing = await query.get(
        'SELECT id FROM staff_attendance WHERE staff_member_id = ? AND date = ?',
        [staff_member_id, date]
      );

      if (existing) {
        await query.run(
          'UPDATE staff_attendance SET status = ?, marked_by = ?, timestamp = ? WHERE id = ?',
          [status, markedBy, timestamp, existing.id]
        );
      } else {
        await query.run(
          'INSERT INTO staff_attendance (staff_member_id, date, status, marked_by, timestamp) VALUES (?, ?, ?, ?, ?)',
          [staff_member_id, date, status, markedBy, timestamp]
        );
      }
    }

    logNotification(`SUCCESS: Staff attendance marked for ${date} by ${markedBy}. Present: ${presentCount}, Absent: ${absentCount}.`, 'success');
    res.json({ message: 'Staff attendance recorded successfully.', timestamp, marked_by: markedBy });
  } catch (err) {
    res.status(500).json({ message: 'Error submitting staff attendance: ' + err.message });
  }
});

// 6. Get Staff Monthly Attendance Log
app.get('/api/staff-attendance/monthly-log', authenticate, requireRole(['staff', 'owner']), async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ message: 'Year and month are required.' });
  }

  const formattedMonth = String(month).padStart(2, '0');
  const datePattern = `${year}-${formattedMonth}-%`;

  try {
    const logs = await query.all(
      `SELECT date, marked_by, timestamp,
              SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
              SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count
       FROM staff_attendance
       WHERE date LIKE ?
       GROUP BY date
       ORDER BY date DESC`,
      [datePattern]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving monthly staff log: ' + err.message });
  }
});

// 4c. Upload / Update Student Photo
app.put('/api/students/:id/photo', authenticate, async (req, res) => {
  const { id } = req.params;
  const { photo_url } = req.body;

  if (!photo_url) {
    return res.status(400).json({ message: 'photo_url (Base64 data URL) is required.' });
  }

  // Basic validation: must be a data URL image
  if (!photo_url.startsWith('data:image/')) {
    return res.status(400).json({ message: 'Invalid image format. Must be a Base64 data URL.' });
  }

  // Limit size to ~2MB of Base64 (~1.5MB actual image)
  if (photo_url.length > 2.8 * 1024 * 1024) {
    return res.status(413).json({ message: 'Photo is too large. Please use an image under 1.5 MB.' });
  }

  try {
    const student = await query.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    await query.run('UPDATE students SET photo_url = ? WHERE id = ?', [photo_url, id]);
    logNotification(`Photo updated for student "${student.name}" by ${req.user.name}.`, 'info');
    res.json({ message: 'Photo updated successfully.', id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ message: 'Error saving photo: ' + err.message });
  }
});

// 4b. Permanently Delete Student (Owner only)
app.delete('/api/students/:id', authenticate, requireRole(['owner']), async (req, res) => {
  const { id } = req.params;

  try {
    const student = await query.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Delete attendance records first to avoid orphaned data
    await query.run('DELETE FROM attendance WHERE student_id = ?', [id]);
    // Now delete the student
    await query.run('DELETE FROM students WHERE id = ?', [id]);

    logNotification(`Student "${student.name}" permanently deleted by ${req.user.name}.`, 'info');
    res.json({ message: `Student "${student.name}" permanently deleted.` });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting student: ' + err.message });
  }
});


// 5. Check Attendance Status for a specific date (Defaults to today)
app.get('/api/attendance/status', authenticate, async (req, res) => {
  const dateStr = req.query.date || getIndiaDateString();
  
  try {
    // A. Check if the date is a Holiday first
    const holiday = await query.get('SELECT * FROM holidays WHERE date = ?', [dateStr]);
    if (holiday) {
      return res.json({
        submitted: false,
        is_locked: true,
        is_holiday: true,
        holiday_description: holiday.description
      });
    }

    // B. Check if attendance has been marked
    const records = await query.all('SELECT * FROM attendance WHERE date = ? LIMIT 1', [dateStr]);
    
    if (records.length === 0) {
      return res.json({ submitted: false, is_locked: false, is_holiday: false });
    }

    const record = records[0];
    
    // Check lock cutoff time (12:00 PM local time on target date)
    const now = new Date();
    
    // We only enforce 12:00 PM cutoff if date is today. If it's a past date and it was already submitted, it locks.
    const todayStr = getIndiaDateString(now);
    let isLocked = false;
    
    if (dateStr === todayStr) {
      isLocked = false; // Today's attendance remains unlocked for submission/editing
    } else {
      isLocked = true; // Past submissions are locked by default
    }

    res.json({
      submitted: true,
      marked_by: record.marked_by,
      timestamp: record.timestamp,
      is_locked: isLocked,
      is_holiday: false
    });
  } catch (err) {
    res.status(500).json({ message: 'Error checking attendance status: ' + err.message });
  }
});

// 6. Get Attendance Records for a date
app.get('/api/attendance', authenticate, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ message: 'Date parameter (YYYY-MM-DD) is required.' });
  }

  try {
    const sql = `
      SELECT a.*, s.name as student_name 
      FROM attendance a 
      JOIN students s ON a.student_id = s.id 
      WHERE a.date = ?
      ORDER BY s.name ASC
    `;
    const records = await query.all(sql, [date]);
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Error loading attendance: ' + err.message });
  }
});

// 7. Submit Daily Attendance (Teacher or Owner)
app.post('/api/attendance', authenticate, async (req, res) => {
  const { date, attendance } = req.body;

  if (!date || !attendance || !Array.isArray(attendance) || attendance.length === 0) {
    return res.status(400).json({ message: 'Invalid payload. Date and attendance array are required.' });
  }

  try {
    // Check if target date is a Holiday
    const holiday = await query.get('SELECT * FROM holidays WHERE date = ?', [date]);
    if (holiday) {
      return res.status(400).json({
        message: `Submission blocked. Date is marked as a Holiday: ${holiday.description}`
      });
    }

    // Save attendance in a transaction
    await query.run('DELETE FROM attendance WHERE date = ?', [date]);

    const timestamp = new Date().toISOString();
    let presentCount = 0;
    let absentCount = 0;

    for (const record of attendance) {
      await query.run(
        'INSERT INTO attendance (student_id, date, status, marked_by, timestamp) VALUES (?, ?, ?, ?, ?)',
        [record.student_id, date, record.status, req.user.name, timestamp]
      );
      if (record.status === 'Present') presentCount++;
      else if (record.status === 'Absent') absentCount++;
    }

    // Log notification event
    notifySubmission(req.user.name, presentCount, absentCount);

    res.json({
      message: 'Attendance recorded successfully',
      date,
      present: presentCount,
      absent: absentCount
    });
  } catch (err) {
    res.status(500).json({ message: 'Database error saving attendance: ' + err.message });
  }
});

// 8. Get Monthly Report Summary per student
app.get('/api/attendance/summary', authenticate, requireRole(['owner']), async (req, res) => {
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({ message: 'Year and Month parameters are required.' });
  }

  const formattedMonth = parseInt(month) < 10 ? `0${parseInt(month)}` : `${parseInt(month)}`;
  const datePattern = `${year}-${formattedMonth}-%`;

  try {
    const students = await query.all(`
      SELECT s.*, u.name as teacher_name 
      FROM students s 
      LEFT JOIN users u ON s.teacher_id = u.id 
      ORDER BY s.name ASC
    `);

    const summary = [];
    for (const student of students) {
      const stats = await query.get(
        `SELECT 
          SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_days,
          SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_days,
          COUNT(*) as total_days
         FROM attendance 
         WHERE student_id = ? AND date LIKE ?`,
        [student.id, datePattern]
      );

      summary.push({
        student_id: student.id,
        name: student.name,
        teacher_name: student.teacher_name || 'Unassigned',
        active: student.active === 1,
        present_days: stats.present_days || 0,
        absent_days: stats.absent_days || 0,
        total_days: stats.total_days || 0
      });
    }

    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: 'Error calculating summary: ' + err.message });
  }
});

// 8.5. Get Monthly Attendance Log list (Teacher and Owner)
app.get('/api/attendance/monthly-log', authenticate, async (req, res) => {
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({ message: 'Year and Month parameters are required.' });
  }

  const formattedMonth = parseInt(month) < 10 ? `0${parseInt(month)}` : `${parseInt(month)}`;
  const datePattern = `${year}-${formattedMonth}-%`;

  try {
    const logs = await query.all(
      `SELECT date, marked_by, timestamp,
              SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
              SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count
       FROM attendance
       WHERE date LIKE ?
       GROUP BY date, marked_by
       ORDER BY date DESC, timestamp DESC`,
      [datePattern]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Error loading monthly logs: ' + err.message });
  }
});

// 9. Get System logs (Owner only)
app.get('/api/attendance/notifications', authenticate, requireRole(['owner']), (req, res) => {
  res.json(getNotificationEvents());
});

// 10. Get Holidays
app.get('/api/holidays', authenticate, async (req, res) => {
  try {
    const holidays = await query.all('SELECT * FROM holidays ORDER BY date ASC');
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve holidays: ' + err.message });
  }
});

// 11. Add Holiday (Teacher or Owner)
app.post('/api/holidays', authenticate, async (req, res) => {
  const { date, description } = req.body;
  if (!date || !description || !description.trim()) {
    return res.status(400).json({ message: 'Date and description are required.' });
  }

  try {
    await query.run(
      'INSERT INTO holidays (date, description) VALUES (?, ?)',
      [date, description.trim()]
    );
    
    // Clear any attendance marked on that day (since it's a holiday now)
    await query.run('DELETE FROM attendance WHERE date = ?', [date]);

    logNotification(`Holiday "${description.trim()}" added for date ${date} by ${req.user.name}.`, 'info');
    res.status(201).json({ message: 'Holiday created successfully', date, description: description.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ message: 'A holiday is already scheduled on this date.' });
    }
    res.status(500).json({ message: 'Failed to add holiday: ' + err.message });
  }
});

// 12. Delete Holiday (Owner only)
app.delete('/api/holidays/:id', authenticate, requireRole(['owner']), async (req, res) => {
  const { id } = req.params;
  
  try {
    const holiday = await query.get('SELECT * FROM holidays WHERE id = ?', [id]);
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found.' });
    }

    await query.run('DELETE FROM holidays WHERE id = ?', [id]);
    logNotification(`Holiday "${holiday.description}" on date ${holiday.date} removed by ${req.user.name}.`, 'info');

    res.json({ message: 'Holiday deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete holiday: ' + err.message });
  }
});

// 13. Send Monthly Analysis Email Report (Owner only)
app.post('/api/attendance/send-monthly-report', authenticate, requireRole(['owner']), async (req, res) => {
  const { year, month } = req.body;
  
  if (!year || !month) {
    return res.status(400).json({ message: 'Year and Month parameters are required.' });
  }

  try {
    await sendMonthlyReport(query, year, month);
    res.json({ message: `Monthly analysis report for ${month}/${year} sent to owner successfully.` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send monthly report email: ' + err.message });
  }
});

// Initialize database tables on module load
initDb().catch(err => console.error('Database initialization error:', err));

// Start local server and background cron scheduler only if NOT running on Vercel
if (!process.env.VERCEL) {
  startScheduler(query);
  app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
  });
}

// Export Express app for Vercel Serverless Functions compatibility
module.exports = app;
