import React from 'react';

const ApiModelCard = ({ model, endpoint, copiedId, onCopy }) => {
  return (
    <div className="api-model-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{model.modelName}</h2>
            <span style={{ 
              fontSize: '10px', fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: '4px', 
              background: model.isOnline ? 'rgba(74,222,128,0.1)' : 'rgba(156,163,175,0.1)',
              color: model.isOnline ? '#4ade80' : '#9ca3af',
              border: `1px solid ${model.isOnline ? 'rgba(74,222,128,0.2)' : 'rgba(156,163,175,0.2)'}`
            }}>
              {model.isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="api-meta">
            Hosted on {model.nodeName} ({model.nodeEmail})
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="api-meta" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Performance</div>
          <div style={{ fontSize: '14px', fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--cyan)' }}>{Math.round(model.score)}</span>
            <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>/</span>
            <span style={{ color: 'var(--text-mid)' }}>{model.votes} votes</span>
          </div>
        </div>
      </div>

      <div className="api-code" style={{ position: 'relative' }}>
        <div className="api-meta" style={{ marginBottom: '8px', textTransform: 'uppercase' }}>Direct Generation Endpoint (POST)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <code className="api-url" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {endpoint}
          </code>
          {endpoint !== 'URL unavailable' && (
            <button 
              onClick={() => onCopy(endpoint, model.modelId)}
              style={{ 
                background: 'none', border: '1px solid var(--border)', color: 'var(--text-mid)', 
                padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px',
                transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}
            >
              {copiedId === model.modelId ? 'Copied!' : 'Copy URL'}
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
        <div className="api-meta">
          <span style={{ opacity: 0.6 }}>GPU Layers:</span> <span style={{ color: 'var(--text-mid)' }}>{model.gpuLayers}</span>
        </div>
        <div className="api-meta">
          <span style={{ opacity: 0.6 }}>System IP:</span> <span style={{ color: 'var(--text-mid)' }}>{model.systemIp || 'N/A'}</span>
        </div>
      </div>
    </div>
  );
};

export default ApiModelCard;
