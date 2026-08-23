import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Google Login / Registration flows
  const [googleRegData, setGoogleRegData] = useState(null); // { email, name }
  const [chosenRole, setChosenRole] = useState(''); // 'teacher' | 'owner' | null (null if existing user verifying login)

  // OTP Verification flow
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otp, setOtp] = useState('');

  // Forgot Password flow states
  const [showForgotScreen, setShowForgotScreen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Change Username flow states
  const [showChangeUsernameScreen, setShowChangeUsernameScreen] = useState(false);
  const [changeCurrentUsername, setChangeCurrentUsername] = useState('');
  const [changePassword, setChangePassword] = useState('');
  const [changeNewUsername, setChangeNewUsername] = useState('');

  const handleSendForgotPasswordOtp = async (e) => {
    e.preventDefault();
    if (!forgotUsername || !forgotEmail) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.sendForgotPasswordOtp(forgotUsername, forgotEmail);
      setForgotStep(2);
      setForgotSuccess('Verification code sent successfully. Please check your email.');
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!forgotOtp || !forgotNewPassword) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(forgotUsername, forgotEmail, forgotOtp, forgotNewPassword);
      setForgotSuccess('');
      setError('');
      setShowForgotScreen(false);
      setForgotStep(1);
      setForgotUsername('');
      setForgotEmail('');
      setForgotOtp('');
      setForgotNewPassword('');
      alert('Password updated successfully. Please sign in with your new password.');
    } catch (err) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeUsername = async (e) => {
    e.preventDefault();
    if (!changeCurrentUsername || !changePassword || !changeNewUsername) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.changeUsername(changeCurrentUsername, changePassword, changeNewUsername);
      setError('');
      setShowChangeUsernameScreen(false);
      setChangeCurrentUsername('');
      setChangePassword('');
      setChangeNewUsername('');
      alert('Username updated successfully. Please sign in with your new username.');
    } catch (err) {
      setError(err.message || 'Failed to change username.');
    } finally {
      setLoading(false);
    }
  };

  // Standard credentials login
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await api.login(username, password);
      onLoginSuccess(response.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Google Login Token handler (from real GSI client or simulated button)
  const handleGoogleLogin = async (token) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.googleLogin(token);
      
      if (res.isNew) {
        // New user: open Role Selection Overlay
        setGoogleRegData({
          email: res.email,
          name: res.name
        });
        setChosenRole('');
        setShowOtpScreen(false);
      } else {
        // Existing user: send OTP code for verification
        const userEmail = res.user.google_email || `${res.user.role}-google@gmail.com`; // mock fallback if not saved
        setGoogleRegData({
          email: userEmail,
          name: res.user.name
        });
        setChosenRole(null); // Indicates existing user logging in
        
        await api.sendOtp(userEmail);
        setShowOtpScreen(true);
      }
    } catch (err) {
      setError('Google Sign-In failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clicked "Register as Teacher" or "Register as Owner"
  const handleSelectRole = async (role) => {
    if (!googleRegData) return;
    setLoading(true);
    setError('');
    try {
      setChosenRole(role);
      // Trigger dispatching verification code from kidoohnk@gmail.com
      await api.sendOtp(googleRegData.email);
      setShowOtpScreen(true);
    } catch (err) {
      setError('Failed to dispatch OTP: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit OTP Verification code
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // If chosenRole is null, we are just verifying existing login.
      // Else, we are verifying a new account registration.
      const res = await api.verifyOtp(
        googleRegData.email,
        otp,
        chosenRole ? googleRegData.name : undefined,
        chosenRole ? chosenRole : undefined
      );
      
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  // Load Google Identity Services library script dynamically
  useEffect(() => {
    const initGoogleGSI = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
          callback: (response) => {
            handleGoogleLogin(response.credential);
          }
        });
        window.google.accounts.id.renderButton(
          document.getElementById('google-btn-container'),
          { theme: 'outline', size: 'large', width: '100%' }
        );
      }
    };

    const timer = setTimeout(initGoogleGSI, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="login-wrapper">
      <div className="card login-card" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* FORGOT PASSWORD OVERLAY */}
          {showForgotScreen && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              zIndex: 30,
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <img src="/logo.svg" alt="My Chhota School Logo" style={{ height: '48px', maxWidth: '200px', objectFit: 'contain', marginBottom: '12px' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Reset Password</h2>
              </div>

              {error && (
                <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                  <span>{error}</span>
                </div>
              )}
              {forgotSuccess && (
                <div className="alert alert-success" style={{ marginBottom: '16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>
                  <span>{forgotSuccess}</span>
                </div>
              )}

              {forgotStep === 1 ? (
                <form onSubmit={handleSendForgotPasswordOtp}>
                  <div className="form-group" style={{ textAlign: 'left', marginBottom: '14px' }}>
                    <label htmlFor="forgot-username">Username</label>
                    <input
                      id="forgot-username"
                      type="text"
                      className="form-control"
                      placeholder="Enter your username"
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group" style={{ textAlign: 'left', marginBottom: '20px' }}>
                    <label htmlFor="forgot-email">Registered Email</label>
                    <input
                      id="forgot-email"
                      type="email"
                      className="form-control"
                      placeholder="e.g. teacher-google@gmail.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', minHeight: '42px' }}
                    disabled={loading}
                  >
                    {loading ? 'Sending...' : 'Send Verification Code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword}>
                  <div className="form-group" style={{ textAlign: 'left', marginBottom: '14px' }}>
                    <label htmlFor="forgot-otp" style={{ fontWeight: 'bold' }}>Verification Code (OTP)</label>
                    <input
                      id="forgot-otp"
                      type="text"
                      className="form-control"
                      placeholder="6-digit code"
                      maxLength={6}
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                      style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '0.2em', fontWeight: 'bold' }}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="form-group" style={{ textAlign: 'left', marginBottom: '20px' }}>
                    <label htmlFor="forgot-new-password">New Password</label>
                    <input
                      id="forgot-new-password"
                      type="password"
                      className="form-control"
                      placeholder="Enter new password"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', minHeight: '42px' }}
                    disabled={loading}
                  >
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowForgotScreen(false);
                  setForgotStep(1);
                  setForgotUsername('');
                  setForgotEmail('');
                  setForgotOtp('');
                  setForgotNewPassword('');
                  setForgotSuccess('');
                  setError('');
                }}
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '10px', border: '1px solid var(--border-color)', minHeight: '38px' }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          )}

          {/* CHANGE USERNAME OVERLAY */}
          {showChangeUsernameScreen && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              zIndex: 30,
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <img src="/logo.svg" alt="My Chhota School Logo" style={{ height: '48px', maxWidth: '200px', objectFit: 'contain', marginBottom: '12px' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Change Username</h2>
              </div>

              {error && (
                <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleChangeUsername}>
                <div className="form-group" style={{ textAlign: 'left', marginBottom: '12px' }}>
                  <label htmlFor="change-curr-username">Current Username</label>
                  <input
                    id="change-curr-username"
                    type="text"
                    className="form-control"
                    placeholder="Enter current username"
                    value={changeCurrentUsername}
                    onChange={(e) => setChangeCurrentUsername(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group" style={{ textAlign: 'left', marginBottom: '12px' }}>
                  <label htmlFor="change-pass">Password</label>
                  <input
                    id="change-pass"
                    type="password"
                    className="form-control"
                    placeholder="Enter password"
                    value={changePassword}
                    onChange={(e) => setChangePassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group" style={{ textAlign: 'left', marginBottom: '20px' }}>
                  <label htmlFor="change-new-username">New Username</label>
                  <input
                    id="change-new-username"
                    type="text"
                    className="form-control"
                    placeholder="Enter new username"
                    value={changeNewUsername}
                    onChange={(e) => setChangeNewUsername(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', minHeight: '42px' }}
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Username'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setShowChangeUsernameScreen(false);
                  setChangeCurrentUsername('');
                  setChangePassword('');
                  setChangeNewUsername('');
                  setError('');
                }}
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '10px', border: '1px solid var(--border-color)', minHeight: '38px' }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          )}

        {/* OTP VERIFICATION VIEW */}
        {showOtpScreen && googleRegData && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            zIndex: 20,
            padding: '30px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <img src="/logo.svg" alt="My Chhota School Logo" style={{ height: '60px', maxWidth: '240px', objectFit: 'contain', marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Security Verification</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '20px' }}>
              A 6-digit OTP code has been dispatched to <strong>{googleRegData.email}</strong> from <strong>kidoohnk@gmail.com</strong>.
            </p>

            {error && (
              <div className="alert alert-danger" style={{ width: '100%', marginBottom: '16px' }} id="otp-error-alert">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} style={{ width: '100%' }}>
              <div className="form-group" style={{ textAlign: 'left', marginBottom: '20px' }}>
                <label htmlFor="otp-input" style={{ textAlign: 'center', display: 'block', fontWeight: '700' }}>Enter Verification Code</label>
                <input
                  id="otp-input"
                  type="text"
                  className="form-control"
                  placeholder="e.g. 123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '0.3em', height: '54px', fontWeight: 'bold' }}
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', minHeight: '44px' }}
                disabled={loading}
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOtpScreen(false);
                  setGoogleRegData(null);
                  setError('');
                }}
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '8px', border: '1px solid var(--border-color)', minHeight: '38px' }}
                disabled={loading}
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* ROLE SELECTION OVERLAY (Only if new Google Account) */}
        {googleRegData && !showOtpScreen && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            zIndex: 10,
            padding: '30px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <img src="/logo.svg" alt="My Chhota School Logo" style={{ height: '60px', maxWidth: '240px', objectFit: 'contain', marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Complete Registration</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
              Welcome <strong>{googleRegData.name}</strong> ({googleRegData.email})! Please select your school role to verify your account:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              <button 
                onClick={() => handleSelectRole('teacher')}
                className="btn btn-primary"
                style={{ width: '100%', minHeight: '44px' }}
                disabled={loading}
                id="select-teacher-role-btn"
              >
                🏫 Register as Teacher
              </button>
              <button 
                onClick={() => handleSelectRole('owner')}
                className="btn btn-secondary"
                style={{ width: '100%', border: '2px solid var(--primary)', color: 'var(--primary)', minHeight: '44px' }}
                disabled={loading}
                id="select-owner-role-btn"
              >
                👑 Register as Owner (Admin)
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <img 
            src="/logo.svg" 
            alt="My Chhota School Logo" 
            style={{ 
              height: '75px', 
              maxWidth: '280px', 
              objectFit: 'contain'
            }} 
          />
        </div>
        
        <div className="login-header">
          <h1>My Chhota School</h1>
          <p style={{ fontSize: '14px', color: '#FFCC29', fontWeight: '700', margin: '2px 0 4px 0' }}>Nakkalagutta Hanamkonda</p>
          <p>Daily Attendance Portal</p>
        </div>

        {error && (
          <div className="alert alert-danger" id="login-error-alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="form-control"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-control"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? <span className="spinner" style={{ width: '20px', height: '20px' }}></span> : 'Sign In'}
          </button>
        </form>





      </div>
    </div>
  );
}
