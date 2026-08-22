import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function TeacherDashboard({ user, onLogout }) {
  // Navigation State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null); // 1-indexed (null means show month grid)
  const [selectedDay, setSelectedDay] = useState(null); // 1-indexed (null means show day grid)
  
  // Roster & Attendance states
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({}); // { studentId: 'Present' | 'Absent' }
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Day Status (Holidays/Attendance)
  const [dayStatus, setDayStatus] = useState({
    submitted: false,
    markedBy: '',
    timestamp: '',
    isLocked: false,
    isHoliday: false,
    holidayDescription: ''
  });

  // Month summary caching (Holidays and logs)
  const [monthHolidays, setMonthHolidays] = useState([]);
  const [monthLogs, setMonthLogs] = useState([]);

  // Holiday adding/deleting states (inside day view)
  const [holidayDesc, setHolidayDesc] = useState('');
  const [updatingHoliday, setUpdatingHoliday] = useState(false);

  // Quick Add / Remove Student
  const [newStudentName, setNewStudentName] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [rosterStudents, setRosterStudents] = useState([]); // for manage panel
  const [removingStudent, setRemovingStudent] = useState(null); // id
  const [showRoster, setShowRoster] = useState(false); // toggle roster list

  // Years array
  const years = [2026, 2027, 2028, 2029, 2030];
  
  // Months array — hide Jan–Aug for 2026 (school started Sep 2026)
  const allMonths = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];
  const months = selectedYear === 2026
    ? allMonths.filter(m => m.value >= 8)
    : allMonths;

  // Helper: Format date string
  const formatDateString = (y, m, d) => {
    const pad = (n) => (n < 10 ? `0${n}` : n);
    return `${y}-${pad(m)}-${pad(d)}`;
  };

  // 1. Load Month-level data (holidays & marked logs)
  const loadMonthData = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setError('');
    try {
      const logs = await api.getMonthlyLog(selectedYear, selectedMonth);
      setMonthLogs(logs);

      const allHolidays = await api.getHolidays();
      const monthPattern = `${selectedYear}-${selectedMonth < 10 ? '0' + selectedMonth : selectedMonth}`;
      const filtered = allHolidays.filter(h => h.date.startsWith(monthPattern));
      setMonthHolidays(filtered);
    } catch (err) {
      setError('Failed to load calendar summaries: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Load Day-specific details
  const loadDayDetails = async (day) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setHolidayDesc('');
    try {
      // A. Load active student list
      const studentList = await api.getStudents(true);
      setStudents(studentList);

      // B. Fetch day status (Holiday and locking status)
      const targetDate = formatDateString(selectedYear, selectedMonth, day);
      const statusRes = await api.getAttendanceStatus(targetDate);
      
      // We need to fetch the status of the specific date
      const statusUrl = `/api/attendance/status?date=${targetDate}`;
      const token = localStorage.getItem('token');
      const statusFetch = await fetch(statusUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dateStatus = await statusFetch.json();

      if (dateStatus.is_holiday) {
        setDayStatus({
          submitted: false,
          markedBy: '',
          timestamp: '',
          isLocked: true,
          isHoliday: true,
          holidayDescription: dateStatus.holiday_description
        });
        setAttendance({});
      } else if (dateStatus.submitted) {
        setDayStatus({
          submitted: true,
          markedBy: dateStatus.marked_by,
          timestamp: dateStatus.timestamp,
          isLocked: dateStatus.is_locked,
          isHoliday: false,
          holidayDescription: ''
        });

        // Fetch marked attendance records for this date
        const records = await api.getAttendance(targetDate);
        const initialAttendance = {};
        records.forEach(r => {
          initialAttendance[r.student_id] = r.status;
        });
        setAttendance(initialAttendance);
      } else {
        setDayStatus({
          submitted: false,
          markedBy: '',
          timestamp: '',
          isLocked: false,
          isHoliday: false,
          holidayDescription: ''
        });
        setAttendance({});
      }
    } catch (err) {
      setError('Failed to load day details: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Trigger loading summaries when year/month changes
  useEffect(() => {
    loadMonthData();
  }, [selectedYear, selectedMonth]);

  // Trigger loading day details when day changes
  useEffect(() => {
    if (selectedDay) {
      loadDayDetails(selectedDay);
    }
  }, [selectedDay]);

  const handleDayClick = (day) => {
    setSelectedDay(day);
  };

  const handleBackToMonths = () => {
    setSelectedMonth(null);
    setSelectedDay(null);
  };

  const handleBackToDays = () => {
    setSelectedDay(null);
    loadMonthData(); // reload month calendar details
  };

  const handleToggle = (studentId, status) => {
    if (dayStatus.isLocked || dayStatus.isHoliday) return;
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
    setError('');
    setSuccess('');
  };

  // Submit daily attendance roll call
  const handleSubmitAttendance = async () => {
    const unmarkedCount = students.length - Object.keys(attendance).length;
    if (unmarkedCount > 0) {
      setError(`Please mark all students. ${unmarkedCount} remaining.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const targetDate = formatDateString(selectedYear, selectedMonth, selectedDay);
      const attendancePayload = Object.entries(attendance).map(([studentId, status]) => ({
        student_id: parseInt(studentId),
        status
      }));

      await api.submitAttendance(targetDate, attendancePayload);
      setSuccess('Attendance locked in successfully!');
      await loadDayDetails(selectedDay);
    } catch (err) {
      setError(err.message || 'Failed to submit attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  // Add holiday for the selected day
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayDesc.trim()) return;

    setUpdatingHoliday(true);
    setError('');
    setSuccess('');

    try {
      const targetDate = formatDateString(selectedYear, selectedMonth, selectedDay);
      await api.addHoliday(targetDate, holidayDesc.trim());
      setSuccess(`Holiday "${holidayDesc.trim()}" added successfully!`);
      await loadDayDetails(selectedDay);
    } catch (err) {
      setError('Failed to add holiday: ' + err.message);
    } finally {
      setUpdatingHoliday(false);
    }
  };

  // Load roster students for the manage panel
  const loadRosterStudents = async () => {
    try {
      const list = await api.getStudents(true);
      setRosterStudents(list);
    } catch {
      // silently ignore
    }
  };

  // Quick Add Student
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;

    setAddingStudent(true);
    setError('');
    setSuccess('');

    try {
      const newStudent = await api.addStudent(newStudentName.trim());
      setSuccess(`Student "${newStudent.name}" added successfully!`);
      setNewStudentName('');
      
      // Refresh both lists
      const studentList = await api.getStudents(true);
      setStudents(studentList);
      setRosterStudents(studentList);
    } catch (err) {
      setError('Failed to add student: ' + err.message);
    } finally {
      setAddingStudent(false);
    }
  };

  // Remove Student (marks as inactive)
  const handleRemoveStudent = async (student) => {
    if (!window.confirm(`Remove "${student.name}" from the roster? They won't appear in future roll calls but their past records are preserved.`)) return;
    setRemovingStudent(student.id);
    setError('');
    setSuccess('');
    try {
      await api.updateStudent(student.id, { name: student.name, active: 0 });
      setSuccess(`"${student.name}" removed from the roster.`);
      const studentList = await api.getStudents(true);
      setRosterStudents(studentList);
      setStudents(studentList);
    } catch (err) {
      setError('Failed to remove student: ' + err.message);
    } finally {
      setRemovingStudent(null);
    }
  };

  // Load roster on mount
  useEffect(() => {
    loadRosterStudents();
  }, []);

  // Get total number of days in selected Month
  const getDaysInMonth = (y, m) => {
    return new Date(y, m, 0).getDate();
  };

  // Search filter
  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(search.toLowerCase())
  );

  const markedCount = Object.keys(attendance).length;
  const progressPercent = students.length > 0 ? Math.round((markedCount / students.length) * 100) : 0;
  const allMarked = markedCount === students.length;

  // Shared Student Manager Panel (Add + Remove)
  const studentManagerPanel = (
    <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
      <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>👨‍🎓 Manage Students</h3>

      {/* Add Student */}
      <form onSubmit={handleAddStudent} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Enter student's full name to add"
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '14px', minHeight: '38px' }}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}
          disabled={addingStudent}
        >
          {addingStudent ? 'Adding...' : '➕ Add Student'}
        </button>
      </form>

      {/* Toggle Roster / Remove */}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: '13px', minHeight: '34px', padding: '0 14px' }}
        onClick={() => {
          if (!showRoster) loadRosterStudents();
          setShowRoster(prev => !prev);
        }}
      >
        {showRoster ? '▲ Hide Roster' : `▼ View & Remove Students (${rosterStudents.length} active)`}
      </button>

      {showRoster && (
        <div style={{ marginTop: '12px', maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
          {rosterStudents.length > 0 ? (
            rosterStudents.map(s => (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '14px'
              }}>
                <span style={{ fontWeight: '600' }}>{s.name}</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ minHeight: '30px', padding: '0 12px', fontSize: '12px' }}
                  disabled={removingStudent === s.id}
                  onClick={() => handleRemoveStudent(s)}
                >
                  {removingStudent === s.id ? 'Removing...' : '✕ Remove'}
                </button>
              </div>
            ))
          ) : (
            <p style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No active students in roster.</p>
          )}
        </div>
      )}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
        Removed students won't appear in future roll calls. Their past attendance records are preserved.
      </p>
    </div>
  );

  return (
    <div className="app-container">
      {/* Header Banner */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/logo.jpeg" alt="Logo" className="header-logo" style={{ borderRadius: '50%', border: '1px solid var(--border-color)' }} />
          <div className="header-title">
            <h1>My Chhota School</h1>
            <p>Teacher Attendance Portal</p>
          </div>
        </div>
        <div className="header-user">
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-role">Teacher</div>
          </div>
          <button onClick={onLogout} className="btn btn-secondary" style={{ minHeight: '40px', padding: '0 16px', fontSize: '14px' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Alerts */}
      {error && <div className="alert alert-danger" id="teacher-error-alert">{error}</div>}
      {success && <div className="alert alert-success" id="teacher-success-alert">{success}</div>}

      {/* LEVEL 1: SELECT MONTH (Default Homepage) */}
      {!selectedMonth && (
        <div>
          {/* Manage Students Panel */}
          {studentManagerPanel}

          {/* Year selector at top */}
          <div className="card" style={{ padding: '16px', marginBottom: '20px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Select Year</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              {years.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`btn ${selectedYear === y ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ minHeight: '38px', padding: '0 20px', fontSize: '14px' }}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Month Cards Grid */}
          <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>Months in {selectedYear}</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '16px'
          }}>
            {months.map(m => {
              // Retrieve stats for this month if available
              const padMonth = m.value < 10 ? '0' + m.value : m.value;
              const monthPrefix = `${selectedYear}-${padMonth}`;
              const logsCount = monthLogs.filter(log => log.date.startsWith(monthPrefix)).length;
              const holidaysCount = monthHolidays.filter(h => h.date.startsWith(monthPrefix)).length;

              return (
                <div
                  key={m.value}
                  onClick={() => setSelectedMonth(m.value)}
                  className="card"
                  style={{
                    padding: '20px 10px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-md)',
                    transition: 'var(--transition)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontWeight: '700', fontSize: '16px', color: 'var(--primary)' }}>{m.name}</span>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    <div>📂 Marked: {logsCount} days</div>
                    <div style={{ color: 'var(--warning-text)' }}>🎉 Holidays: {holidaysCount}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LEVEL 2: CALENDAR DAYS GRID (For selected month) */}
      {selectedMonth && !selectedDay && (
        <div>
          {/* Manage Students Panel */}
          {studentManagerPanel}

          <div className="card">
          <div className="view-header" style={{ marginBottom: '20px' }}>
            <button onClick={handleBackToMonths} className="btn btn-secondary" style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}>
              ← Back to Months
            </button>
            <h2 style={{ fontSize: '22px' }}>
              {months.find(m => m.value === selectedMonth).name} {selectedYear}
            </h2>
          </div>

          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Click on any day in the grid below to mark daily attendance or add/schedule a holiday:
          </p>

          {/* Days Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '10px',
            textAlign: 'center',
            marginBottom: '20px'
          }}>
            {/* Weekdays indicator headers */}
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, index) => (
              <div key={index} style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-muted)' }}>{wd}</div>
            ))}

            {/* Empty placeholders before 1st of month to align days grid */}
            {Array.from({ length: new Date(selectedYear, selectedMonth - 1, 1).getDay() }).map((_, idx) => (
              <div key={`empty-${idx}`}></div>
            ))}

            {/* Clickable Days list */}
            {Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }).map((_, idx) => {
              const day = idx + 1;
              const dateStr = formatDateString(selectedYear, selectedMonth, day);
              
              // Color coding
              const isHoliday = monthHolidays.some(h => h.date === dateStr);
              const isMarked = monthLogs.some(l => l.date === dateStr);
              const localTodayStr = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              })();
              const isToday = localTodayStr === dateStr;

              let dayStyle = {
                aspectRatio: '1',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '15px',
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                transition: 'var(--transition)'
              };

              if (isHoliday) {
                dayStyle.backgroundColor = 'var(--danger-light)';
                dayStyle.color = 'var(--danger-text)';
                dayStyle.borderColor = 'var(--danger)';
              } else if (isMarked) {
                dayStyle.backgroundColor = 'var(--success-light)';
                dayStyle.color = 'var(--success-text)';
                dayStyle.borderColor = 'var(--success)';
              }

              if (isToday) {
                dayStyle.boxShadow = '0 0 0 3px var(--primary-glow)';
                dayStyle.borderColor = 'var(--primary)';
                dayStyle.fontWeight = '900';
              }

              return (
                <div
                  key={day}
                  onClick={() => handleDayClick(day)}
                  style={dayStyle}
                  className="day-grid-icon"
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Quick Color Legend */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}></div>
              <span>Unmarked</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--success-light)', border: '1px solid var(--success)' }}></div>
              <span>Attendance Marked</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--danger-light)', border: '1px solid var(--danger)' }}></div>
              <span>Holiday</span>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* LEVEL 3: DAY DETAILS (Attendance sheet or holiday additions) */}
      {selectedMonth && selectedDay && (
        <div>
          <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
            <div className="view-header">
              <button onClick={handleBackToDays} className="btn btn-secondary" style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}>
                ← Back to Calendar
              </button>
              <h2>
                {months.find(m => m.value === selectedMonth).name} {selectedDay}, {selectedYear}
              </h2>
            </div>
          </div>

          {/* HOLIDAY SECTION */}
          {dayStatus.isHoliday ? (
            <div className="alert alert-warning" style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              🎉 This day is marked as a Holiday: <strong>{dayStatus.holidayDescription}</strong>. Attendance roll is disabled.
            </div>
          ) : (
            <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Mark as Holiday</h3>
              <form onSubmit={handleAddHoliday} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Holiday Reason (e.g. Diwali Vacation)"
                    value={holidayDesc}
                    onChange={(e) => setHolidayDesc(e.target.value)}
                    required
                    style={{ padding: '8px 12px', fontSize: '14px', minHeight: '38px' }}
                  />
                </div>
                <button type="submit" className="btn btn-danger" style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }} disabled={updatingHoliday}>
                  {updatingHoliday ? 'Marking...' : 'Mark Holiday'}
                </button>
              </form>
            </div>
          )}

          {/* ATTENDANCE ROLL SHEET (Only if NOT Holiday) */}
          {!dayStatus.isHoliday && (
            <div>
              {/* Manage Students Panel */}
              {studentManagerPanel}

              {/* Attendance lock status info */}
              {dayStatus.submitted && (
                <div className="card" style={{ padding: '16px', marginBottom: '16px', fontSize: '14px' }}>
                  <p>
                    Attendance was marked by <strong>{dayStatus.markedBy}</strong> at{' '}
                    <strong>{new Date(dayStatus.timestamp).toLocaleTimeString()}</strong>.
                  </p>
                  {!dayStatus.isLocked ? (
                    <p style={{ color: 'var(--warning-text)', fontWeight: '600', marginTop: '4px' }}>
                      ⚠️ Edits are allowed until 12:00 PM today.
                    </p>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontWeight: '600', marginTop: '4px' }}>
                      🔒 locked. Edits are disabled for this date.
                    </p>
                  )}
                </div>
              )}

              {/* Progress bar */}
              <div className="card progress-container" style={{ padding: '16px', marginBottom: '16px' }}>
                <div className="progress-header">
                  <span>Marking Completion</span>
                  <span>{markedCount} of {students.length} students marked</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              {/* Search filter */}
              <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="form-control search-input"
                  placeholder="Filter student..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={dayStatus.isLocked}
                />
              </div>

              {/* Student Checklist Grid */}
              <div className="student-list" style={{ marginBottom: '80px' }}>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const status = attendance[student.id];
                    let cardClass = "student-card";
                    if (status === 'Present') cardClass += " marked-present";
                    if (status === 'Absent') cardClass += " marked-absent";

                    const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                    return (
                      <div key={student.id} className={cardClass}>
                        <div className="student-info">
                          <div className="student-avatar">{initials}</div>
                          <div className="student-name-text">{student.name}</div>
                        </div>
                        <div className="attendance-toggle">
                          <button
                            type="button"
                            onClick={() => handleToggle(student.id, 'Present')}
                            className={`attendance-toggle-btn btn-present ${status === 'Present' ? 'active' : ''}`}
                            disabled={dayStatus.isLocked}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggle(student.id, 'Absent')}
                            className={`attendance-toggle-btn btn-absent ${status === 'Absent' ? 'active' : ''}`}
                            disabled={dayStatus.isLocked}
                          >
                            Absent
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>No active students found matching "{search}"</p>
                  </div>
                )}
              </div>

              {/* Fixed Action Bar at Bottom */}
              <div className="bottom-action-bar">
                <div className="bottom-action-bar-inner">
                  <div className="summary-indicator">
                    {allMarked ? (
                      <span style={{ color: 'var(--success)' }}>✓ All students marked</span>
                    ) : (
                      <span>Remaining: <strong>{students.length - markedCount}</strong></span>
                    )}
                  </div>
                  <button
                    onClick={handleSubmitAttendance}
                    className={`btn ${allMarked ? 'btn-success' : 'btn-primary'}`}
                    disabled={!allMarked || submitting || dayStatus.isLocked}
                    style={{ padding: '0 32px' }}
                  >
                    {submitting ? 'Submitting...' : dayStatus.submitted ? 'Update Attendance' : 'Submit Attendance'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
