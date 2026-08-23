const API_BASE = '/api';

// Helper to set headers
const getHeaders = () => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Response helper
const handleResponse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `API error (${res.status})`);
  }
  return data;
};

export const api = {
  // Authentication
  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password }),
    });
    const data = await handleResponse(res);
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  // Teachers
  getTeachers: async () => {
    const res = await fetch(`${API_BASE}/teachers`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Students
  getStudents: async (activeOnly = true) => {
    const url = activeOnly ? `${API_BASE}/students?active=1` : `${API_BASE}/students`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  assignStudentTeacher: async (id, teacher_id) => {
    const res = await fetch(`${API_BASE}/students/${id}/teacher`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ teacher_id }),
    });
    return handleResponse(res);
  },

  addStudent: async (name) => {
    const res = await fetch(`${API_BASE}/students`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    return handleResponse(res);
  },

  updateStudent: async (id, { name, active }) => {
    const res = await fetch(`${API_BASE}/students/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ name, active }),
    });
    return handleResponse(res);
  },

  deleteStudent: async (id) => {
    const res = await fetch(`${API_BASE}/students/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  uploadStudentPhoto: async (id, photoBase64) => {
    const res = await fetch(`${API_BASE}/students/${id}/photo`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ photo_url: photoBase64 }),
    });
    return handleResponse(res);
  },

  // Attendance
  getAttendance: async (date) => {
    const res = await fetch(`${API_BASE}/attendance?date=${date}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  submitAttendance: async (date, attendance) => {
    const res = await fetch(`${API_BASE}/attendance`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ date, attendance }),
    });
    return handleResponse(res);
  },

  getAttendanceStatus: async (date) => {
    const url = date ? `${API_BASE}/attendance/status?date=${date}` : `${API_BASE}/attendance/status`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  getAttendanceSummary: async (year, month) => {
    const res = await fetch(`${API_BASE}/attendance/summary?year=${year}&month=${month}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Notifications Log
  getNotificationLogs: async () => {
    const res = await fetch(`${API_BASE}/attendance/notifications`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  getMonthlyLog: async (year, month) => {
    const res = await fetch(`${API_BASE}/attendance/monthly-log?year=${year}&month=${month}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Holidays
  getHolidays: async () => {
    const res = await fetch(`${API_BASE}/holidays`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  addHoliday: async (date, description) => {
    const res = await fetch(`${API_BASE}/holidays`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ date, description }),
    });
    return handleResponse(res);
  },

  deleteHoliday: async (id) => {
    const res = await fetch(`${API_BASE}/holidays/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Send Monthly Report Email
  sendMonthlyReportEmail: async (year, month) => {
    const res = await fetch(`${API_BASE}/attendance/send-monthly-report`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ year, month }),
    });
    return handleResponse(res);
  },

  // Google Login Auth
  googleLogin: async (token) => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ token }),
    });
    const data = await handleResponse(res);
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  },

  // Google Registration
  googleRegister: async (email, name, role) => {
    const res = await fetch(`${API_BASE}/auth/google/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, name, role }),
    });
    const data = await handleResponse(res);
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  },

  // Send OTP
  sendOtp: async (email) => {
    const res = await fetch(`${API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email }),
    });
    return handleResponse(res);
  },

  // Verify OTP & Sign In
  verifyOtp: async (email, otp, name, role) => {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, otp, name, role }),
    });
    const data = await handleResponse(res);
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  },

  sendForgotPasswordOtp: async (username, email) => {
    const res = await fetch(`${API_BASE}/auth/forgot-password/send-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, email }),
    });
    return handleResponse(res);
  },

  resetPassword: async (username, email, otp, newPassword) => {
    const res = await fetch(`${API_BASE}/auth/forgot-password/reset`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, email, otp, newPassword }),
    });
    return handleResponse(res);
  },

  changeUsername: async (username, password, newUsername) => {
    const res = await fetch(`${API_BASE}/auth/change-username`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password, newUsername }),
    });
    return handleResponse(res);
  },

  // Staff Management
  getStaffMembers: async (activeOnly = true) => {
    const url = activeOnly ? `${API_BASE}/staff-members?active=1` : `${API_BASE}/staff-members`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  addStaffMember: async (name) => {
    const res = await fetch(`${API_BASE}/staff-members`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    return handleResponse(res);
  },

  updateStaffMember: async (id, { name, active }) => {
    const res = await fetch(`${API_BASE}/staff-members/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ name, active }),
    });
    return handleResponse(res);
  },

  deleteStaffMember: async (id) => {
    const res = await fetch(`${API_BASE}/staff-members/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  getStaffAttendance: async (date) => {
    const res = await fetch(`${API_BASE}/staff-attendance?date=${date}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  submitStaffAttendance: async (date, attendance) => {
    const res = await fetch(`${API_BASE}/staff-attendance`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ date, attendance }),
    });
    return handleResponse(res);
  },

  getStaffMonthlyLog: async (year, month) => {
    const res = await fetch(`${API_BASE}/staff-attendance/monthly-log?year=${year}&month=${month}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse(res);
  }
};
