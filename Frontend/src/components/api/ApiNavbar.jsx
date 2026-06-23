import React from 'react';
import { useNavigate } from 'react-router-dom';

const ApiNavbar = ({ accountName, userEmail, avatarInitials }) => {
  const navigate = useNavigate();
  return (
    <nav className="api-nav">
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <div className="logo-section" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-icon" style={{ background: 'var(--text)', color: '#000', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>ND</div>
          <div className="logo-text" style={{ fontWeight: 'bold', fontSize: '18px' }}>Neural<span style={{ color: 'var(--cyan)' }}>Docker</span></div>
        </div>
        <div className="api-nav-links">
          <button onClick={() => navigate('/dashboard')}>Dashboard</button>
          <button onClick={() => navigate('/cluster')}>Cluster</button>
          <button className="active" onClick={() => navigate('/api-hosting')}>API</button>
        </div>
      </div>
      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="nav-user" style={{ textAlign: 'right' }}>
          <strong style={{ display: 'block', fontSize: '13px' }}>{accountName}</strong>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{userEmail}</span>
        </div>
        <div className="avatar" style={{ 
          width: '34px', height: '34px', borderRadius: '50%', 
          background: 'linear-gradient(135deg, var(--cyan), #ff3cac)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 'bold', color: '#000'
        }}>{avatarInitials}</div>
        <button className="btn btn-dark" style={{ 
          background: 'var(--bg3)', border: '1px solid var(--border)', 
          color: 'var(--text)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer'
        }} onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    </nav>
  );
};

export default ApiNavbar;
