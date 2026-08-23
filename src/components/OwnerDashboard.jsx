import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';

export default function OwnerDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'past' | 'monthly' | 'students' | 'staff' | 'holidays' | 'logs'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 1. Overview (Today's Stats & Roll Call Marking)
  const [todayStats, setTodayStats] = useState({
    submitted: false,
    markedBy: '',
    timestamp: '',
    present: 0,
    absent: 0,
    total: 0,
    records: []
  });
  const [todayStudentAttendance, setTodayStudentAttendance] = useState({});
  const [submittingTodayAttendance, setSubmittingTodayAttendance] = useState(false);

  // 2. Past Records View
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [pastRecords, setPastRecords] = useState({
    submitted: false,
    markedBy: '',
    timestamp: '',
    records: []
  });
  const [pastStudentAttendance, setPastStudentAttendance] = useState({});
  const [submittingPastAttendance, setSubmittingPastAttendance] = useState(false);

  // 3. Monthly Reports
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-indexed
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // 4. Student Management
  const [allStudents, setAllStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentTeacherId, setNewStudentTeacherId] = useState('');
  const [updatingStudent, setUpdatingStudent] = useState(null);
  const [deletingStudentPermanently, setDeletingStudentPermanently] = useState(null);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editingStudentName, setEditingStudentName] = useState('');

  // 5. Staff Management & Staff Attendance (For Principal / Owner)
  const [selectedStaffDate, setSelectedStaffDate] = useState(getLocalDateString());
  const [staffMembers, setStaffMembers] = useState([]);
  const [rosterStaff, setRosterStaff] = useState([]);
  const [staffAttendanceMap, setStaffAttendanceMap] = useState({});
  const [staffDayStatus, setStaffDayStatus] = useState({ submitted: false, markedBy: '', timestamp: '' });
  const [newStaffName, setNewStaffName] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [updatingStaff, setUpdatingStaff] = useState(null);
  const [deletingStaff, setDeletingStaff] = useState(null);
  const [submittingStaffAttendance, setSubmittingStaffAttendance] = useState(false);
  const [showStaffRoster, setShowStaffRoster] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingStaffName, setEditingStaffName] = useState('');

  // 6. Holiday Management
  const [holidays, setHolidays] = useState([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState(null);

  // 7. Notification Logs
  const [notificationLogs, setNotificationLogs] = useState([]);

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(null);

  // Compress image to base64
  const compressImage = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 800;
          let { width, height } = img;
          if (width > MAX) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleOwnerPhotoUpload = useCallback(async (student, file) => {
    if (!file) return;
    setUploadingPhoto(student.id);
    setError('');
    try {
      const compressed = await compressImage(file);
      await api.uploadStudentPhoto(student.id, compressed);
      setSuccess(`Photo updated for "${student.name}"!`);
      await loadStudents();
    } catch (err) {
      setError('Failed to upload photo: ' + err.message);
    } finally {
      setUploadingPhoto(null);
    }
  }, [compressImage]);

  // Load Today's overview data
  const loadTodayOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const todayStr = getLocalDateString();
      const records = await api.getAttendance(todayStr);
      const statusRes = await api.getAttendanceStatus();
      const activeStudentsList = await api.getStudents(true);
      setAllStudents(activeStudentsList);
      
      const presentCount = records.filter(r => r.status === 'Present').length;
      const absentCount = records.filter(r => r.status === 'Absent').length;

      const map = {};
      if (records.length > 0) {
        records.forEach(r => { map[r.student_id] = r.status; });
      } else {
        activeStudentsList.forEach(s => { map[s.id] = 'Present'; });
      }
      setTodayStudentAttendance(map);

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

  // Submit Today Student Attendance as Principal
  const handleSubmitTodayStudentAttendance = async () => {
    const activeStudentsList = await api.getStudents(true);
    const payload = activeStudentsList.map(s => ({
      student_id: s.id,
      status: todayStudentAttendance[s.id] || 'Present'
    }));

    setSubmittingTodayAttendance(true);
    setError('');
    setSuccess('');

    try {
      const todayStr = getLocalDateString();
      await api.submitAttendance(todayStr, payload);
      setSuccess("Today's student attendance submitted successfully by Principal!");
      await loadTodayOverview();
    } catch (err) {
      setError('Failed to submit attendance: ' + err.message);
    } finally {
      setSubmittingTodayAttendance(false);
    }
  };

  // Load Past Records by date
  const loadPastRecords = async (date) => {
    setLoading(true);
    setError('');
    try {
      const records = await api.getAttendance(date);
      const activeStudentsList = await api.getStudents(true);
      setAllStudents(activeStudentsList);
      
      let markedBy = 'N/A';
      let timestamp = '';
      let submitted = false;

      const map = {};
      if (records.length > 0) {
        submitted = true;
        markedBy = records[0].marked_by;
        timestamp = records[0].timestamp;
        records.forEach(r => { map[r.student_id] = r.status; });
      } else {
        activeStudentsList.forEach(s => { map[s.id] = 'Present'; });
      }
      setPastStudentAttendance(map);

      setPastRecords({
        submitted,
        markedBy,
        timestamp,
        records: records
      });
    } catch (err) {
      setError('Failed to load past records: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Past Student Attendance as Principal
  const handleSubmitPastStudentAttendance = async () => {
    const activeStudentsList = await api.getStudents(true);
    const payload = activeStudentsList.map(s => ({
      student_id: s.id,
      status: pastStudentAttendance[s.id] || 'Present'
    }));

    setSubmittingPastAttendance(true);
    setError('');
    setSuccess('');

    try {
      await api.submitAttendance(selectedDate, payload);
      setSuccess(`Student attendance for ${selectedDate} updated by Principal!`);
      await loadPastRecords(selectedDate);
    } catch (err) {
      setError('Failed to update past attendance: ' + err.message);
    } finally {
      setSubmittingPastAttendance(false);
    }
  };

  // Load Monthly Summary Breakdown
  const loadMonthlySummary = async () => {
    setLoading(true);
    setError('');
    try {
      const summary = await api.getMonthlySummary(selectedYear, selectedMonth);
      setMonthlySummary(summary);
    } catch (err) {
      setError('Failed to load monthly summary: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Student List & Teachers
  const loadStudents = async () => {
    try {
      const [list, teachersList] = await Promise.all([
        api.getStudents(false),
        api.getTeachers()
      ]);
      setAllStudents(list);
      setTeachers(teachersList);
    } catch (err) {
      setError('Failed to load students/teachers: ' + err.message);
    }
  };

  // Staff Management Data Loading
  const loadStaffData = async (dateStr) => {
    try {
      const activeList = await api.getStaffMembers(true);
      const allList = await api.getStaffMembers(false);
      setStaffMembers(activeList);
      setRosterStaff(allList);

      const records = await api.getStaffAttendance(dateStr);
      const initialMap = {};
      if (records.length > 0) {
        records.forEach(r => { initialMap[r.staff_member_id] = r.status; });
        setStaffDayStatus({ submitted: true, markedBy: records[0].marked_by, timestamp: records[0].timestamp });
      } else {
        activeList.forEach(s => { initialMap[s.id] = 'Present'; });
        setStaffDayStatus({ submitted: false, markedBy: '', timestamp: '' });
      }
      setStaffAttendanceMap(initialMap);
    } catch (err) {
      setError('Failed to load staff data: ' + err.message);
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
      await loadStaffData(selectedStaffDate);
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
      await loadStaffData(selectedStaffDate);
    } catch (err) {
      setError('Failed to update staff member: ' + err.message);
    } finally {
      setUpdatingStaff(null);
    }
  };

  // Delete Staff Member Permanently
  const handleDeleteStaffPermanently = async (member) => {
    if (!window.confirm(`⚠️ Are you sure you want to permanently delete "${member.name}"?`)) return;
    setDeletingStaff(member.id);
    setError('');
    setSuccess('');
    try {
      await api.deleteStaffMember(member.id);
      setSuccess(`Staff member "${member.name}" deleted permanently.`);
      await loadStaffData(selectedStaffDate);
    } catch (err) {
      setError('Failed to delete staff member: ' + err.message);
    } finally {
      setDeletingStaff(null);
    }
  };

  // Submit Staff Attendance as Principal
  const handleSubmitStaffAttendance = async (e) => {
    e.preventDefault();
    const payload = staffMembers.map(s => ({
      staff_member_id: s.id,
      status: staffAttendanceMap[s.id] || 'Present'
    }));

    setSubmittingStaffAttendance(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.submitStaffAttendance(selectedStaffDate, payload);
      setSuccess(`Staff attendance marked for ${selectedStaffDate} by Principal!`);
      setStaffDayStatus({ submitted: true, markedBy: res.marked_by, timestamp: res.timestamp });
      await loadStaffData(selectedStaffDate);
    } catch (err) {
      setError('Failed to submit staff attendance: ' + err.message);
    } finally {
      setSubmittingStaffAttendance(false);
    }
  };

  // Load Holidays List
  const loadHolidays = async () => {
    try {
      const list = await api.getHolidays();
      setHolidays(list);
    } catch (err) {
      setError('Failed to load holidays: ' + err.message);
    }
  };

  // Load System Logs
  const loadLogs = async () => {
    try {
      const logs = await api.getNotifications();
      setNotificationLogs(logs);
    } catch (err) {
      setError('Failed to load system logs: ' + err.message);
    }
  };

  // Tab switching side effects
  useEffect(() => {
    if (activeTab === 'overview') loadTodayOverview();
    if (activeTab === 'past') loadPastRecords(selectedDate);
    if (activeTab === 'monthly') loadMonthlySummary();
    if (activeTab === 'students') loadStudents();
    if (activeTab === 'staff') loadStaffData(selectedStaffDate);
    if (activeTab === 'holidays') loadHolidays();
    if (activeTab === 'logs') loadLogs();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'past') loadPastRecords(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (activeTab === 'monthly') loadMonthlySummary();
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (activeTab === 'staff') loadStaffData(selectedStaffDate);
  }, [selectedStaffDate]);

  // Handle student add
  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const created = await api.addStudent(newStudentName.trim());
      if (newStudentTeacherId) {
        await api.assignStudentTeacher(created.id, parseInt(newStudentTeacherId));
      }
      setSuccess(`Student "${newStudentName.trim()}" added successfully!`);
      setNewStudentName('');
      setNewStudentTeacherId('');
      await loadStudents();
    } catch (err) {
      setError('Failed to add student: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Assign Student Teacher
  const handleAssignTeacher = async (studentId, teacherId) => {
    setUpdatingStudent(studentId);
    setError('');
    setSuccess('');
    try {
      const val = teacherId ? parseInt(teacherId) : null;
      await api.assignStudentTeacher(studentId, val);
      setSuccess('Teacher section assigned successfully!');
      await loadStudents();
    } catch (err) {
      setError('Failed to assign teacher: ' + err.message);
    } finally {
      setUpdatingStudent(null);
    }
  };

  // Handle student status toggle
  const handleToggleStudentActive = async (student) => {
    setUpdatingStudent(student.id);
    setError('');
    setSuccess('');

    try {
      const newActive = student.active === 1 ? 0 : 1;
      await api.updateStudent(student.id, { name: student.name, active: newActive });
      setSuccess(`Student "${student.name}" ${newActive === 1 ? 'activated' : 'deactivated'}.`);
      await loadStudents();
    } catch (err) {
      setError('Failed to update student: ' + err.message);
    } finally {
      setUpdatingStudent(null);
    }
  };

  // Handle Save Edited Student Name
  const handleSaveEditStudentName = async (studentId, active) => {
    if (!editingStudentName.trim()) {
      setError('Student name cannot be empty.');
      return;
    }
    setUpdatingStudent(studentId);
    setError('');
    setSuccess('');
    try {
      await api.updateStudent(studentId, { name: editingStudentName.trim(), active });
      setSuccess(`Student name updated to "${editingStudentName.trim()}"!`);
      setEditingStudentId(null);
      setEditingStudentName('');
      await loadStudents();
    } catch (err) {
      setError('Failed to update student name: ' + err.message);
    } finally {
      setUpdatingStudent(null);
    }
  };

  // Handle Save Edited Staff Name
  const handleSaveEditStaffName = async (staffId, active) => {
    if (!editingStaffName.trim()) {
      setError('Staff member name cannot be empty.');
      return;
    }
    setUpdatingStaff(staffId);
    setError('');
    setSuccess('');
    try {
      await api.updateStaffMember(staffId, { name: editingStaffName.trim(), active });
      setSuccess(`Staff member name updated to "${editingStaffName.trim()}"!`);
      setEditingStaffId(null);
      setEditingStaffName('');
      await loadStaffData(selectedStaffDate);
    } catch (err) {
      setError('Failed to update staff member name: ' + err.message);
    } finally {
      setUpdatingStaff(null);
    }
  };

  // Handle Permanent Student Delete
  const handleDeleteStudentPermanently = async (student) => {
    if (!window.confirm(`⚠️ PERMANENT DELETE WARNING:\n\nAre you sure you want to permanently delete "${student.name}"? This will delete all past attendance records for this student.`)) return;

    setDeletingStudentPermanently(student.id);
    setError('');
    setSuccess('');
    try {
      await api.deleteStudent(student.id);
      setSuccess(`Student "${student.name}" permanently deleted.`);
      await loadStudents();
    } catch (err) {
      setError('Failed to delete student: ' + err.message);
    } finally {
      setDeletingStudentPermanently(null);
    }
  };

  // Handle Add Holiday
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayDate || !holidayDesc.trim()) return;

    setAddingHoliday(true);
    setError('');
    setSuccess('');

    try {
      await api.addHoliday(holidayDate, holidayDesc.trim());
      setSuccess(`Holiday "${holidayDesc.trim()}" added for ${holidayDate}!`);
      setHolidayDate('');
      setHolidayDesc('');
      await loadHolidays();
    } catch (err) {
      setError('Failed to add holiday: ' + err.message);
    } finally {
      setAddingHoliday(false);
    }
  };

  // Handle Delete Holiday
  const handleDeleteHoliday = async (holidayId) => {
    if (!window.confirm('Are you sure you want to remove this holiday?')) return;

    setDeletingHoliday(holidayId);
    setError('');
    setSuccess('');

    try {
      await api.deleteHoliday(holidayId);
      setSuccess('Holiday deleted successfully.');
      await loadHolidays();
    } catch (err) {
      setError('Failed to delete holiday: ' + err.message);
    } finally {
      setDeletingHoliday(null);
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
          <img src="/logo.svg" alt="My Chhota School Logo" className="header-logo" style={{ height: '42px', width: 'auto', objectFit: 'contain' }} />
          <div className="header-title">
            <h1>My Chhota School</h1>
            <p style={{ fontSize: '13px', color: '#FFCC29', fontWeight: '700', margin: '2px 0 0 0' }}>Nakkalagutta Hanamkonda</p>
            <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>Principal Administrative Portal (RD)</p>
          </div>
        </div>
        <div className="header-user">
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-role">Principal / Owner</div>
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
        <button className={`tab-btn ${activeTab === 'student-attendance' ? 'active' : ''}`} onClick={() => { setActiveTab('student-attendance'); loadStudents(); }}>
          🎓 Student Attendance
        </button>
        <button className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>
          👨‍💼 Staff Management & Attendance
        </button>
        <button className={`tab-btn ${activeTab === 'past' ? 'active' : ''}`} onClick={() => setActiveTab('past')}>
          Past Records
        </button>
        <button className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`} onClick={() => setActiveTab('monthly')}>
          Monthly Report
        </button>
        <button className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
          Student Roster
        </button>
        <button className={`tab-btn ${activeTab === 'holidays' ? 'active' : ''}`} onClick={() => setActiveTab('holidays')}>
          Holidays
        </button>
        <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
          Logs
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

          {/* Submission Details & Principal Student Roll Call */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Today's Student Attendance Roll Call</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 10px', minHeight: '30px' }}
                  onClick={() => {
                    const newMap = { ...todayStudentAttendance };
                    allStudents.filter(s => s.active === 1).forEach(s => { newMap[s.id] = 'Present'; });
                    setTodayStudentAttendance(newMap);
                  }}
                >
                  ✓ All Present
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 10px', minHeight: '30px' }}
                  onClick={() => {
                    const newMap = { ...todayStudentAttendance };
                    allStudents.filter(s => s.active === 1).forEach(s => { newMap[s.id] = 'Absent'; });
                    setTodayStudentAttendance(newMap);
                  }}
                >
                  ✕ All Absent
                </button>
              </div>
              {todayStats.submitted && (
                <span className="badge badge-success">
                  Submitted by {todayStats.markedBy} at {new Date(todayStats.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Principal Interactive Student Attendance Roll Call */}
            {allStudents.filter(s => s.active === 1).length > 0 ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {allStudents.filter(s => s.active === 1).map(student => {
                    const status = todayStudentAttendance[student.id] || 'Present';
                    return (
                      <div
                        key={student.id}
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
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>{student.name}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setTodayStudentAttendance(prev => ({ ...prev, [student.id]: 'Present' }))}
                            className={`btn ${status === 'Present' ? 'btn-success' : 'btn-secondary'}`}
                            style={{ minHeight: '36px', padding: '0 16px', fontSize: '14px' }}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setTodayStudentAttendance(prev => ({ ...prev, [student.id]: 'Absent' }))}
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

                <button
                  type="button"
                  onClick={handleSubmitTodayStudentAttendance}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '700' }}
                  disabled={submittingTodayAttendance}
                >
                  {submittingTodayAttendance ? 'Submitting Student Attendance...' : 'Save & Submit Student Attendance as Principal'}
                </button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No active students in roster.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: STUDENT ATTENDANCE */}
      {activeTab === 'student-attendance' && (
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ margin: 0 }}>🎓 Mark Student Attendance (Principal Access)</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', padding: '6px 12px', minHeight: '34px' }}
                  onClick={() => {
                    const newMap = { ...todayStudentAttendance };
                    allStudents.filter(s => s.active === 1).forEach(s => { newMap[s.id] = 'Present'; });
                    setTodayStudentAttendance(newMap);
                  }}
                >
                  ✓ Mark All Present
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '13px', padding: '6px 12px', minHeight: '34px' }}
                  onClick={() => {
                    const newMap = { ...todayStudentAttendance };
                    allStudents.filter(s => s.active === 1).forEach(s => { newMap[s.id] = 'Absent'; });
                    setTodayStudentAttendance(newMap);
                  }}
                >
                  ✕ Mark All Absent
                </button>
              </div>
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              As Principal, you have direct authorization to mark, verify, or update student attendance for any active student in the school.
            </p>

            {allStudents.filter(s => s.active === 1).length > 0 ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {allStudents.filter(s => s.active === 1).map(student => {
                    const status = todayStudentAttendance[student.id] || 'Present';
                    const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    return (
                      <div
                        key={student.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          border: status === 'Present' ? '1px solid var(--success)' : '1px solid var(--danger)',
                          borderRadius: '10px',
                          backgroundColor: status === 'Present' ? 'var(--success-light)' : 'var(--danger-light)',
                          transition: 'var(--transition)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                          {student.photo_url ? (
                            <img src={student.photo_url} alt={student.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div className="student-avatar">{initials}</div>
                          )}
                          <span style={{ fontWeight: '700', fontSize: '16px', wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: '1.3' }}>{student.name}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setTodayStudentAttendance(prev => ({ ...prev, [student.id]: 'Present' }))}
                            className={`btn ${status === 'Present' ? 'btn-success' : 'btn-secondary'}`}
                            style={{ minHeight: '38px', padding: '0 18px', fontSize: '14px', fontWeight: '700' }}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setTodayStudentAttendance(prev => ({ ...prev, [student.id]: 'Absent' }))}
                            className={`btn ${status === 'Absent' ? 'btn-danger' : 'btn-secondary'}`}
                            style={{ minHeight: '38px', padding: '0 18px', fontSize: '14px', fontWeight: '700' }}
                          >
                            Absent
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleSubmitTodayStudentAttendance}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '700' }}
                  disabled={submittingTodayAttendance}
                >
                  {submittingTodayAttendance ? 'Submitting Student Attendance...' : 'Save & Submit Student Attendance as Principal'}
                </button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No active students in roster.</p>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. STAFF MANAGEMENT & ATTENDANCE */}
      {activeTab === 'staff' && (
        <div>
          {/* Manage Staff Panel */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '16px' }}>👨‍💼 Manage Staff Roster</h3>

            {/* Quick Add Staff Form */}
            <form onSubmit={handleAddStaffMember} className="add-student-form" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter new staff member's full name"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={addingStaff}>
                {addingStaff ? 'Adding...' : '➕ Add Staff'}
              </button>
            </form>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '13px', minHeight: '34px', padding: '0 14px', marginBottom: '16px' }}
              onClick={() => setShowStaffRoster(prev => !prev)}
            >
              {showStaffRoster ? '▲ Hide Roster' : `▼ View & Remove Staff (${rosterStaff.length} total)`}
            </button>

            {showStaffRoster && (
              <div className="student-manage-list">
                {rosterStaff.map(member => (
                  <div key={member.id} className={`student-manage-item ${member.active === 0 ? 'inactive' : ''}`}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingStaffId === member.id ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="form-control"
                            style={{ fontSize: '14px', padding: '4px 8px', minHeight: '34px' }}
                            value={editingStaffName}
                            onChange={(e) => setEditingStaffName(e.target.value)}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn-success"
                            style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                            onClick={() => handleSaveEditStaffName(member.id, member.active)}
                            disabled={updatingStaff === member.id}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                            onClick={() => { setEditingStaffId(null); setEditingStaffName(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontWeight: '700', fontSize: '16px' }}>{member.name}</span>
                          <span style={{ marginLeft: '10px', fontSize: '12px', color: member.active === 1 ? 'var(--success)' : 'var(--danger)' }}>
                            ({member.active === 1 ? 'Active' : 'Inactive'})
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {editingStaffId !== member.id && (
                        <button
                          type="button"
                          onClick={() => { setEditingStaffId(member.id); setEditingStaffName(member.name); }}
                          className="btn btn-secondary"
                          style={{ minHeight: '32px', fontSize: '12px', padding: '0 12px' }}
                        >
                          ✏️ Edit Name
                        </button>
                      )}

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
            )}
          </div>

          {/* Daily Staff Attendance Marking Card */}
          <div className="card">
            <div className="view-header" style={{ marginBottom: '20px' }}>
              <h2>Mark Staff Attendance</h2>
              <div className="date-selector-form">
                <label htmlFor="staff-date">Select Date:</label>
                <input
                  id="staff-date"
                  type="date"
                  className="form-control"
                  style={{ width: 'auto' }}
                  value={selectedStaffDate}
                  onChange={(e) => setSelectedStaffDate(e.target.value)}
                />
              </div>
            </div>

            {staffDayStatus.submitted && (
              <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                <span>
                  Staff attendance for {selectedStaffDate} marked by <strong>{staffDayStatus.markedBy}</strong> at{' '}
                  <strong>{new Date(staffDayStatus.timestamp).toLocaleTimeString()}</strong>.
                </span>
              </div>
            )}

            {staffMembers.length > 0 ? (
              <form onSubmit={handleSubmitStaffAttendance}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {staffMembers.map(member => {
                    const status = staffAttendanceMap[member.id] || 'Present';
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                              <span style={{ fontWeight: '700', fontSize: '16px' }}>{member.name}</span>
                              <button
                                type="button"
                                title="Edit staff member name"
                                onClick={(e) => { e.stopPropagation(); setEditingStaffId(member.id); setEditingStaffName(member.name); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.7, padding: '2px' }}
                              >
                                ✏️
                              </button>
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setStaffAttendanceMap(prev => ({ ...prev, [member.id]: 'Present' }))}
                            className={`btn ${status === 'Present' ? 'btn-success' : 'btn-secondary'}`}
                            style={{ minHeight: '36px', padding: '0 16px', fontSize: '14px' }}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setStaffAttendanceMap(prev => ({ ...prev, [member.id]: 'Absent' }))}
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

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '700' }}
                  disabled={submittingStaffAttendance}
                >
                  {submittingStaffAttendance ? 'Submitting Staff Attendance...' : 'Save & Submit Staff Attendance'}
                </button>
              </form>
            ) : (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <span>No active staff members found in roster. Add a staff member above!</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. PAST RECORDS */}
      {activeTab === 'past' && (
        <div>
          <div className="card">
            <div className="view-header" style={{ marginBottom: '20px' }}>
              <h2>Historical Student Attendance Search & Edit</h2>
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

            {pastRecords.submitted && (
              <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                <span>
                  Marked by <strong>{pastRecords.markedBy}</strong> on{' '}
                  <strong>{new Date(pastRecords.timestamp).toLocaleDateString()}</strong> at{' '}
                  <strong>{new Date(pastRecords.timestamp).toLocaleTimeString()}</strong>.
                </span>
              </div>
            )}

            {allStudents.filter(s => s.active === 1).length > 0 ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {allStudents.filter(s => s.active === 1).map(student => {
                    const status = pastStudentAttendance[student.id] || 'Present';
                    return (
                      <div
                        key={student.id}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {editingStudentId === student.id ? (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input
                                type="text"
                                className="form-control"
                                style={{ fontSize: '13px', padding: '2px 6px', height: '28px' }}
                                value={editingStudentName}
                                onChange={(e) => setEditingStudentName(e.target.value)}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="btn btn-success"
                                style={{ minHeight: '28px', padding: '0 8px', fontSize: '11px' }}
                                onClick={() => handleSaveEditStudentName(student.id, student.active)}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ minHeight: '28px', padding: '0 8px', fontSize: '11px' }}
                                onClick={() => { setEditingStudentId(null); setEditingStudentName(''); }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <span style={{ fontWeight: '700', fontSize: '16px' }}>{student.name}</span>
                              <button
                                type="button"
                                title="Edit student name"
                                onClick={(e) => { e.stopPropagation(); setEditingStudentId(student.id); setEditingStudentName(student.name); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', opacity: 0.7, padding: '2px' }}
                              >
                                ✏️
                              </button>
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setPastStudentAttendance(prev => ({ ...prev, [student.id]: 'Present' }))}
                            className={`btn ${status === 'Present' ? 'btn-success' : 'btn-secondary'}`}
                            style={{ minHeight: '36px', padding: '0 16px', fontSize: '14px' }}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => setPastStudentAttendance(prev => ({ ...prev, [student.id]: 'Absent' }))}
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

                <button
                  type="button"
                  onClick={handleSubmitPastStudentAttendance}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: '700' }}
                  disabled={submittingPastAttendance}
                >
                  {submittingPastAttendance ? 'Updating Attendance...' : `Update Student Attendance for ${selectedDate}`}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 4. MONTHLY REPORT */}
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
                {[2026, 2027, 2028, 2029, 2030].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                className="form-control"
                style={{ width: 'auto' }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1)
                  .filter(m => selectedYear !== 2026 || m >= 8)
                  .map(m => {
                    const monthNames = [
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'
                    ];
                    return <option key={m} value={m}>{monthNames[m - 1]}</option>;
                  })}
              </select>
              <button
                onClick={handleSendEmailReport}
                className="btn btn-secondary"
                disabled={emailSending}
                style={{ minHeight: '38px', padding: '0 16px', fontSize: '14px' }}
              >
                {emailSending ? 'Sending Email...' : '✉️ Email Report'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px', marginTop: '16px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search student in report..."
              value={monthlySearch}
              onChange={(e) => setMonthlySearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px' }}>Loading monthly summary...</div>
          ) : filteredMonthlySummary.length > 0 ? (
            <div className="table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Teacher / Section</th>
                    <th>Present Days</th>
                    <th>Absent Days</th>
                    <th>Total Days</th>
                    <th>Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMonthlySummary.map((s) => {
                    const rate = s.total_days > 0 ? Math.round((s.present_days / s.total_days) * 100) : 0;
                    return (
                      <tr key={s.student_id}>
                        <td style={{ fontWeight: '600' }}>{s.name}</td>
                        <td>
                          <span className="badge badge-secondary">
                            {s.teacher_name || 'Unassigned'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--success)', fontWeight: '700' }}>{s.present_days}</td>
                        <td style={{ color: 'var(--danger)', fontWeight: '700' }}>{s.absent_days}</td>
                        <td>{s.total_days}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="progress-bar-bg" style={{ width: '80px', height: '8px' }}>
                              <div
                                className="progress-bar-fill"
                                style={{
                                  width: `${rate}%`,
                                  backgroundColor: rate >= 75 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)'
                                }}
                              ></div>
                            </div>
                            <span style={{ fontWeight: '700' }}>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert alert-warning" style={{ margin: 0 }}>
              <span>No attendance summary data found for this month.</span>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: 5. STUDENT MANAGEMENT */}
      {activeTab === 'students' && (
        <div className="card">
          <h2 style={{ marginBottom: '16px' }}>Student Section & Roster Management</h2>

          {/* Add Student Form */}
          <form onSubmit={handleAddStudent} className="add-student-form" style={{ marginBottom: '20px' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <input
                type="text"
                className="form-control"
                placeholder="Enter new student's full name"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <select
                className="form-control"
                value={newStudentTeacherId}
                onChange={(e) => setNewStudentTeacherId(e.target.value)}
              >
                <option value="">Assign Teacher Section (Optional)</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : '➕ Add Student'}
            </button>
          </form>

          {/* Filter options */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3>Current Roster ({filteredStudentsForManage.length})</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <input
                id="chk-inactive"
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="chk-inactive" style={{ cursor: 'pointer', fontWeight: '600' }}>Show Inactive Students</label>
            </div>
          </div>

          {/* Student list */}
          <div className="student-manage-list">
            {filteredStudentsForManage.map((student) => {
              const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
              return (
                <div key={student.id} className={`student-manage-item ${student.active === 0 ? 'inactive' : ''}`}>
                  <label className="photo-upload-btn-wrapper" title="Upload student photo">
                    {student.photo_url
                      ? <img src={student.photo_url} alt={student.name} className="roster-avatar-img" />
                      : <div className="roster-avatar-initials">{initials}</div>
                    }
                    <div className="photo-upload-overlay">📷</div>
                    <input
                      type="file"
                      accept="image/*"
                      className="photo-file-input"
                      disabled={uploadingPhoto === student.id}
                      onChange={(e) => handleOwnerPhotoUpload(student, e.target.files[0])}
                    />
                  </label>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingStudentId === student.id ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ fontSize: '14px', padding: '4px 8px', minHeight: '34px' }}
                          value={editingStudentName}
                          onChange={(e) => setEditingStudentName(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                          onClick={() => handleSaveEditStudentName(student.id, student.active)}
                          disabled={updatingStudent === student.id}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                          onClick={() => { setEditingStudentId(null); setEditingStudentName(''); }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontWeight: '700', fontSize: '16px' }}>{student.name}</span>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Added: {new Date(student.date_added).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section Assignment Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {editingStudentId !== student.id && (
                      <button
                        type="button"
                        onClick={() => { setEditingStudentId(student.id); setEditingStudentName(student.name); }}
                        className="btn btn-secondary"
                        style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                      >
                        ✏️ Edit Name
                      </button>
                    )}

                    <select
                      className="form-control"
                      style={{ fontSize: '13px', padding: '4px 8px', minHeight: '34px', width: 'auto' }}
                      value={student.teacher_id || ''}
                      onChange={(e) => handleAssignTeacher(student.id, e.target.value)}
                      disabled={updatingStudent === student.id}
                    >
                      <option value="">Unassigned</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleToggleStudentActive(student)}
                      className={`btn ${student.active === 1 ? 'btn-secondary' : 'btn-success'}`}
                      style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                      disabled={updatingStudent === student.id}
                    >
                      {updatingStudent === student.id ? 'Updating...' : (student.active === 1 ? 'Deactivate' : 'Reactivate')}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteStudentPermanently(student)}
                      className="btn btn-danger"
                      style={{ minHeight: '34px', fontSize: '13px', padding: '0 12px' }}
                      disabled={deletingStudentPermanently === student.id}
                    >
                      {deletingStudentPermanently === student.id ? 'Deleting...' : '🗑️ Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 6. HOLIDAYS MANAGER */}
      {activeTab === 'holidays' && (
        <div className="card">
          <h2 style={{ marginBottom: '16px' }}>School Holidays Manager</h2>

          {/* Add Holiday Form */}
          <form onSubmit={handleAddHoliday} className="add-holiday-form" style={{ marginBottom: '24px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Holiday Date:</label>
              <input
                type="date"
                className="form-control"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Reason / Description:</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Independence Day, Diwali Vacation"
                value={holidayDesc}
                onChange={(e) => setHolidayDesc(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={addingHoliday} style={{ alignSelf: 'flex-end' }}>
              {addingHoliday ? 'Adding...' : '➕ Add Holiday'}
            </button>
          </form>

          {/* Holiday List */}
          <h3>Scheduled Holidays ({holidays.length})</h3>
          {holidays.length > 0 ? (
            <div className="table-wrapper" style={{ marginTop: '12px' }}>
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description / Occasion</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: '700' }}>{h.date}</td>
                      <td>{h.description}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ minHeight: '32px', fontSize: '12px', padding: '0 12px' }}
                          disabled={deletingHoliday === h.id}
                          onClick={() => handleDeleteHoliday(h.id)}
                        >
                          {deletingHoliday === h.id ? 'Removing...' : '🗑️ Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert alert-warning" style={{ marginTop: '12px', margin: 0 }}>
              <span>No custom holidays scheduled yet. Sundays are automatically marked as holidays.</span>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: 7. SYSTEM LOGS */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="view-header" style={{ marginBottom: '16px' }}>
            <h2>System Activity & Notification Logs</h2>
            <button onClick={loadLogs} className="btn btn-secondary" style={{ minHeight: '34px', padding: '0 12px', fontSize: '13px' }}>
              🔄 Refresh Logs
            </button>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Live record of attendance submissions, reminder alerts, and monthly report dispatches:
          </p>

          <div className="logs-wrapper" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {notificationLogs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notificationLogs.map((log) => {
                  let alertClass = 'alert-info';
                  if (log.type === 'success') alertClass = 'alert-success';
                  if (log.type === 'warning') alertClass = 'alert-danger';

                  return (
                    <div key={log.id} className={`alert ${alertClass}`} style={{ padding: '10px 14px', fontSize: '13px', margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                        <span>{log.message}</span>
                        <span style={{ fontSize: '11px', opacity: 0.8, whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <span>No system logs recorded yet.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
