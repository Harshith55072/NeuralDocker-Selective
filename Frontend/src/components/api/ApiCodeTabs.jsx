import React from 'react';

const ApiCodeTabs = () => {
  return (
    <div className="api-section">
      <div className="api-section-body">
        <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '16px' }}>Request Samples</h3>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--cyan)', borderBottom: '2px solid var(--cyan)', padding: '8px 4px', fontSize: '12px', cursor: 'pointer' }}>cURL</button>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-mid)', padding: '8px 4px', fontSize: '12px', cursor: 'pointer' }}>Python</button>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-mid)', padding: '8px 4px', fontSize: '12px', cursor: 'pointer' }}>JavaScript</button>
        </div>
        <div className="api-code">
          <pre style={{ margin: 0 }}><code className="api-url">
{`curl -X POST "https://api.neuraldocker.com/v1/generate" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Hello world",
    "model": "llama-3-8b"
  }'`}
          </code></pre>
        </div>
      </div>
    </div>
  );
};

export default ApiCodeTabs;
