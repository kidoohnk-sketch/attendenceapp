import { useState, useEffect } from 'react';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import OwnerDashboard from './components/OwnerDashboard';
import StaffDashboard from './components/StaffDashboard';
import { api } from './utils/api';

function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Check if session token exists on load
  useEffect(() => {
    const currentUser = api.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
    setInitializing(false);
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
  };

  if (initializing) {
    return (
      <div className="loading-screen" style={{ height: '100vh' }}>
        <div className="spinner"></div>
        <p style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Initializing My Chhota School...</p>
      </div>
    );
  }

  // If not logged in, render the login page
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Render appropriate dashboard based on user role
  if (user.role === 'teacher') {
    return <TeacherDashboard user={user} onLogout={handleLogout} />;
  }

  if (user.role === 'owner') {
    return <OwnerDashboard user={user} onLogout={handleLogout} />;
  }

  if (user.role === 'staff') {
    return <StaffDashboard user={user} onLogout={handleLogout} />;
  }

  // Fallback: If user role is invalid, force logout
  handleLogout();
  return null;
}

export default App;
