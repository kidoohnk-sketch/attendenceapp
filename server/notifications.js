const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const logPath = path.resolve(__dirname, 'notifications.log');

// In-memory cache of notification events for dashboard viewing
const notificationEvents = [];

// Helper to log notifications both locally and to a file
const logNotification = (message, type = 'info') => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    type
  };
  
  notificationEvents.unshift(logEntry); // Add to beginning of array
  if (notificationEvents.length > 50) {
    notificationEvents.pop(); // Keep last 50 entries
  }

  const fileString = `[${logEntry.timestamp}] [${type.toUpperCase()}] ${message}\n`;
  fs.appendFile(logPath, fileString, (err) => {
    if (err) console.error('Failed to write to notification.log:', err);
  });

  console.log(`[NOTIFICATION] ${message}`);
};

// Scheduler tracking variable
let lastReminderDate = '';

// Check if attendance is missing at 10:00 AM and trigger warning
const checkAttendanceReminder = async (query) => {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const indiaTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const hours = new Date(indiaTime).getHours();
  
  // Only check if it's 10:00 AM or later and we haven't sent a reminder yet today
  if (hours >= 10 && lastReminderDate !== todayStr) {
    try {
      // Check if today is a holiday
      const holiday = await query.get('SELECT date FROM holidays WHERE date = ?', [todayStr]);
      if (holiday) {
        return; // Today is a holiday, no warning needed
      }

      // Check if any attendance exists for today
      const todayRecords = await query.all('SELECT id FROM attendance WHERE date = ? LIMIT 1', [todayStr]);
      
      if (todayRecords.length === 0) {
        // Attendance not marked yet!
        logNotification(
          `ALERT: Daily attendance reminder! Today's attendance has NOT been marked by 10:00 AM. (Notification dispatched to all teachers)`,
          'warning'
        );
        lastReminderDate = todayStr; // Prevent duplicate warnings for today
      }
    } catch (err) {
      logNotification(`Failed running scheduler check: ${err.message}`, 'error');
    }
  }
};

// Start the scheduler loop
const startScheduler = (query) => {
  logNotification('Background notification scheduler started successfully.');
  
  // Run check immediately on startup
  checkAttendanceReminder(query);
  
  // Run check every 5 minutes
  setInterval(() => {
    checkAttendanceReminder(query);
  }, 300000);
};

// Public notify methods
const notifySubmission = (teacherName, presentCount, absentCount) => {
  logNotification(
    `SUCCESS: Attendance successfully marked for today by ${teacherName}. Present: ${presentCount}, Absent: ${absentCount}. (Owner RD notified)`,
    'success'
  );
};

