import React, { useState } from 'react';

const ApiLiveTest = () => {
  const [prompt, setPrompt] = useState('');
  
  return (
    <div className="api-section">
      <div className="api-section-body">
        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '16px' }}>Live Test</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          <textarea 
            placeholder="Enter test prompt..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ 
              width: '100%', minHeight: '80px', background: 'var(--bg3)', 
              border: '1px solid var(--border-bright)', borderRadius: '8px',
              padding: '12px', color: 'var(--text)', outline: 'none'
            }}
          />
          <button style={{ 
            background: 'var(--cyan)', color: '#000', border: 'none', 
            padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
          }}>
            Run Request
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiLiveTest;
