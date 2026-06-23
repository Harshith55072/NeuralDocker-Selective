import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * AppLayout — shared shell for all authenticated pages.
 *
 * Props:
 *   children        — page content
 *   navLinks        — array of { label, path } shown in the nav (optional override)
 *   showBack        — show a back button instead of nav links (for utility pages)
 *   backLabel       — label for back button (default "Back")
 *   onBack          — custom back handler (default: navigate(-1))
 *   fullHeight      — if true, content area fills viewport height with no scroll (for split-panel pages)
 *   extraNavRight   — extra JSX to render in the nav right area (e.g. cluster bar buttons)
 */

const getClusterNavPath = () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || sessionStorage.getItem('clusterId');
  return id ? `/cluster?id=${id}` : '/cluster';
};

const AppLayout = ({
  children,
  navLinks,
  showBack = false,
  backLabel = 'Back',
  onBack,
  fullHeight = false,
  extraNavRight = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Recomputed on every render — location changes already trigger a re-render via
  // useLocation() above, so this always reflects whichever cluster is actually in
  // view instead of freezing to whatever it was the first time this module loaded.
  const resolvedNavLinks = navLinks || [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Cluster',   path: getClusterNavPath() },
  ];

  const accountName     = localStorage.getItem('accountName') || 'User';
  const userEmail       = localStorage.getItem('userEmail')   || '';
  const avatarInitials  = accountName
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('accountName');
    localStorage.removeItem('userId');
    navigate('/');
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Nav ── */}
      <nav className="nd-nav">
        <div className="nd-nav-left">
          {/* Logo */}
          <a className="nd-logo" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <div className="nd-logo-mark">
              <span /><span /><span /><span />
            </div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </a>

          {/* Nav links or back button */}
          {showBack ? (
            <button className="nd-back-btn" onClick={handleBack}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {backLabel}
            </button>
          ) : (
            <nav className="nd-nav-links">
              {resolvedNavLinks.map(link => (
                <button
                  key={link.path}
                  className={`nd-nav-link ${location.pathname === link.path ? 'active' : ''}`}
                  onClick={() => navigate(link.path)}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Right side */}
        <div className="nd-nav-right">
          {extraNavRight}

          {/* User info */}
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2 }}>{accountName}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{userEmail}</span>
          </div>

          {/* Avatar + dropdown */}
          <div ref={profileRef} style={{ position: 'relative' }}>
            <div
              className="nd-avatar"
              onClick={() => setProfileOpen(v => !v)}
            >
              {avatarInitials}
            </div>
            {profileOpen && (
              <div className="nd-profile-dropdown animate-in">
                <button onClick={() => { setProfileOpen(false); navigate('/dashboard'); }}>Dashboard</button>
                <button onClick={() => { setProfileOpen(false); navigate(getClusterNavPath()); }}>Cluster</button>
                <div className="nd-divider" style={{ margin: '2px 0' }} />
                <button className="danger" onClick={handleLogout}>Log Out</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: fullHeight ? 'hidden' : undefined,
        height: fullHeight ? `calc(100vh - var(--nav-height))` : undefined,
      }}>
        {children}
      </div>

    </div>
  );
};

export default AppLayout;
