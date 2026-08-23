import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';

export default function StaffDashboard({ user, onLogout }) {
  // Navigation State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null); // 1-indexed (null means show month grid)
  const [selectedDay, setSelectedDay] = useState(null); // 1-indexed (null means show day grid)
  
  // Roster & Attendance states
  const [staffList, setStaffList] = useState([]);
  const [attendance, setAttendance] = useState({}); // { staffId: 'Present' | 'Absent' }
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
    isSundayHoliday: false,
    holidayDescription: ''
  });

  // Month summary caching (Holidays and logs)
  const [monthHolidays, setMonthHolidays] = useState([]);
  const [monthLogs, setMonthLogs] = useState([]);

  // Holiday adding/deleting states (inside day view)
  const [holidayDesc, setHolidayDesc] = useState('');
  const [updatingHoliday, setUpdatingHoliday] = useState(false);

  // Quick Add / Remove Staff Member
  const [newStaffName, setNewStaffName] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [rosterStaff, setRosterStaff] = useState([]); // for manage panel
  const [removingStaff, setRemovingStaff] = useState(null); // id
  const [showRoster, setShowRoster] = useState(false); // toggle roster list
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingStaffName, setEditingStaffName] = useState('');

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

  // Get total number of days in selected Month
  const getDaysInMonth = (y, m) => {
    return new Date(y, m, 0).getDate();
  };

  // 1. Load Month-level data (holidays & marked logs)
  const loadMonthData = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setError('');
    try {
      const logs = await api.getStaffMonthlyLog(selectedYear, selectedMonth);
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
      // A. Load active staff list
      const activeList = await api.getStaffMembers(true);
      setStaffList(activeList);

      // B. Fetch day status (Holiday and locking status)
      const targetDate = formatDateString(selectedYear, selectedMonth, day);
      const allHolidays = await api.getHolidays();
      const existingRecords = await api.getStaffAttendance(targetDate);

      // C. Sunday override — auto-holiday
      const dayOfWeek = new Date(selectedYear, selectedMonth - 1, day).getDay();
      const foundHoliday = allHolidays.find(h => h.date === targetDate);

      if (dayOfWeek === 0 && !foundHoliday) {
        setDayStatus({
          submitted: false,
          markedBy: '',
          timestamp: '',
          isLocked: true,
          isHoliday: true,
          isSundayHoliday: true,
          holidayDescription: 'Sunday - Weekly Holiday'
        });
        setAttendance({});
        return;
      }

      if (foundHoliday) {
        setDayStatus({
          submitted: false,
          markedBy: '',
          timestamp: '',
          isLocked: true,
          isHoliday: true,
          isSundayHoliday: false,
          holidayDescription: foundHoliday.description
        });
        setAttendance({});
      } else if (existingRecords.length > 0) {
        setDayStatus({
          submitted: true,
          markedBy: existingRecords[0].marked_by,
          timestamp: existingRecords[0].timestamp,
          isLocked: false,
          isHoliday: false,
          isSundayHoliday: false,
          holidayDescription: ''
        });

        // Fetch marked attendance records for this date
        const initialAttendance = {};
        existingRecords.forEach(r => {
          initialAttendance[r.staff_member_id] = r.status;
        });
        setAttendance(initialAttendance);
      } else {
        setDayStatus({
          submitted: false,
          markedBy: '',
          timestamp: '',
          isLocked: false,
          isHoliday: false,
          isSundayHoliday: false,
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
    loadMonthData();
  };

  const handleToggle = (staffId, status) => {
    if (dayStatus.isLocked || dayStatus.isHoliday) return;
    setAttendance(prev => ({
      ...prev,
      [staffId]: status
    }));
    setError('');
    setSuccess('');
  };

  // Submit daily staff attendance roll call
  const handleSubmitAttendance = async () => {
    const unmarkedCount = staffList.length - Object.keys(attendance).length;
    if (unmarkedCount > 0) {
      setError(`Please mark all staff members. ${unmarkedCount} remaining.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const targetDate = formatDateString(selectedYear, selectedMonth, selectedDay);
      const attendancePayload = Object.entries(attendance).map(([staffId, status]) => ({
        staff_member_id: parseInt(staffId),
        status
      }));

      await api.submitStaffAttendance(targetDate, attendancePayload);
      setSuccess('Staff attendance locked in successfully!');
      await loadDayDetails(selectedDay);
    } catch (err) {
      setError(err.message || 'Failed to submit staff attendance.');
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

  // Load roster staff for the manage panel
  const loadRosterStaff = async () => {
    try {
      const list = await api.getStaffMembers(true);
      setRosterStaff(list);
    } catch {
      // silently ignore
    }
  };

  // Quick Add Staff Member
  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!newStaffName.trim()) return;

    setAddingStaff(true);
    setError('');
    setSuccess('');

    try {
      const newMember = await api.addStaffMember(newStaffName.trim());
      setSuccess(`Staff member "${newMember.name}" added successfully!`);
      setNewStaffName('');
      
      // Refresh both lists
      const list = await api.getStaffMembers(true);
      setStaffList(list);
      setRosterStaff(list);
    } catch (err) {
      setError('Failed to add staff member: ' + err.message);
    } finally {
      setAddingStaff(false);
    }
  };

  // Remove Staff Member (marks as inactive)
  const handleRemoveStaff = async (member) => {
    if (!window.confirm(`Remove "${member.name}" from the staff roster? They won't appear in future roll calls but their past attendance records are preserved.`)) return;
    setRemovingStaff(member.id);
    setError('');
    setSuccess('');
    try {
      await api.updateStaffMember(member.id, { name: member.name, active: 0 });
      setSuccess(`"${member.name}" removed from the staff roster.`);
      const activeList = await api.getStaffMembers(true);
      setRosterStaff(activeList);
      setStaffList(activeList);
    } catch (err) {
      setError('Failed to remove staff member: ' + err.message);
    } finally {
      setRemovingStaff(null);
    }
  };

  // Save edited staff member name
  const handleSaveEditStaffName = async (staffId, active) => {
    if (!editingStaffName.trim()) {
      setError('Staff member name cannot be empty.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.updateStaffMember(staffId, { name: editingStaffName.trim(), active });
      setSuccess(`Staff member name updated to "${editingStaffName.trim()}"!`);
      setEditingStaffId(null);
      setEditingStaffName('');
      const activeList = await api.getStaffMembers(true);
      setRosterStaff(activeList);
      setStaffList(activeList);
    } catch (err) {
      setError('Failed to update staff member name: ' + err.message);
    }
  };

  // Load roster on mount
  useEffect(() => {
    loadRosterStaff();
  }, []);

  // Search filter
  const filteredStaff = staffList.filter(member =>
    member.name.toLowerCase().includes(search.toLowerCase())
  );
  const markedCount = Object.keys(attendance).length;
  const progressPercent = staffList.length > 0 ? Math.round((markedCount / staffList.length) * 100) : 0;
  const allMarked = markedCount === staffList.length;

  // Shared Staff Manager Panel (Add + Remove)
  const staffManagerPanel = (
    <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
      <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>👨‍💼 Manage Staff</h3>

      {/* Add Staff */}
      <form onSubmit={handleAddStaff} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Enter staff's full name to add"
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            style={{ padding: '8px 12px', fontSize: '14px', minHeight: '38px' }}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}
          disabled={addingStaff}
        >
          {addingStaff ? 'Adding...' : '➕ Add Staff'}
        </button>
      </form>

      {/* Toggle Roster / Remove */}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: '13px', minHeight: '34px', padding: '0 14px' }}
        onClick={() => {
          if (!showRoster) loadRosterStaff();
          setShowRoster(prev => !prev);
        }}
      >
        {showRoster ? '▲ Hide Roster' : `▼ View & Edit Staff (${rosterStaff.length} active)`}
      </button>

      {showRoster && (
        <div style={{ marginTop: '12px', maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
          {rosterStaff.length > 0 ? (
            rosterStaff.map(s => {
              const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
              return (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-color)',
                  fontSize: '14px'
                }}>
                  <div className="roster-avatar-initials">{initials}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingStaffId === s.id ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ fontSize: '13px', padding: '2px 6px', minHeight: '30px' }}
                          value={editingStaffName}
                          onChange={(e) => setEditingStaffName(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ minHeight: '30px', padding: '0 10px', fontSize: '12px' }}
                          onClick={() => handleSaveEditStaffName(s.id, s.active)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ minHeight: '30px', padding: '0 10px', fontSize: '12px' }}
                          onClick={() => { setEditingStaffId(null); setEditingStaffName(''); }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontWeight: '600', wordBreak: 'break-word', overflowWrap: 'break-word', display: 'block', lineHeight: '1.3' }}>{s.name}</span>
                    )}
                  </div>

                  {editingStaffId !== s.id && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ minHeight: '30px', padding: '0 10px', fontSize: '12px' }}
                      onClick={() => { setEditingStaffId(s.id); setEditingStaffName(s.name); }}
                    >
                      ✏️ Edit
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ minHeight: '30px', padding: '0 12px', fontSize: '12px' }}
                    disabled={removingStaff === s.id}
                    onClick={() => handleRemoveStaff(s)}
                  >
                    {removingStaff === s.id ? 'Removing...' : '✕ Remove'}
                  </button>
                </div>
              );
            })
          ) : (
            <p style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No active staff in roster.</p>
          )}
        </div>
      )}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
        Removed staff members won't appear in future roll calls. Their past attendance records are preserved.
      </p>
    </div>
  );

  return (
    <div className="app-container">
      {/* Header Banner */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/logo.svg" alt="My Chhota School Logo" className="header-logo" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} />
          <div className="header-title">
            <h1>My Chhota School</h1>
            <p style={{ fontSize: '13px', color: '#FFCC29', fontWeight: '700', margin: '2px 0 0 0' }}>Nakkalagutta Hanamkonda</p>
            <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>Staff Attendance Portal</p>
          </div>
        </div>
        <div className="header-user">
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-role">Staff Manager</div>
          </div>
          <button onClick={onLogout} className="btn btn-secondary" style={{ minHeight: '40px', padding: '0 16px', fontSize: '14px' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Alerts */}
      {error && <div className="alert alert-danger" id="staff-error-alert">{error}</div>}
      {success && <div className="alert alert-success" id="staff-success-alert">{success}</div>}

      {/* LEVEL 1: SELECT MONTH (Default Homepage) */}
      {!selectedMonth && (
        <div>
          {/* Manage Staff Panel */}
          {staffManagerPanel}

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
                    <div>📅 Marked: {logsCount} days</div>
                    <div style={{ color: 'var(--warning-text)' }}>🏖️ Holidays: {holidaysCount}</div>
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
          {/* Manage Staff Panel */}
          {staffManagerPanel}

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

              {/* Empty placeholders before 1st of month */}
              {Array.from({ length: new Date(selectedYear, selectedMonth - 1, 1).getDay() }).map((_, idx) => (
                <div key={`empty-${idx}`}></div>
              ))}

              {/* Clickable Days list */}
              {Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }).map((_, idx) => {
                const day = idx + 1;
                const dateStr = formatDateString(selectedYear, selectedMonth, day);
                
                // Color coding
                const isSunday = new Date(selectedYear, selectedMonth - 1, day).getDay() === 0;
                const isHoliday = isSunday || monthHolidays.some(h => h.date === dateStr);
                const isMarked = !isSunday && monthLogs.some(l => l.date === dateStr);
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
              {dayStatus.isSundayHoliday
                ? '🌅 Sunday - Weekly Holiday. Staff roll call is disabled.'
                : <>🏖️ This day is marked as a Holiday: <strong>{dayStatus.holidayDescription}</strong>. Staff roll call is disabled.</> }
            </div>
          ) : (
            <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Mark as Holiday</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Enter a reason — date is automatically the selected day.</p>
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
              {/* Manage Staff Panel */}
              {staffManagerPanel}

              {/* Attendance submission info */}
              {dayStatus.submitted && (
                <div className="card" style={{ padding: '16px', marginBottom: '16px', fontSize: '14px' }}>
                  <p>
                    Staff Attendance was marked by <strong>{dayStatus.markedBy}</strong> at{' '}
                    <strong>{new Date(dayStatus.timestamp).toLocaleTimeString()}</strong>.
                  </p>
                </div>
              )}

              {/* Progress bar */}
              <div className="card progress-container" style={{ padding: '16px', marginBottom: '16px' }}>
                <div className="progress-header">
                  <span>Marking Completion</span>
                  <span>{markedCount} of {staffList.length} staff marked</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              {/* Quick Action Helper Buttons for Staff */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', padding: '6px 14px', minHeight: '34px' }}
                  disabled={dayStatus.isLocked || dayStatus.isHoliday}
                  onClick={() => {
                    const newMap = { ...attendance };
                    staffList.forEach(s => { newMap[s.id] = 'Present'; });
                    setAttendance(newMap);
                  }}
                >
                  ✓ Mark All Present
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', padding: '6px 14px', minHeight: '34px' }}
                  disabled={dayStatus.isLocked || dayStatus.isHoliday}
                  onClick={() => {
                    const newMap = { ...attendance };
                    staffList.forEach(s => { newMap[s.id] = 'Absent'; });
                    setAttendance(newMap);
                  }}
                >
                  ✕ Mark All Absent
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ fontSize: '13px', padding: '6px 14px', minHeight: '34px' }}
                  disabled={dayStatus.isLocked || dayStatus.isHoliday}
                  onClick={async () => {
                    const targetDate = formatDateString(selectedYear, selectedMonth, selectedDay);
                    if (!window.confirm(`Clear staff attendance selection for ${targetDate}?`)) return;
                    try {
                      if (dayStatus.submitted) {
                        await api.clearStaffAttendance(targetDate);
                        setSuccess(`Staff attendance for ${targetDate} cleared from database!`);
                      } else {
                        setSuccess('Staff attendance selections reset.');
                      }
                      setAttendance({});
                      await loadDayDetails(selectedDay);
                    } catch (err) {
                      setError('Failed to clear staff attendance: ' + err.message);
                    }
                  }}
                >
                  🧹 Clear Attendance
                </button>
              </div>

              {/* Search filter */}
              <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="form-control search-input"
                  placeholder="Filter staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={dayStatus.isLocked}
                />
              </div>

              {/* Staff Checklist Grid */}
              <div className="student-list" style={{ marginBottom: '80px' }}>
                {filteredStaff.length > 0 ? (
                  filteredStaff.map((member) => {
                    const status = attendance[member.id];
                    let cardClass = "student-card";
                    if (status === 'Present') cardClass += " marked-present";
                    if (status === 'Absent') cardClass += " marked-absent";

                    const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                    return (
                      <div key={member.id} className={cardClass}>
                        <div className="student-info">
                          <div className="student-avatar">{initials}</div>
                          <div className="student-name-text" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {editingStaffId === member.id ? (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  className="form-control"
                                  style={{ fontSize: '13px', padding: '2px 6px', height: '28px' }}
                                  value={editingStaffName}
                                  onChange={(e) => setEditingStaffName(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="btn btn-success"
                                  style={{ minHeight: '28px', padding: '0 8px', fontSize: '11px' }}
                                  onClick={() => handleSaveEditStaffName(member.id, member.active)}
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ minHeight: '28px', padding: '0 8px', fontSize: '11px' }}
                                  onClick={() => { setEditingStaffId(null); setEditingStaffName(''); }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <>
                                <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.3' }}>{member.name}</span>
                                <button
                                  type="button"
                                  title="Edit staff member name"
                                  onClick={(e) => { e.stopPropagation(); setEditingStaffId(member.id); setEditingStaffName(member.name); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: 0.7, padding: '2px' }}
                                >
                                  ✏️
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="attendance-toggle">
                          <button
                            type="button"
                            onClick={() => handleToggle(member.id, 'Present')}
                            className={`attendance-toggle-btn btn-present ${status === 'Present' ? 'active' : ''}`}
                            disabled={dayStatus.isLocked}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggle(member.id, 'Absent')}
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
                    <p style={{ color: 'var(--text-secondary)' }}>No active staff members found matching "{search}"</p>
                  </div>
                )}
              </div>

              {/* Fixed Action Bar at Bottom */}
              <div className="bottom-action-bar">
                <div className="bottom-action-bar-inner">
                  <div className="summary-indicator">
                    {allMarked ? (
                      <span style={{ color: 'var(--success)' }}>✅ All staff marked</span>
                    ) : (
                      <span>Remaining: <strong>{staffList.length - markedCount}</strong></span>
                    )}
                  </div>
                  <button
                    onClick={handleSubmitAttendance}
                    className={`btn ${allMarked ? 'btn-success' : 'btn-primary'}`}
                    disabled={!allMarked || submitting || dayStatus.isLocked}
                    style={{ padding: '0 32px' }}
                  >
                    {submitting ? 'Submitting...' : dayStatus.submitted ? 'Update Staff Attendance' : 'Submit Staff Attendance'}
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
