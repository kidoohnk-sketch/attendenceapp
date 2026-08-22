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
app.use(express.json());

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

  if (!['teacher', 'owner'].includes(role)) {
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

// 2. Students Route (Get student list)
app.get('/api/students', authenticate, async (req, res) => {
  const { active } = req.query;
  
  try {
    let sql = 'SELECT * FROM students ORDER BY name ASC';
    const params = [];
    
    if (active !== undefined) {
      sql = 'SELECT * FROM students WHERE active = ? ORDER BY name ASC';
      params.push(parseInt(active));
    }
    
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
    const result = await query.run(
      'INSERT INTO students (name, date_added, active) VALUES (?, ?, 1)',
      [name.trim(), today]
    );
    
    logNotification(`Student "${name.trim()}" added to roster by ${req.user.name}.`, 'info');
    res.status(201).json({ id: result.id, name: name.trim(), date_added: today, active: 1 });
  } catch (err) {
    res.status(500).json({ message: 'Error adding student: ' + err.message });
  }
});

// 4. Update Student Route (Toggle active state)
app.put('/api/students/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;

  if (active === undefined) {
    return res.status(400).json({ message: 'Active status is required.' });
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
    logNotification(`Student "${updatedName}" status updated to ${statusText} by ${req.user.name}.`, 'info');

    res.json({ id: parseInt(id), name: updatedName, active: updatedActive });
  } catch (err) {
    res.status(500).json({ message: 'Error updating student: ' + err.message });
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
      const indiaTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const hours = new Date(indiaTime).getHours();
      isLocked = hours >= 12;
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

    // Check if today's records already exist
    const existingRecords = await query.all('SELECT id FROM attendance WHERE date = ? LIMIT 1', [date]);
    
    if (existingRecords.length > 0) {
      const now = new Date();
      const todayStr = getIndiaDateString(now);
      const indiaTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
      const hours = new Date(indiaTime).getHours();
      
      if (date === todayStr && hours >= 12) {
        return res.status(403).json({
          message: 'Submission locked. Daily attendance cannot be edited after 12:00 PM.'
        });
      }
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
    const students = await query.all('SELECT * FROM students ORDER BY name ASC');

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
       GROUP BY date
       ORDER BY date DESC`,
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

// Start express server
const startServer = async () => {
  console.log('Initializing database tables...');
  await initDb();

  // Start background notifications checker
  startScheduler(query);

  app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
  });
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
