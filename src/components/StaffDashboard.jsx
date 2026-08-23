import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function StaffDashboard({ user, onLogout }) {
  // Navigation State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(null); // 1-indexed (null = month grid)
  const [selectedDay, setSelectedDay] = useState(null); // 1-indexed (null = day grid)

  // Staff Roster & Attendance states
  const [staffMembers, setStaffMembers] = useState([]);
  const [attendance, setAttendance] = useState({}); // { staffMemberId: 'Present' | 'Absent' }
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

  // Roster Management
  const [newStaffName, setNewStaffName] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [rosterStaff, setRosterStaff] = useState([]);
  const [showInactiveStaff, setShowInactiveStaff] = useState(false);
  const [updatingStaff, setUpdatingStaff] = useState(null);
  const [deletingStaff, setDeletingStaff] = useState(null);
  const [showRoster, setShowRoster] = useState(false);

  // Years array
  const years = [2026, 2027, 2028, 2029, 2030];

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

  const formatDateString = (y, m, d) => {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const getDaysInMonth = (y, m) => {
    return new Date(y, m, 0).getDate();
  };

  // Load all staff members (both active and inactive) for roster management
  const loadStaffRoster = async () => {
    try {
      const activeOnlyList = await api.getStaffMembers(true);
      const allList = await api.getStaffMembers(false);
      setStaffMembers(activeOnlyList);
      setRosterStaff(allList);
    } catch (err) {
      setError('Failed to load staff roster: ' + err.message);
    }
  };

  // Load Month Data (Holidays and submitted logs for calendar days grid)
  const loadMonthData = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setError('');
    try {
      const [allHolidays, logs] = await Promise.all([
        api.getHolidays(),
        api.getStaffMonthlyLog(selectedYear, selectedMonth)
      ]);
      const monthPattern = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      setMonthHolidays(allHolidays.filter(h => h.date.startsWith(monthPattern)));
      setMonthLogs(logs);
    } catch (err) {
      setError('Failed to load calendar data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Day Details for selected date
  const loadDayDetails = async (day) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // Load active staff members
      const activeStaffList = await api.getStaffMembers(true);
      setStaffMembers(activeStaffList);

      const targetDate = formatDateString(selectedYear, selectedMonth, day);
      const [allHolidays, existingRecords] = await Promise.all([
        api.getHolidays(),
        api.getStaffAttendance(targetDate)
      ]);

      // Check Sunday or Holiday
      const d = new Date(targetDate + 'T00:00:00');
      const isSunday = d.getDay() === 0;
      const foundHoliday = allHolidays.find(h => h.date === targetDate);

      const isHoliday = isSunday || !!foundHoliday;
      const holidayDescription = isSunday ? 'Sunday - Weekly Holiday' : (foundHoliday ? foundHoliday.description : '');

      let submitted = false;
      let markedBy = '';
      let timestamp = '';
      const initialMap = {};

      if (existingRecords.length > 0) {
        submitted = true;
        markedBy = existingRecords[0].marked_by;
        timestamp = existingRecords[0].timestamp;
        existingRecords.forEach(r => {
          initialMap[r.staff_member_id] = r.status;
        });
      } else {
        // Default all active staff to Present for new day
        activeStaffList.forEach(s => {
          initialMap[s.id] = 'Present';
        });
      }

      setAttendance(initialMap);
      setDayStatus({
        submitted,
        markedBy,
        timestamp,
        isLocked: isHoliday,
        isHoliday,
        isSundayHoliday: isSunday,
        holidayDescription
      });
    } catch (err) {
      setError('Failed to load day details: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // On Year / Month change -> refresh month calendar data
  useEffect(() => {
    if (selectedMonth) {
      loadMonthData();
    }
  }, [selectedYear, selectedMonth]);

  // On Day selection -> load day details
  useEffect(() => {
    if (selectedDay) {
      loadDayDetails(selectedDay);
    }
  }, [selectedDay]);

  // On component load -> default to current date
  useEffect(() => {
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = today.getMonth() + 1;
    const currDay = today.getDate();

    setSelectedYear(currYear);
    setSelectedMonth(currMonth);
    setSelectedDay(currDay);
    loadStaffRoster();
  }, []);

  const handleYearChange = (y) => {
    setSelectedYear(y);
    setSelectedMonth(null);
    setSelectedDay(null);
  };

  const handleMonthClick = (m) => {
    setSelectedMonth(m);
    setSelectedDay(null);
  };

  const handleDayClick = (d) => {
    setSelectedDay(d);
  };

  const handleStatusToggle = (staffId, newStatus) => {
    if (dayStatus.isLocked) return;
    setAttendance(prev => ({
      ...prev,
      [staffId]: newStatus
    }));
  };

  const handleMarkAll = (status) => {
    if (dayStatus.isLocked) return;
    const updated = {};
    staffMembers.forEach(s => {
      updated[s.id] = status;
    });
    setAttendance(updated);
  };

  const handleSubmitAttendance = async (e) => {
    e.preventDefault();
    if (dayStatus.isLocked) return;

    const dateStr = formatDateString(selectedYear, selectedMonth, selectedDay);
    const payload = Object.keys(attendance).map(id => ({
      staff_member_id: parseInt(id),
      status: attendance[id]
    }));

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.submitStaffAttendance(dateStr, payload);
      setSuccess(`Staff attendance recorded for ${dateStr}!`);
      setDayStatus(prev => ({
        ...prev,
        submitted: true,
        markedBy: res.marked_by,
        timestamp: res.timestamp
      }));
      await loadMonthData();
    } catch (err) {
      setError('Failed to submit staff attendance: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Add Staff Member
  const handleAddStaffMember = async (e) => {
    e.preventDefault();
    if (!newStaffName.trim()) return;

    setAddingStaff(true);
    setError('');
    setSuccess('');

    try {
      const added = await api.addStaffMember(newStaffName.trim());
      setSuccess(`Staff member "${added.name}" added successfully!`);
      setNewStaffName('');
      await loadStaffRoster();
      if (selectedDay) {
        await loadDayDetails(selectedDay);
      }
    } catch (err) {
      setError('Failed to add staff member: ' + err.message);
    } finally {
      setAddingStaff(false);
    }
  };

  // Toggle Staff Active / Inactive
  const handleToggleStaffActive = async (member) => {
    setUpdatingStaff(member.id);
    setError('');
    setSuccess('');
    try {
      const newActive = member.active === 1 ? 0 : 1;
      await api.updateStaffMember(member.id, { name: member.name, active: newActive });
      setSuccess(`Staff member "${member.name}" ${newActive === 1 ? 'reactivated' : 'marked inactive'}.`);
      await loadStaffRoster();
      if (selectedDay) {
        await loadDayDetails(selectedDay);
      }
    } catch (err) {
      setError('Failed to update staff member: ' + err.message);
    } finally {
      setUpdatingStaff(null);
    }
  };

  // Delete Staff Member Permanently
  const handleDeleteStaffPermanently = async (member) => {
    if (!window.confirm(`⚠️ Delete Staff Member?\n\nAre you sure you want to permanently delete "${member.name}"? This cannot be undone.`)) return;

    setDeletingStaff(member.id);
    setError('');
    setSuccess('');
    try {
      await api.deleteStaffMember(member.id);
      setSuccess(`Staff member "${member.name}" deleted permanently.`);
      await loadStaffRoster();
      if (selectedDay) {
        await loadDayDetails(selectedDay);
      }
    } catch (err) {
      setError('Failed to delete staff member: ' + err.message);
    } finally {
      setDeletingStaff(null);
    }
  };

  const filteredStaffForRollCall = staffMembers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredRosterStaff = rosterStaff.filter(s => {
    if (showInactiveStaff) return true;
    return s.active === 1;
  });

  const totalStaff = staffMembers.length;
  const presentCount = Object.values(attendance).filter(st => st === 'Present').length;
  const absentCount = Object.values(attendance).filter(st => st === 'Absent').length;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/logo.svg" alt="My Chhota School Logo" className="header-logo" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} />
          <div className="header-title">
            <h1>My Chhota School</h1>
            <p>Staff Attendance Manager (LN)</p>
          </div>
        </div>
        <div className="header-user">
          <div className="user-info">
            <div className="user-name">{user.name} (Staff)</div>
            <div className="user-role">Staff Administrator</div>
          </div>
          <button onClick={onLogout} className="btn btn-secondary" style={{ minHeight: '40px', padding: '0 16px', fontSize: '14px' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Alert Messages */}
      {error && <div className="alert alert-danger" id="staff-error-alert">{error}</div>}
      {success && <div className="alert alert-success" id="staff-success-alert">{success}</div>}

      {/* Date Navigation Breadcrumb & Roster Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Breadcrumb path */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '16px' }}>
            <span
              style={{ cursor: 'pointer', color: 'var(--primary)' }}
              onClick={() => { setSelectedMonth(null); setSelectedDay(null); }}
            >
              🗓️ {selectedYear}
            </span>
            {selectedMonth && (
              <>
                <span>/</span>
                <span
                  style={{ cursor: selectedDay ? 'pointer' : 'default', color: selectedDay ? 'var(--primary)' : 'var(--text-primary)' }}
                  onClick={() => setSelectedDay(null)}
                >
                  {allMonths.find(m => m.value === selectedMonth)?.name}
                </span>
              </>
            )}
            {selectedDay && (
              <>
                <span>/</span>
                <span style={{ color: 'var(--text-primary)' }}>Day {selectedDay}</span>
              </>
            )}
          </div>

          {/* Roster toggle & Year selector */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '13px', padding: '0 12px', minHeight: '36px' }}
              onClick={() => setShowRoster(!showRoster)}
            >
              👥 {showRoster ? 'Close Staff Roster' : 'Manage Staff Roster'}
            </button>

            <select
              className="form-control"
              style={{ width: 'auto', minHeight: '36px', fontSize: '14px' }}
              value={selectedYear}
              onChange={(e) => handleYearChange(parseInt(e.target.value))}
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* STAFF ROSTER MANAGEMENT PANEL */}
      {showRoster && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '16px' }}>Add Staff & Roster Management</h3>

          {/* Add Staff Form */}
          <form onSubmit={handleAddStaffMember} className="add-student-form" style={{ marginBottom: '20px' }}>
            <div className="form-group">
              <input
                type="text"
                className="form-control"
                placeholder="Enter new staff member's full name (e.g. Ramesh Kumar)"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={addingStaff}>
              {addingStaff ? 'Adding...' : '➕ Add Staff'}
            </button>
          </form>

          {/* Show Inactive Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4>Staff Members Roster ({filteredRosterStaff.length})</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <input
                id="chk-inactive-staff"
                type="checkbox"
                checked={showInactiveStaff}
                onChange={(e) => setShowInactiveStaff(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="chk-inactive-staff" style={{ cursor: 'pointer', fontWeight: '600' }}>Show Inactive Staff</label>
            </div>
          </div>

          {/* Roster List */}
          <div className="student-manage-list">
            {filteredRosterStaff.map(member => (
              <div key={member.id} className={`student-manage-item ${member.active === 0 ? 'inactive' : ''}`}>
                <div>
                  <span style={{ fontWeight: '700', fontSize: '16px' }}>{member.name}</span>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Added on: {new Date(member.date_added).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleStaffActive(member)}
                    className={`btn ${member.active === 1 ? 'btn-secondary' : 'btn-success'}`}
                    style={{ minHeight: '32px', fontSize: '12px', padding: '0 12px' }}
                    disabled={updatingStaff === member.id}
                  >
                    {updatingStaff === member.id ? 'Updating...' : (member.active === 1 ? 'Mark Inactive' : 'Reactivate')}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteStaffPermanently(member)}
                    className="btn btn-danger"
                    style={{ minHeight: '32px', fontSize: '12px', padding: '0 12px' }}
                    disabled={deletingStaff === member.id}
                  >
                    {deletingStaff === member.id ? 'Deleting...' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 1: MONTH SELECTION GRID (When no month selected) */}
      {!selectedMonth && (
        <div className="card">
          <h2 style={{ marginBottom: '16px' }}>Select Month ({selectedYear})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {months.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => handleMonthClick(m.value)}
                className="btn btn-secondary"
                style={{
                  padding: '20px 12px',
                  fontSize: '16px',
                  fontWeight: '700',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>📅</span>
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: DAYS CALENDAR GRID (When month selected, but no day selected) */}
      {selectedMonth && !selectedDay && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '36px', padding: '0 12px' }}
              onClick={() => setSelectedMonth(null)}
            >
              ← Back to Months
            </button>
            <h2 style={{ fontSize: '20px' }}>
              {allMonths.find(m => m.value === selectedMonth)?.name} {selectedYear} - Staff Attendance
            </h2>
          </div>

          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Click on any day in the grid below to view or mark staff attendance:
          </p>

          {/* Days Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '10px',
            textAlign: 'center',
            marginBottom: '20px'
          }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((wd, index) => (
              <div key={index} style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-muted)' }}>{wd}</div>
            ))}

            {Array.from({ length: new Date(selectedYear, selectedMonth - 1, 1).getDay() }).map((_, idx) => (
              <div key={`empty-${idx}`}></div>
            ))}

            {Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }).map((_, idx) => {
              const day = idx + 1;
              const dateStr = formatDateString(selectedYear, selectedMonth, day);
              const isSunday = new Date(selectedYear, selectedMonth - 1, day).getDay() === 0;
              const isHoliday = isSunday || monthHolidays.some(h => h.date === dateStr);
              const isMarked = !isSunday && monthLogs.some(l => l.date === dateStr);

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
      )}

      {/* VIEW 3: DAILY STAFF ROLL CALL (When day selected) */}
      {selectedMonth && selectedDay && (
        <div>
          {/* Day View Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: '36px', padding: '0 12px' }}
              onClick={() => setSelectedDay(null)}
            >
              ← Back to Days Grid
            </button>
            <h2 style={{ fontSize: '20px' }}>
              Staff Roll Call: {formatDateString(selectedYear, selectedMonth, selectedDay)}
            </h2>
          </div>

          {/* Holiday Alert */}
          {dayStatus.isHoliday && (
            <div className="alert alert-danger" style={{ marginBottom: '20px' }}>
              <span>🏖️ <strong>Holiday:</strong> {dayStatus.holidayDescription}</span>
            </div>
          )}

          {/* Submission Status Alert */}
          {dayStatus.submitted && (
            <div className="alert alert-success" style={{ marginBottom: '20px' }}>
              <span>
                ✅ Staff Attendance marked by <strong>{dayStatus.markedBy}</strong> at{' '}
                <strong>{new Date(dayStatus.timestamp).toLocaleTimeString()}</strong>.
              </span>
            </div>
          )}

          {/* Stats & Controls */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', fontSize: '15px', fontWeight: '700' }}>
                <span style={{ color: 'var(--success-text)' }}>Present: {presentCount}</span>
                <span style={{ color: 'var(--danger-text)' }}>Absent: {absentCount}</span>
                <span>Total Active Staff: {totalStaff}</span>
              </div>

              {!dayStatus.isLocked && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleMarkAll('Present')}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 10px', minHeight: '32px' }}
                  >
                    Mark All Present
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkAll('Absent')}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 10px', minHeight: '32px' }}
                  >
                    Mark All Absent
                  </button>
                </div>
              )}
            </div>

            {/* Filter Search */}
            <input
              type="text"
              className="form-control"
              placeholder="Search staff name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: '16px' }}
            />

            {/* Staff Member Attendance List */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>Loading staff roster...</div>
            ) : filteredStaffForRollCall.length > 0 ? (
              <form onSubmit={handleSubmitAttendance}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {filteredStaffForRollCall.map(member => {
                    const status = attendance[member.id] || 'Present';
                    return (
                      <div
                        key={member.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          backgroundColor: 'var(--bg-primary)'
                        }}
                      >
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>{member.name}</span>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            disabled={dayStatus.isLocked}
                            onClick={() => handleStatusToggle(member.id, 'Present')}
                            className={`btn ${status === 'Present' ? 'btn-success' : 'btn-secondary'}`}
                            style={{ minHeight: '36px', padding: '0 16px', fontSize: '14px' }}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            disabled={dayStatus.isLocked}
                            onClick={() => handleStatusToggle(member.id, 'Absent')}
                            className={`btn ${status === 'Absent' ? 'btn-danger' : 'btn-secondary'}`}
                            style={{ minHeight: '36px', padding: '0 16px', fontSize: '14px' }}
                          >
                            Absent
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!dayStatus.isLocked && (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '700' }}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting Staff Attendance...' : 'Save & Submit Staff Attendance'}
                  </button>
                )}
              </form>
            ) : (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <span>No staff members in the roster yet. Use "Manage Staff Roster" above to add staff members!</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
