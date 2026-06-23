import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getClusterAPI } from '../config';



// ─── Sidebar entry types ────────────────────────────────────────────────────
// { type: 'cluster' }
// { type: 'model', modelId, modelName, nodeName, gpuLayers, score, isOnline }

const MODEL_COLORS = ['#10b981','#34d399','#6ee7b7','#059669','#a7f3d0','#047857'];

const ModelAPI = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clusterId = searchParams.get('id') ? parseInt(searchParams.get('id')) : null;
  const accountName = localStorage.getItem('accountName') || 'User';
  const token = localStorage.getItem('token');
  const avatarInitials = (accountName || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Which sidebar entry is selected: { type: 'cluster' } | { type: 'model', ...m }
  const [selected, setSelected] = useState({ type: 'cluster' });

  const [activeTab, setActiveTab] = useState('curl');
  const [testPrompt, setTestPrompt] = useState('What is 2 + 2?');
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    fetchEndpoints();
    const id = setInterval(fetchEndpoints, 10000);
    return () => clearInterval(id);
  }, []);

  const fetchEndpoints = async () => {
    try {
      const url = clusterId
        ? `${getClusterAPI()}/api/v1/clusters/api-endpoints?clusterId=${clusterId}`
        : `${getClusterAPI()}/api/v1/clusters/api-endpoints`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        setError('Host access only. Only the cluster host can view API endpoints.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load endpoints.');
        setLoading(false);
        return;
      }
      const d = await res.json();
      setData(d);
      setError('');
    } catch {
      setError('Cannot reach backend.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const tok = showToken ? token : '<YOUR_TOKEN>';

  // ── Code generators ────────────────────────────────────────────────────────

  const clusterEndpoint = `${getClusterAPI()}/api/v1/clusters/consensus/ask`;
  const modelEndpoint = (id) => `${getClusterAPI()}/api/v1/clusters/models/${id}/ask`;

  const getCurl = () => {
    const url = selected.type === 'cluster' ? clusterEndpoint : modelEndpoint(selected.modelId);
    const cId = clusterId || data?.clusterId;
    const dataPart = selected.type === 'model' && cId
      ? `,\n    "clusterId": ${cId}`
      : '';
    return `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tok}" \\
  -d '{
    "prompt": "${testPrompt.replace(/"/g, '\\"')}",
    "system_prompt": "You are a helpful assistant."${dataPart}
  }'`;
  };

  const getJS = () => {
    const url = selected.type === 'cluster' ? clusterEndpoint : modelEndpoint(selected.modelId);
    const answerField = selected.type === 'cluster' ? 'data.winner.answer' : 'data.answer';
    const cId = clusterId || data?.clusterId;
    const dataPart = selected.type === 'model' && cId
      ? `,\n      clusterId: ${cId}`
      : '';
    return `const response = await fetch(
  "${url}",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer ${tok}"
    },
    body: JSON.stringify({
      prompt: "${testPrompt.replace(/"/g, '\\"')}",
      system_prompt: "You are a helpful assistant."${dataPart}
    })
  }
);
const data = await response.json();
console.log(${answerField});`;
  };

  const getPython = () => {
    const url = selected.type === 'cluster' ? clusterEndpoint : modelEndpoint(selected.modelId);
    const answerField = selected.type === 'cluster' ? 'data["winner"]["answer"]' : 'data["answer"]';
    const cId = clusterId || data?.clusterId;
    const dataPart = selected.type === 'model' && cId
      ? `,\n    "clusterId": ${cId}`
      : '';
    return `import requests

response = requests.post(
  "${url}",
  headers={
    "Authorization": "Bearer ${tok}",
    "Content-Type": "application/json"
  },
  json={
    "prompt": "${testPrompt.replace(/"/g, '\\"')}",
    "system_prompt": "You are a helpful assistant."${dataPart}
  }
)
data = response.json()
print(${answerField})`;
  };

  const getCodeByTab = () =>
    activeTab === 'curl' ? getCurl() :
    activeTab === 'javascript' ? getJS() :
    getPython();

  // ── Live test ──────────────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!testPrompt.trim()) return;
    setTesting(true);
    setTestResult('');
    try {
      const url = selected.type === 'cluster'
        ? `${getClusterAPI()}/api/v1/clusters/consensus/ask`
        : `${getClusterAPI()}/api/v1/clusters/models/${selected.modelId}/ask`;

      const body = { prompt: testPrompt, system_prompt: 'You are a helpful assistant.' };
      const cId = clusterId || data?.clusterId;
      if (cId) body.clusterId = cId;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setTestResult(`Error ${res.status}: ${d.error || d.message || res.statusText}`);
      } else {
        const d = await res.json();
        if (selected.type === 'cluster') {
          setTestResult(d.winner?.answer || JSON.stringify(d, null, 2));
        } else {
          setTestResult(d.answer || JSON.stringify(d, null, 2));
        }
      }
    } catch (e) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  // ── Response schema for each mode ─────────────────────────────────────────

  const clusterSchema = [
    { key: 'winner.answer',         type: 'string',  desc: 'Best answer chosen by consensus voting.' },
    { key: 'winner.model',          type: 'string',  desc: 'Name of the winning model.' },
    { key: 'winner.avg_score',      type: 'number',  desc: 'Average vote score for the winner (1.0–5.0).' },
    { key: 'all_responses',         type: 'array',   desc: 'Every model\'s answer with individual scores.' },
    { key: 'session_progress',      type: 'number',  desc: 'Questions asked this session.' },
    { key: 'session_limit',         type: 'number',  desc: 'Questions per session before rotation check.' },
    { key: 'session_ended',         type: 'boolean', desc: 'True if this question ended the session.' },
    { key: 'discussion_messages',   type: 'array',   desc: 'Post-session model discussion (if enabled).' },
  ];

  const modelSchema = [
    { key: 'answer',        type: 'string',  desc: 'The model\'s response to your prompt.' },
    { key: 'model',         type: 'string',  desc: 'Model filename that answered.' },
    { key: 'modelId',       type: 'number',  desc: 'Internal DB ID of this model.' },
    { key: 'nodeName',      type: 'string',  desc: 'Name of the node this model runs on.' },
    { key: 'session_impact',type: 'boolean', desc: 'Always false — single-model calls don\'t count toward sessions.' },
  ];

  // ── Derived values ─────────────────────────────────────────────────────────

  const onlineModels = data?.models?.filter(m => m.isOnline) ?? [];
  const isCluster = selected.type === 'cluster';
  const canTest = isCluster
    ? onlineModels.length > 0
    : selected.isOnline === true;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-sans)'}}>
      <style>{`
        .api-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:var(--nav-height); border-bottom:1px solid var(--border); background:var(--bg); position:sticky; top:0; z-index:10; }
        .api-page { max-width:1120px; margin:0 auto; padding:36px 24px 80px; }
        .api-header { margin-bottom:24px; display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap; }
        .api-header h1 { font-size:20px; font-weight:700; letter-spacing:-0.02em; margin-bottom:5px; }
        .api-header p { font-size:13px; color:var(--text-mid); line-height:1.5; }

        .api-layout { display:grid; grid-template-columns:260px 1fr; gap:16px; }

        .api-sidebar-label { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,0.45); font-family:var(--font-mono); margin-bottom:6px; padding:0 2px; }

        .api-cluster-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; cursor:pointer; transition:all var(--transition); position:relative; overflow:hidden; margin-bottom:8px; }
        .api-cluster-card:hover { border-color:var(--border-bright); background:var(--bg3); }
        .api-cluster-card.active { border-color:var(--accent-border); background:var(--accent-dim); }
        .api-cluster-card.active::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--accent); }
        .api-cluster-title { font-size:12px; font-weight:600; margin-bottom:4px; display:flex; align-items:center; gap:7px; }
        .api-cluster-sub { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); }

        .api-model-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:12px 16px; cursor:pointer; transition:all var(--transition); position:relative; overflow:hidden; margin-bottom:6px; }
        .api-model-card:hover { border-color:var(--border-bright); background:var(--bg3); }
        .api-model-card.active { border-color:var(--accent-border); background:var(--accent-dim); }
        .api-model-card.active::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--accent); }
        .api-model-card.offline { opacity:.45; }
        .api-model-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
        .api-model-name { font-size:11px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; }
        .api-model-node { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); }
        .api-model-tags { display:flex; gap:5px; margin-top:6px; flex-wrap:wrap; }
        .api-tag { font-size:9px; font-family:var(--font-mono); padding:2px 6px; border-radius:3px; border:1px solid var(--border); color:var(--text-dim); }
        .api-tag-gpu { color:var(--accent); border-color:var(--accent-border); background:var(--accent-dim); }
        .api-tag-cpu { color:var(--yellow); border-color:rgba(245,158,11,.2); background:rgba(245,158,11,.06); }
        .api-tag-offline { color:var(--red); border-color:rgba(239,68,68,.2); background:var(--red-dim); }

        .api-section { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; margin-bottom:12px; }
        .api-section-header { padding:12px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .api-section-title { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,0.5); font-family:var(--font-mono); }
        .api-section-body { padding:18px; }

        .api-token-row { display:flex; align-items:center; gap:10px; background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-md); padding:10px 14px; }
        .api-token-val { flex:1; font-family:var(--font-mono); font-size:12px; color:var(--text-mid); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .api-copy-btn { padding:4px 10px; background:none; border:1px solid var(--border-bright); color:var(--text-dim); font-size:11px; font-family:var(--font-mono); border-radius:var(--radius-sm); cursor:pointer; transition:all var(--transition); white-space:nowrap; flex-shrink:0; }
        .api-copy-btn:hover { border-color:var(--border-bright); color:var(--text); }
        .api-copy-btn.copied { color:var(--accent); border-color:var(--accent-border); }
        .api-show-btn { padding:4px 10px; background:none; border:1px solid var(--border); color:var(--text-dim); font-size:11px; font-family:var(--font-mono); border-radius:var(--radius-sm); cursor:pointer; flex-shrink:0; }

        .api-endpoint-url { display:flex; align-items:center; gap:10px; background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-md); padding:10px 14px; margin-bottom:14px; }
        .api-method { font-family:var(--font-mono); font-size:10px; font-weight:700; color:var(--accent); background:var(--accent-dim); border:1px solid var(--accent-border); padding:2px 7px; border-radius:4px; flex-shrink:0; }
        .api-url { font-family:var(--font-mono); font-size:11px; color:var(--text-mid); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        .api-tabs { display:flex; gap:0; border-bottom:1px solid var(--border); }
        .api-tab { padding:9px 16px; background:none; border:none; font-size:11px; color:var(--text-dim); cursor:pointer; transition:all var(--transition); font-family:var(--font-mono); border-bottom:2px solid transparent; }
        .api-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
        .api-tab:hover:not(.active) { color:var(--text-mid); }

        .api-code-wrap { position:relative; margin-top:12px; }
        .api-code { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px 18px; font-family:var(--font-mono); font-size:11px; color:var(--text-mid); line-height:1.7; white-space:pre; overflow-x:auto; margin:0; }
        .api-code-copy { position:absolute; top:8px; right:8px; padding:3px 9px; background:var(--bg4); border:1px solid var(--border-bright); color:var(--text-dim); font-size:10px; font-family:var(--font-mono); border-radius:var(--radius-sm); cursor:pointer; transition:all var(--transition); }
        .api-code-copy:hover { color:var(--text); }
        .api-code-copy.copied { color:var(--accent); border-color:var(--accent-border); }

        .api-test-input { background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-md); padding:10px 14px; color:var(--text); font-family:var(--font-sans); font-size:13px; outline:none; transition:border-color var(--transition); resize:vertical; min-height:80px; width:100%; box-sizing:border-box; }
        .api-test-input:focus { border-color:var(--accent-border); }
        .api-test-result { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; font-family:var(--font-mono); font-size:12px; color:var(--text-mid); line-height:1.7; white-space:pre-wrap; max-height:320px; overflow-y:auto; }
        .api-test-result.error { color:var(--red); border-color:rgba(239,68,68,.2); }

        .api-schema-row { display:flex; align-items:flex-start; gap:12px; padding:9px 12px; background:var(--bg3); border-radius:var(--radius-md); border:1px solid var(--border); margin-bottom:5px; }
        .api-schema-key { font-family:var(--font-mono); font-size:11px; color:var(--accent); min-width:150px; flex-shrink:0; }
        .api-schema-type { font-family:var(--font-mono); font-size:10px; color:var(--yellow); min-width:60px; flex-shrink:0; }
        .api-schema-desc { font-size:11px; color:var(--text-mid); line-height:1.5; }

        .api-mode-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:20px; font-size:10px; font-family:var(--font-mono); font-weight:600; letter-spacing:.06em; }
        .api-mode-cluster { background:var(--accent-dim); color:var(--accent); border:1px solid var(--accent-border); }
        .api-mode-model { background:var(--bg3); color:var(--text-mid); border:1px solid var(--border-bright); }

        .api-callout { padding:11px 14px; border-radius:var(--radius-md); font-size:12px; line-height:1.6; display:flex; gap:10px; align-items:flex-start; background:var(--accent-dim); border:1px solid var(--accent-border); color:var(--text-mid); margin-bottom:14px; }
        .api-callout.warn { background:rgba(245,158,11,.05); border-color:rgba(245,158,11,.2); }
        .api-callout-icon { font-size:13px; flex-shrink:0; margin-top:1px; }

        .input-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-mid); font-family:var(--font-mono); display:block; margin-bottom:7px; font-weight:600; }
        .api-test-btn { padding:8px 20px; background:var(--accent); color:#000; border:none; border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; transition:opacity var(--transition); display:flex; align-items:center; gap:8px; }
        .api-test-btn:hover { opacity:.85; }
        .api-test-btn:disabled { opacity:.4; cursor:not-allowed; }
        .spin { display:inline-block; animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>

      {/* ── Nav ── */}
      <nav className="api-nav">
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <div className="nd-logo">
            <div className="nd-logo-mark"><span/><span/><span/><span/></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:2 }}>
            {[['Dashboard','/dashboard'],['Cluster',`/cluster?id=${clusterId||''}`]].map(([t,p]) => (
              <button key={t} onClick={() => navigate(p)} style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }}>{t}</button>
            ))}
            <button style={{ background:'var(--accent-dim)', border:'none', fontSize:12, fontWeight:500, color:'var(--accent)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }}>API</button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="nd-back-btn" onClick={() => navigate(`/cluster?id=${clusterId||''}`)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width:12, height:12 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back
          </button>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{accountName}</div>
          </div>
          <div className="nd-avatar">{avatarInitials}</div>
        </div>
      </nav>

      <div className="api-page">
        {/* ── Page header ── */}
        <div className="api-header">
          <div>
            <h1>API Hosting</h1>
            <p>
              Talk to the full cluster (with voting) or any individual model directly.
              Per-model calls don&apos;t count toward sessions.
              {data && <span> · Cluster: <span style={{color:'var(--accent)', fontFamily:'var(--font-mono)'}}>{data.clusterName}</span></span>}
            </p>
          </div>
          <span className="api-mode-pill api-mode-cluster">Host Only</span>
        </div>

        {loading && (
          <div style={{textAlign:'center', padding:'80px 0', color:'var(--text-dim)'}}>
            <span className="spin" style={{fontSize:28, display:'block', marginBottom:12}}>⟳</span>
            Loading endpoints...
          </div>
        )}
        {error && (
          <div style={{background:'var(--red-dim)', border:'1px solid rgba(239,68,68,.2)', borderRadius:'var(--radius-lg)', padding:'20px 24px', color:'var(--red)', fontFamily:'var(--font-mono)', fontSize:13}}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* ── Auth token ── */}
            <div className="api-section" style={{marginBottom:20}}>
              <div className="api-section-header">
                <span className="api-section-title">Authentication</span>
                <span style={{fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)'}}>Required on every request</span>
              </div>
              <div className="api-section-body">
                <div style={{fontSize:12, color:'var(--text-mid)', marginBottom:10}}>
                  Include your Bearer token in the <code style={{fontFamily:'var(--font-mono)', color:'var(--cyan)'}}>Authorization</code> header on every request.
                </div>
                <div className="api-token-row">
                  <div className="api-token-val">
                    {showToken ? token : '••••••••••••••••••••••••••••••••••••••••••••'}
                  </div>
                  <button className="api-show-btn" onClick={() => setShowToken(v => !v)}>{showToken ? 'Hide' : 'Show'}</button>
                  <button className={`api-copy-btn ${copied === 'token' ? 'copied' : ''}`} onClick={() => copyToClipboard(token, 'token')}>
                    {copied === 'token' ? '✓ Copied' : 'Copy Token'}
                  </button>
                </div>
                <div style={{fontSize:11, color:'var(--text-mid)', fontFamily:'var(--font-mono)', marginTop:10}}>
                  Tokens expire with your session. Re-login to get a fresh token.
                </div>
              </div>
            </div>

            {/* ── Two-column layout ── */}
            <div className="api-layout">

              {/* ── Sidebar ── */}
              <div className="api-sidebar">

                {/* Cluster entry */}
                <div className="api-sidebar-label">Cluster</div>
                <div
                  className={`api-cluster-card ${selected.type === 'cluster' ? 'active' : ''}`}
                  onClick={() => { setSelected({ type: 'cluster' }); setTestResult(''); }}
                >
                  <div className="api-cluster-title">
                    <svg viewBox="0 0 16 16" fill="none" style={{width:14,height:14,flexShrink:0}}>
                      <circle cx="8" cy="8" r="6" stroke="var(--accent)" strokeWidth="1.5"/>
                      <circle cx="8" cy="8" r="2.5" fill="var(--accent)" opacity="0.6"/>
                    </svg>
                    Cluster Consensus
                  </div>
                  <div className="api-cluster-sub">
                    All {onlineModels.length} online model{onlineModels.length !== 1 ? 's' : ''} · voting · counts toward session
                  </div>
                </div>

                {/* Model entries */}
                <div className="api-sidebar-label" style={{marginTop:4}}>
                  Models ({data.models.length})
                </div>
                {data.models.length === 0 ? (
                  <div style={{fontSize:12, color:'var(--text-dim)', padding:'12px 4px'}}>
                    No models loaded. Load models from the cluster dashboard.
                  </div>
                ) : (
                  data.models.map((m, i) => (
                    <div
                      key={m.modelId}
                      className={`api-model-card ${selected.type === 'model' && selected.modelId === m.modelId ? 'active' : ''} ${!m.isOnline ? 'offline' : ''}`}
                      onClick={() => { setSelected({ type: 'model', ...m }); setTestResult(''); }}
                    >
                      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                        <div className="api-model-dot" style={{
                          background: MODEL_COLORS[i % MODEL_COLORS.length],
                          boxShadow: m.isOnline ? `0 0 5px ${MODEL_COLORS[i % MODEL_COLORS.length]}55` : 'none'
                        }}/>
                        <div className="api-model-name">{m.modelName}</div>
                      </div>
                      <div className="api-model-node">{m.nodeName}</div>
                      <div className="api-model-tags">
                        {m.gpuLayers > 0
                          ? <span className="api-tag api-tag-gpu">GPU · {m.gpuLayers}L</span>
                          : <span className="api-tag api-tag-cpu">CPU</span>
                        }
                        {!m.isOnline && <span className="api-tag api-tag-offline">Offline</span>}
                        <span className="api-tag">score {Math.round(m.score || 0)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ── Main panel ── */}
              <div className="api-main">

                {/* Mode banner */}
                <div className="api-section">
                  <div className="api-section-header">
                    <span className="api-section-title">
                      {isCluster ? 'Cluster Consensus Endpoint' : 'Single Model Endpoint'}
                    </span>
                    <span className={`api-mode-pill ${isCluster ? 'api-mode-cluster' : 'api-mode-model'}`}>
                      {isCluster ? '⬡ Votes · Session' : '◎ Direct · No Session'}
                    </span>
                  </div>
                  <div className="api-section-body">

                    {/* Context callout */}
                    {isCluster ? (
                      <div className="api-callout">
                        <span className="api-callout-icon">⬡</span>
                        <span>
                          This endpoint sends your prompt to <strong style={{color:'var(--text)'}}>all {onlineModels.length} online model{onlineModels.length !== 1 ? 's' : ''}</strong> simultaneously.
                          Models vote on each other's answers and the best response is returned.
                          Each call increments the session counter — when the session limit is hit, rotation may occur.
                        </span>
                      </div>
                    ) : (
                      <div className="api-callout warn">
                        <span className="api-callout-icon">◎</span>
                        <span>
                          This endpoint talks directly to <strong style={{color:'var(--text)'}}>{selected.modelName}</strong> on node <strong style={{color:'var(--text)'}}>{selected.nodeName}</strong>.
                          No voting, no scoring, no session counting. Use this to test or query a specific model in isolation.
                        </span>
                      </div>
                    )}

                    {/* Endpoint URL */}
                    <div className="api-endpoint-url">
                      <span className="api-method">POST</span>
                      <span className="api-url">
                        {isCluster
                          ? clusterEndpoint
                          : modelEndpoint(selected.modelId)
                        }
                      </span>
                      <button
                        className={`api-copy-btn ${copied === 'url' ? 'copied' : ''}`}
                        onClick={() => copyToClipboard(
                          isCluster ? clusterEndpoint : modelEndpoint(selected.modelId),
                          'url'
                        )}
                      >
                        {copied === 'url' ? '✓ Copied' : 'Copy URL'}
                      </button>
                    </div>

                    {/* Code tabs */}
                    <div className="api-tabs">
                      {['curl', 'javascript', 'python'].map(tab => (
                        <button
                          key={tab}
                          className={`api-tab ${activeTab === tab ? 'active' : ''}`}
                          onClick={() => setActiveTab(tab)}
                        >
                          {tab === 'curl' ? 'cURL' : tab === 'javascript' ? 'JavaScript' : 'Python'}
                        </button>
                      ))}
                    </div>

                    <div style={{padding:'16px 0'}}>
                      <div style={{marginBottom:12}}>
                        <label className="input-label">Test prompt (used in code examples below)</label>
                        <input
                          value={testPrompt}
                          onChange={e => setTestPrompt(e.target.value)}
                          style={{
                            background:'var(--bg3)', border:'1px solid var(--border-bright)',
                            borderRadius:6, padding:'8px 12px', color:'var(--text)',
                            fontFamily:'var(--font-sans)', fontSize:12, outline:'none',
                            width:'100%', boxSizing:'border-box'
                          }}
                          placeholder="Enter a test prompt..."
                        />
                      </div>
                      <div className="api-code-wrap">
                        <pre className="api-code">{getCodeByTab()}</pre>
                        <button
                          className={`api-code-copy ${copied === `code-${activeTab}` ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(getCodeByTab(), `code-${activeTab}`)}
                        >
                          {copied === `code-${activeTab}` ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      <div style={{marginTop:8, fontSize:10, color:'var(--text-mid)', fontFamily:'var(--font-mono)'}}>
                        Click &quot;Show&quot; on the token above to embed your real token in code examples.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Response schema */}
                <div className="api-section">
                  <div className="api-section-header">
                    <span className="api-section-title">Response Schema</span>
                  </div>
                  <div className="api-section-body">
                    {(isCluster ? clusterSchema : modelSchema).map(row => (
                      <div key={row.key} className="api-schema-row">
                        <span className="api-schema-key">{row.key}</span>
                        <span className="api-schema-type">{row.type}</span>
                        <span className="api-schema-desc">{row.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live test */}
                <div className="api-section">
                  <div className="api-section-header">
                    <span className="api-section-title">Live Test</span>
                    <span style={{fontSize:11, color:'var(--text-dim)', fontFamily:'var(--mono)'}}>
                      {isCluster
                        ? `Sends to all ${onlineModels.length} online model${onlineModels.length !== 1 ? 's' : ''} · counts toward session`
                        : `Sends directly to ${selected.modelName} · no session impact`
                      }
                    </span>
                  </div>
                  <div className="api-section-body" style={{display:'flex', flexDirection:'column', gap:12}}>
                    <div>
                      <label className="input-label">Prompt</label>
                      <textarea
                        className="api-test-input"
                        value={testPrompt}
                        onChange={e => setTestPrompt(e.target.value)}
                        placeholder="Enter your prompt..."
                      />
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <button
                        className="api-test-btn"
                        onClick={handleTest}
                        disabled={testing || !testPrompt.trim() || !canTest}
                      >
                        {testing
                          ? <><span className="spin">⟳</span> Sending...</>
                          : <>
                              <svg viewBox="0 0 14 14" fill="none" style={{width:14,height:14}}>
                                <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {isCluster ? 'Send to Cluster' : `Ask ${selected.modelName?.split('.')[0]}`}
                            </>
                        }
                      </button>
                      {!canTest && (
                        <span style={{fontSize:11, color:'var(--red)', fontFamily:'var(--font-mono)'}}>
                          {isCluster ? 'No models online.' : 'This model\'s node is offline.'}
                        </span>
                      )}
                    </div>
                    {testResult && (
                      <div>
                        <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-dim)', fontFamily:'var(--font-mono)', marginBottom:8}}>
                          Response
                        </div>
                        <div className={`api-test-result ${testResult.startsWith('Error') ? 'error' : ''}`}>
                          {testResult}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ModelAPI;