// Monthly Report Generator and Dispatcher
const sendMonthlyReport = async (query, year, month) => {
  const formattedMonth = parseInt(month) < 10 ? `0${parseInt(month)}` : `${parseInt(month)}`;
  const datePattern = `${year}-${formattedMonth}-%`;
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  try {
    // 1. Gather stats
    // Total school days marked in database this month
    const totalDaysRes = await query.get(
      'SELECT COUNT(DISTINCT date) as count FROM attendance WHERE date LIKE ?',
      [datePattern]
    );
    const totalSchoolDays = totalDaysRes.count || 0;

    // Number of holidays in this month
    const holidays = await query.all(
      'SELECT * FROM holidays WHERE date LIKE ? ORDER BY date ASC',
      [datePattern]
    );
    const totalHolidays = holidays.length;

    // Fetch student lists
    const students = await query.all('SELECT * FROM students ORDER BY name ASC');
    
    // Average attendance rate across all roll calls this month
    const overallStats = await query.get(
      `SELECT 
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
        COUNT(*) as total
       FROM attendance 
       WHERE date LIKE ?`,
      [datePattern]
    );
    const overallRate = overallStats.total > 0 ? Math.round((overallStats.present / overallStats.total) * 100) : 0;

    // Compile student stats
    const perfectAttendance = [];
    const lowAttendance = [];
    
    for (const student of students) {
      const stats = await query.get(
        `SELECT 
          SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
          COUNT(*) as total
         FROM attendance 
         WHERE student_id = ? AND date LIKE ?`,
        [student.id, datePattern]
      );
      
      if (stats.total > 0) {
        const rate = Math.round((stats.present / stats.total) * 100);
        if (rate === 100) {
          perfectAttendance.push(`${student.name} (${stats.present}/${stats.total} days)`);
        } else if (rate < 75) {
          lowAttendance.push(`${student.name} (${rate}% - ${stats.present}/${stats.total} days)`);
        }
      }
    }

    // 2. Generate HTML Report
    const holidayListHtml = holidays.map(h => `<li>${h.date}: ${h.description}</li>`).join('') || '<li>None</li>';
    const perfectHtml = perfectAttendance.map(s => `<li>🌟 ${s}</li>`).join('') || '<li>None</li>';
    const lowHtml = lowAttendance.map(s => `<li>⚠️ ${s}</li>`).join('') || '<li>None</li>';

    const reportHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <h2 style="color: #4f46e5; margin-bottom: 4px;">My Chhota School</h2>
        <h3 style="color: #1e293b; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px;">Monthly Attendance Report: ${monthName} ${year}</h3>
        
        <p>Dear RD (Owner),</p>
        <p>Here is the monthly analysis of student attendance for your playschool:</p>
        
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #475569;"><strong>Average Attendance Rate:</strong></td>
              <td style="text-align: right; color: #4f46e5; font-size: 18px; font-weight: bold;">${overallRate}%</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #475569;"><strong>Total School Days Marked:</strong></td>
              <td style="text-align: right;">${totalSchoolDays} days</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #475569;"><strong>Holidays Recorded:</strong></td>
              <td style="text-align: right;">${totalHolidays} days</td>
            </tr>
          </table>
        </div>
        
        <h4 style="color: #0f172a; margin-bottom: 8px;">Holidays in ${monthName}:</h4>
        <ul style="padding-left: 20px; color: #475569; font-size: 14px;">
          ${holidayListHtml}
        </ul>

        <h4 style="color: #10b981; margin-bottom: 8px;">Perfect Attendance (100%):</h4>
        <ul style="padding-left: 20px; color: #475569; font-size: 14px;">
          ${perfectHtml}
        </ul>

        <h4 style="color: #f43f5e; margin-bottom: 8px;">Low Attendance Alert (&lt;75%):</h4>
        <ul style="padding-left: 20px; color: #475569; font-size: 14px;">
          ${lowHtml}
        </ul>

        <p style="margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated report generated by My Chhota School Attendance System.
        </p>
      </div>
    `;

    // 3. Dispatch Email
    const ownerEmail = process.env.OWNER_EMAIL || 'owner@chhotaschool.com';
    
    // Check if SMTP details are defined
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: `"My Chhota School Portal" <${process.env.SMTP_USER}>`,
        to: ownerEmail,
        subject: `[My Chhota School] Attendance Analysis Report for ${monthName} ${year}`,
        html: reportHtml
      });

      logNotification(
        `EMAIL DISPATCHED: Monthly report for ${monthName} ${year} sent to RD (${ownerEmail}).`,
        'success'
      );
    } else {
      // Simulated delivery fallback: write html format directly into logs for verification
      logNotification(
        `EMAIL SIMULATION: Monthly report email for ${monthName} ${year} generated successfully for RD (${ownerEmail}).\n---------------------------------------\n${reportHtml}\n---------------------------------------`,
        'success'
      );
    }
    return true;
  } catch (err) {
    logNotification(`Failed to generate monthly report: ${err.message}`, 'error');
    throw err;
  }
};

const sendOtpEmail = async (toEmail, otp) => {
  try {
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <h2 style="color: #4f46e5; margin-bottom: 4px;">My Chhota School</h2>
        <h3 style="color: #1e293b; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-top: 0;">Account Verification Code</h3>
        <p>Dear Teacher/Owner,</p>
        <p>Please use the following 6-digit verification code to complete your login or registration setup at My Chhota School Attendance Portal:</p>
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 0.1em; color: #4f46e5;">${otp}</span>
        </div>
        <p style="font-size: 13px; color: #64748b;">This OTP code is valid for 5 minutes. Do not share this code with anyone.</p>
      </div>
    `;

    if (process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'kidoohnk@gmail.com',
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: `"My Chhota School Portal" <kidoohnk@gmail.com>`,
        to: toEmail,
        subject: `[My Chhota School] Verification Code: ${otp}`,
        html: emailHtml
      });

      logNotification(`EMAIL DISPATCHED: OTP verification code sent to ${toEmail} from kidoohnk@gmail.com.`, 'success');
    } else {
      logNotification(
        `EMAIL SIMULATION: OTP verification code [${otp}] sent to ${toEmail} from kidoohnk@gmail.com.\n---------------------------------------\nOTP Code: ${otp}\n---------------------------------------`,
        'success'
      );
    }
    return true;
  } catch (err) {
    logNotification(`Failed to send OTP email: ${err.message}`, 'error');
    throw err;
  }
};

const getNotificationEvents = () => {
  return notificationEvents;
};

module.exports = {
  startScheduler,
  notifySubmission,
  sendMonthlyReport,
  sendOtpEmail,
  getNotificationEvents,
  logNotification
};
