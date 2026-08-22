import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function OwnerDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'past' | 'monthly' | 'students' | 'holidays' | 'logs'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 1. Overview (Today's Stats)
  const [todayStats, setTodayStats] = useState({
    submitted: false,
    markedBy: '',
    timestamp: '',
    present: 0,
    absent: 0,
    total: 0,
    records: []
  });

  // 2. Past Records View
  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 2. Past Records View
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [pastRecords, setPastRecords] = useState({
    submitted: false,
    markedBy: '',
    timestamp: '',
    records: []
  });

  // 3. Monthly Reports
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-indexed
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // 4. Student Management
  const [allStudents, setAllStudents] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [updatingStudent, setUpdatingStudent] = useState(null);

  // 5. Holiday Management
  const [holidays, setHolidays] = useState([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState(null);

  // 6. Notification Logs
  const [notificationLogs, setNotificationLogs] = useState([]);

  // Load Today's overview data
  const loadTodayOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const todayStr = getLocalDateString();
      const records = await api.getAttendance(todayStr);
      const statusRes = await api.getAttendanceStatus();
      
      const presentCount = records.filter(r => r.status === 'Present').length;
      const absentCount = records.filter(r => r.status === 'Absent').length;

      setTodayStats({
        submitted: statusRes.submitted,
        markedBy: statusRes.marked_by || 'N/A',
        timestamp: statusRes.timestamp || '',
        present: presentCount,
        absent: absentCount,
        total: records.length,
        records: records
      });
    } catch (err) {
      setError('Failed to load today overview: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Past Records by date
  const loadPastRecords = async (date) => {
    setLoading(true);
    setError('');
    try {
      const records = await api.getAttendance(date);
      
      let markedBy = 'N/A';
      let timestamp = '';
      let submitted = false;

      if (records.length > 0) {
        submitted = true;
        markedBy = records[0].marked_by;
        timestamp = records[0].timestamp;
      }

      setPastRecords({
        submitted,
        markedBy,
        timestamp,
        records
      });
    } catch (err) {
      setError('Failed to load past records: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Monthly Summary reports
  const loadMonthlyReport = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAttendanceSummary(selectedYear, selectedMonth);
      setMonthlySummary(data);
    } catch (err) {
      setError('Failed to load monthly summary: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Students list
  const loadStudents = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.getStudents(false);
      setAllStudents(list);
    } catch (err) {
      setError('Failed to load students: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Holidays list
  const loadHolidays = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.getHolidays();
      setHolidays(list);
    } catch (err) {
      setError('Failed to load holidays: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Notification system logs
  const loadNotificationLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const logs = await api.getNotificationLogs();
      setNotificationLogs(logs);
    } catch (err) {
      setError('Failed to load logs: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Refresh tab data
  useEffect(() => {
    if (activeTab === 'overview') {
      loadTodayOverview();
    } else if (activeTab === 'past') {
      loadPastRecords(selectedDate);
    } else if (activeTab === 'monthly') {
      loadMonthlyReport();
    } else if (activeTab === 'students') {
      loadStudents();
    } else if (activeTab === 'holidays') {
      loadHolidays();
    } else if (activeTab === 'logs') {
      loadNotificationLogs();
    }
    setSuccess('');
    setError('');
  }, [activeTab, selectedDate, selectedYear, selectedMonth]);

  // Student management handlers
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;

    setError('');
    setSuccess('');
    try {
      await api.addStudent(newStudentName.trim());
      setSuccess(`Student "${newStudentName}" added successfully!`);
      setNewStudentName('');
      await loadStudents();
    } catch (err) {
      setError('Failed to add student: ' + err.message);
    }
  };

  const handleToggleStudentActive = async (student) => {
    setUpdatingStudent(student.id);
    setError('');
    setSuccess('');
    try {
      const newActiveState = student.active === 1 ? 0 : 1;
      await api.updateStudent(student.id, {
        name: student.name,
        active: newActiveState
      });
      setSuccess(`Student "${student.name}" status updated successfully!`);
      await loadStudents();
    } catch (err) {
      setError('Failed to toggle status: ' + err.message);
    } finally {
      setUpdatingStudent(null);
    }
  };

  // Holiday management handlers
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayDate || !holidayDesc.trim()) return;

    setAddingHoliday(true);
    setError('');
    setSuccess('');
    try {
      await api.addHoliday(holidayDate, holidayDesc.trim());
      setSuccess(`Holiday "${holidayDesc.trim()}" added successfully!`);
      setHolidayDate('');
      setHolidayDesc('');
      await loadHolidays();
    } catch (err) {
      setError('Failed to add holiday: ' + err.message);
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id, desc) => {
    setDeletingHoliday(id);
    setError('');
    setSuccess('');
    try {
      await api.deleteHoliday(id);
      setSuccess(`Holiday "${desc}" deleted successfully.`);
      await loadHolidays();
    } catch (err) {
      setError('Failed to delete holiday: ' + err.message);
    } finally {
      setDeletingHoliday(null);
    }
  };

  // Email report handler
  const handleSendEmailReport = async () => {
    setEmailSending(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.sendMonthlyReportEmail(selectedYear, selectedMonth);
      setSuccess(res.message || 'Email Monthly Analysis report dispatched successfully! (Check System Logs for output)');
    } catch (err) {
      setError('Failed to send email analysis report: ' + err.message);
    } finally {
      setEmailSending(false);
    }
  };

  // Calculations
  const totalActiveStudents = allStudents.filter(s => s.active === 1).length;
  const attendanceRate = todayStats.total > 0 ? Math.round((todayStats.present / todayStats.total) * 100) : 0;

  const filteredStudentsForManage = allStudents.filter(student => {
    if (showInactive) return true;
    return student.active === 1;
  });

  const filteredMonthlySummary = monthlySummary.filter(student =>
    student.name.toLowerCase().includes(monthlySearch.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/logo.jpeg" alt="Logo" className="header-logo" style={{ borderRadius: '50%', border: '1px solid var(--border-color)' }} />
          <div className="header-title">
            <h1>My Chhota School</h1>
            <p>Owner Dashboard</p>
          </div>
        </div>
        <div className="header-user">
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-role">Administrator</div>
          </div>
          <button onClick={onLogout} className="btn btn-secondary" style={{ minHeight: '40px', padding: '0 16px', fontSize: '14px' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Alert boxes */}
      {error && <div className="alert alert-danger" id="owner-error-alert">{error}</div>}
      {success && <div className="alert alert-success" id="owner-success-alert">{success}</div>}

      {/* Tabs */}
      <nav className="tabs">
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          Today's Overview
        </button>
        <button className={`tab-btn ${activeTab === 'past' ? 'active' : ''}`} onClick={() => setActiveTab('past')}>
          Past Records
        </button>
        <button className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`} onClick={() => setActiveTab('monthly')}>
          Monthly Report
        </button>
        <button className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
          Student Management
        </button>
        <button className={`tab-btn ${activeTab === 'holidays' ? 'active' : ''}`} onClick={() => setActiveTab('holidays')}>
          Holidays Manager
        </button>
        <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          System Logs
        </button>
      </nav>

      {/* TAB CONTENT: 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div>
          {/* Stats Bar */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Present</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{todayStats.present}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Absent</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{todayStats.absent}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Submitted</div>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>
                {todayStats.total} / {totalActiveStudents || todayStats.total}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Attendance Rate</div>
              <div className="stat-value">{attendanceRate}%</div>
            </div>
          </div>

          {/* Submission Details */}
          <div className="card">
            <h3 style={{ marginBottom: '12px' }}>Submission Status</h3>
            {todayStats.submitted ? (
              <div className="alert alert-success" style={{ margin: 0 }}>
                <span>
                  Submitted by <strong>{todayStats.markedBy}</strong> at{' '}
                  <strong>{new Date(todayStats.timestamp).toLocaleTimeString()}</strong>.
                </span>
              </div>
            ) : (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <span>Today's attendance has not been submitted by any teacher yet.</span>
              </div>
            )}
          </div>

          {/* Today's student table */}
          {todayStats.records.length > 0 ? (
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ marginBottom: '12px' }}>Today's Roll Call</h3>
              <div className="table-wrapper">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Status</th>
                      <th>Marked By</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayStats.records.map((record) => (
                      <tr key={record.id}>
                        <td style={{ fontWeight: '600' }}>{record.student_name}</td>
                        <td>
                          <span className={`badge ${record.status === 'Present' ? 'badge-success' : 'badge-danger'}`}>
                            {record.status}
                          </span>
                        </td>
                        <td>{record.marked_by}</td>
                        <td>{new Date(record.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB CONTENT: 2. PAST RECORDS */}
      {activeTab === 'past' && (
        <div>
          <div className="card">
            <div className="view-header">
              <h2>Historical Attendance Search</h2>
              <div className="date-selector-form">
                <label htmlFor="past-date">Select Date:</label>
                <input
                  id="past-date"
                  type="date"
                  className="form-control"
                  style={{ width: 'auto' }}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>

            {pastRecords.submitted ? (
              <div style={{ marginTop: '16px' }}>
                <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                  <span>
                    Marked by <strong>{pastRecords.markedBy}</strong> on{' '}
                    <strong>{new Date(pastRecords.timestamp).toLocaleDateString()}</strong> at{' '}
                    <strong>{new Date(pastRecords.timestamp).toLocaleTimeString()}</strong>.
                  </span>
                </div>

                <div className="table-wrapper">
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Status</th>
                        <th>Marked By</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastRecords.records.map((record) => (
                        <tr key={record.id}>
                          <td style={{ fontWeight: '600' }}>{record.student_name}</td>
                          <td>
                            <span className={`badge ${record.status === 'Present' ? 'badge-success' : 'badge-danger'}`}>
                              {record.status}
                            </span>
                          </td>
                          <td>{record.marked_by}</td>
                          <td>{new Date(record.timestamp).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="alert alert-danger" style={{ marginTop: '16px', margin: 0 }}>
                <span>No attendance records were found for the selected date.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. MONTHLY REPORT */}
      {activeTab === 'monthly' && (
        <div className="card">
          <div className="view-header">
            <h2>Monthly Attendance Breakdown</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="form-control"
                style={{ width: 'auto' }}
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {[2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                className="form-control"
                style={{ width: 'auto' }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const date = new Date(2000, m - 1, 1);
                  return (
                    <option key={m} value={m}>
                      {date.toLocaleString('default', { month: 'long' })}
                    </option>
                  );
                })}
              </select>
              <button 
                onClick={handleSendEmailReport}
                className="btn btn-primary"
                style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}
                disabled={emailSending}
              >
                {emailSending ? 'Sending...' : '✉️ Email Analysis Report'}
              </button>
            </div>
          </div>

          {/* Search Filter */}
          <div className="search-bar" style={{ marginBottom: '20px' }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="form-control search-input"
              placeholder="Filter report by student name..."
              value={monthlySearch}
              onChange={(e) => setMonthlySearch(e.target.value)}
            />
          </div>

          {filteredMonthlySummary.length > 0 ? (
            <div className="table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Status</th>
                    <th>Present Days</th>
                    <th>Absent Days</th>
                    <th>Total School Days</th>
                    <th>Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMonthlySummary.map((student) => {
                    const percent = student.total_days > 0 ? Math.round((student.present_days / student.total_days) * 100) : 0;
                    let badgeClass = "badge-success";
                    if (percent < 75) badgeClass = "badge-danger";
                    else if (percent < 90) badgeClass = "badge-warning";

                    return (
                      <tr key={student.student_id}>
                        <td style={{ fontWeight: '600' }}>
                          {student.name} {!student.active && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>(Inactive)</span>}
                        </td>
                        <td>
                          <span className={`badge ${student.active ? 'badge-success' : 'badge-danger'}`}>
                            {student.active ? 'Active' : 'Left'}
                          </span>
                        </td>
                        <td style={{ fontWeight: '700', color: 'var(--success-text)' }}>{student.present_days}</td>
                        <td style={{ fontWeight: '700', color: 'var(--danger-text)' }}>{student.absent_days}</td>
                        <td>{student.total_days}</td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{percent}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert alert-warning" style={{ margin: 0 }}>
              <span>No attendance data available for the chosen parameters.</span>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: 4. STUDENT MANAGEMENT */}
      {activeTab === 'students' && (
        <div>
          {/* Add Student Card */}
          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>Add New Student</h3>
            <form onSubmit={handleAddStudent} className="add-student-form">
              <div className="form-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter student's full name"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Add Student
              </button>
            </form>
          </div>

          {/* Student list card */}
          <div className="card">
            <div className="view-header" style={{ marginBottom: '20px' }}>
              <h2>Student Roster</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input
                  id="chk-show-inactive"
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="chk-show-inactive" style={{ fontWeight: '600', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Show Inactive / Left Students
                </label>
              </div>
            </div>

            <div className="student-manage-list">
              {filteredStudentsForManage.length > 0 ? (
                filteredStudentsForManage.map((student) => (
                  <div key={student.id} className={`student-manage-item ${student.active === 0 ? 'inactive' : ''}`}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '16px' }}>{student.name}</span>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Added on: {new Date(student.date_added).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => handleToggleStudentActive(student)}
                        className={`btn ${student.active === 1 ? 'btn-danger' : 'btn-success'}`}
                        style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}
                        disabled={updatingStudent === student.id}
                      >
                        {updatingStudent === student.id
                          ? 'Updating...'
                          : student.active === 1
                          ? 'Mark Inactive (Left)'
                          : 'Mark Active (Rejoin)'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="alert alert-warning" style={{ margin: 0 }}>
                  <span>No students found in the roster.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 5. HOLIDAYS MANAGER */}
      {activeTab === 'holidays' && (
        <div>
          {/* Add Holiday Card */}
          <div className="card">
            <h3 style={{ marginBottom: '16px' }}>Add Holiday Date</h3>
            <form onSubmit={handleAddHoliday} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <input
                  type="date"
                  className="form-control"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  required
                />
              </div>
              <div style={{ flex: 2, minWidth: '200px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Holiday Description (e.g. Independence Day)"
                  value={holidayDesc}
                  onChange={(e) => setHolidayDesc(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={addingHoliday}>
                {addingHoliday ? 'Adding...' : 'Add Holiday'}
              </button>
            </form>
          </div>

          {/* Holidays list card */}
          <div className="card">
            <h2 style={{ marginBottom: '16px' }}>School Holidays</h2>
            {holidays.length > 0 ? (
              <div className="student-manage-list">
                {holidays.map((h) => (
                  <div key={h.id} className="student-manage-item">
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '16px' }}>
                        {new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Description: {h.description}
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id, h.description)}
                        className="btn btn-danger"
                        style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}
                        disabled={deletingHoliday === h.id}
                      >
                        {deletingHoliday === h.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <span>No holidays registered in the database yet.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 6. SYSTEM LOGS */}
      {activeTab === 'logs' && (
        <div className="card">
          <h2 style={{ marginBottom: '8px' }}>Notification & Scheduler Logs</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Below is the log of automatic background jobs (e.g. daily 10:00 AM teacher reminders and owner submit reports):
          </p>
          <div className="notification-logs">
            {notificationLogs.length > 0 ? (
              notificationLogs.map((log, index) => (
                <div key={index} className="notification-item">
                  <span style={{ color: 'var(--primary)', fontWeight: '600' }}>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>{' '}
                  <span style={{ color: log.type === 'error' ? 'var(--danger-text)' : 'var(--text-primary)' }}>
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                No background system events logged yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
