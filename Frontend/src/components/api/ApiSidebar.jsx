import React from 'react';

const ApiSidebar = ({ clusterName }) => {
  return (
    <aside className="api-sidebar">
      <div className="api-section">
        <div className="api-section-body">
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '16px' }}>Documentation</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>
            <li><button style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: '13px', cursor: 'pointer' }}>Introduction</button></li>
            <li><button style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: '13px', cursor: 'pointer' }}>Authentication</button></li>
            <li><button style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: '13px', cursor: 'pointer' }}>Endpoints</button></li>
            <li><button style={{ background: 'none', border: 'none', color: 'var(--text-mid)', fontSize: '13px', cursor: 'pointer' }}>Rate Limits</button></li>
          </ul>
        </div>
      </div>
      
      <div className="api-section">
        <div className="api-section-body">
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '16px' }}>Cluster Info</h3>
          <div className="api-meta">Cluster Name</div>
          <div className="api-stat-value" style={{ marginBottom: '12px' }}>{clusterName}</div>
          <div className="api-meta">Status</div>
          <div className="api-stat-value" style={{ color: 'var(--cyan)' }}>Active</div>
        </div>
      </div>
    </aside>
  );
};

export default ApiSidebar;
