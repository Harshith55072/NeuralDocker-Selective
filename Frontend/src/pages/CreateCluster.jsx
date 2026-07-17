import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLocalAPI, clearClusterSession } from '../config';

const CreateCluster = () => {
  const navigate = useNavigate();
  const [clusterType, setClusterType] = useState('private');
  const [clusterName, setClusterName] = useState('');
  const [clusterPassword, setClusterPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const apiUrl = getLocalAPI();

  const handleCreateCluster = async (e) => {
    e.preventDefault();
    if (!clusterName.trim()) return alert('Please enter a name');
    if (clusterType === 'public' && !clusterPassword.trim()) {
      return alert('Public clusters require a password');
    }
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/api/v1/clusters/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: clusterName, isPublic: clusterType === 'public', password: clusterPassword }),
      });
      if (response.ok) {
        const data = await response.json();
        if (clusterPassword) sessionStorage.setItem(`cluster_pw_${data.id}`, clusterPassword);
        clearClusterSession();
        navigate(`/cluster?id=${data.id}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || errorData.message || 'Failed to create cluster');
      }
    } catch (err) {
      setError('Failed to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <style>{`
        .cc-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:var(--nav-height); border-bottom:1px solid var(--border); background:var(--bg); }
        .cc-wrap { max-width:480px; margin:60px auto; padding:0 24px; }
        .cc-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-xl); overflow:hidden; }
        .cc-card-head { padding:22px 28px 18px; border-bottom:1px solid var(--border); }
        .cc-card-body { padding:24px 28px; display:flex; flex-direction:column; gap:20px; }
        .cc-card-foot { padding:14px 28px; border-top:1px solid var(--border); background:var(--bg3); display:flex; gap:10px; justify-content:flex-end; }
        .cc-field label { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-dim); font-family:var(--font-mono); font-weight:600; margin-bottom:8px; }
        .cc-type-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }

        .cc-type-opt {
          padding:14px 16px;
          border-radius:var(--radius-md);
          border:1px solid var(--border-mid);
          background:var(--bg3);
          cursor:pointer;
          transition:all var(--transition);
          text-align:left;
          position:relative;
          overflow:hidden;
        }
        .cc-type-opt:hover { border-color:var(--border-bright); background:var(--bg4); }
        .cc-type-opt.selected {
          border-color:var(--accent-border);
          background:var(--accent-dim);
        }
        .cc-type-opt.selected::after {
          content:'';
          position:absolute;
          top:0; left:0; right:0;
          height:2px;
          background:var(--accent);
        }

        .cc-type-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .cc-type-name { font-size:13px; font-weight:600; }
        .cc-type-opt.selected .cc-type-name { color:var(--accent); }

        .cc-type-check {
          width:16px; height:16px;
          border-radius:50%;
          border:1.5px solid var(--border-mid);
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
          transition:all var(--transition);
        }
        .cc-type-opt.selected .cc-type-check {
          background:var(--accent);
          border-color:var(--accent);
        }
        .cc-type-check svg { display:none; }
        .cc-type-opt.selected .cc-type-check svg { display:block; }

        .cc-type-desc { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); line-height:1.5; }
        .cc-type-opt.selected .cc-type-desc { color:rgba(16,185,129,0.6); }

        .cc-type-tag {
          display:inline-flex; align-items:center; gap:4px;
          margin-top:8px;
          padding:2px 7px;
          border-radius:3px;
          font-size:8px;
          font-family:var(--font-mono);
          font-weight:600;
          letter-spacing:0.08em;
          text-transform:uppercase;
        }
        .cc-type-tag.private { background:rgba(255,255,255,0.06); color:var(--text-mid); border:1px solid var(--border-mid); }
        .cc-type-tag.public  { background:rgba(16,185,129,0.1); color:var(--accent); border:1px solid var(--accent-border); }
      `}</style>

      {/* Nav */}
      <nav className="cc-nav">
        <div className="nd-logo">
          <div className="nd-logo-mark"><span/><span/><span/><span/></div>
          <div className="nd-logo-text">
            <span className="nd-logo-sub">NeuralDocker</span>
            <span className="nd-logo-name">Selective</span>
          </div>
        </div>
        <button className="nd-back-btn" onClick={() => navigate(-1)}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width:12, height:12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </button>
      </nav>

      <div className="cc-wrap">
        <div style={{ marginBottom:28 }}>
          <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.02em', marginBottom:6 }}>Create Cluster</h1>
          <p style={{ fontSize:13, color:'var(--text-mid)' }}>Set up a new NeuralDocker inference cluster.</p>
        </div>

        <div className="cc-card">
          <div className="cc-card-head">
            <div style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.1em' }}>Configuration</div>
          </div>

          <div className="cc-card-body">
            {error && (
              <div style={{ fontSize:12, color:'var(--red)', background:'var(--red-dim)', border:'1px solid rgba(239,68,68,.2)', borderRadius:'var(--radius-md)', padding:'9px 13px', fontFamily:'var(--font-mono)' }}>
                {error}
              </div>
            )}

            {/* Cluster Type */}
            <div className="cc-field">
              <label>Cluster Type</label>
              <div className="cc-type-grid">
                {[
                  {
                    val: 'private',
                    name: 'Private',
                    desc: 'Invite-only. Workers join by cluster ID — not publicly listed.',
                    tag: 'private',
                    tagLabel: 'Invite only',
                  },
                  {
                    val: 'public',
                    name: 'Public',
                    desc: 'Listed in the cluster browser. Password required to join.',
                    tag: 'public',
                    tagLabel: 'Discoverable',
                  },
                ].map(opt => (
                  <button
                    key={opt.val}
                    className={`cc-type-opt ${clusterType === opt.val ? 'selected' : ''}`}
                    onClick={() => setClusterType(opt.val)}
                  >
                    <div className="cc-type-header">
                      <div className="cc-type-name">{opt.name}</div>
                      <div className="cc-type-check">
                        <svg width="9" height="7" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 9 7">
                          <polyline points="1,3.5 3.5,6 8,1"/>
                        </svg>
                      </div>
                    </div>
                    <div className="cc-type-desc">{opt.desc}</div>
                    <div className={`cc-type-tag ${opt.tag}`}>{opt.tagLabel}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cluster Name */}
            <div className="cc-field">
              <label>Cluster Name</label>
              <input className="nd-input" type="text" placeholder="e.g. Production-Grid-01"
                value={clusterName} onChange={e => setClusterName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCluster(e)} />
            </div>

            {/* Password — only for public */}
            {clusterType === 'public' && (
              <div className="cc-field">
                <label>Cluster Password</label>
                <input className="nd-input" type="password" placeholder="Set a secure password"
                  value={clusterPassword} onChange={e => setClusterPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateCluster(e)} />
                <div style={{ fontSize:10, color:'var(--text-mid)', fontFamily:'var(--font-mono)', marginTop:5 }}>
                  Required — workers must enter this to join.
                </div>
              </div>
            )}
          </div>

          <div className="cc-card-foot">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleCreateCluster} disabled={isLoading}>
              {isLoading ? <><span className="spin">⟳</span> Creating…</> : 'Create Cluster'}
            </button>
          </div>
        </div>

        {/* Summary pill */}
        <div style={{
          marginTop: 14,
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 11,
          color: 'var(--text-mid)',
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: clusterType === 'public' ? 'var(--accent)' : 'var(--text-dim)',
            boxShadow: clusterType === 'public' ? '0 0 6px var(--accent)' : 'none',
          }}/>
          {clusterType === 'private'
            ? 'Private cluster — only users you invite by cluster ID can join.'
            : 'Public cluster — visible in the cluster browser, password-gated.'}
        </div>
      </div>
    </div>
  );
};

export default CreateCluster;