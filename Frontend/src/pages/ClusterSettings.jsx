import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getClusterAPI, clearClusterSession } from '../config';



const ClusterSettings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [dirty, setDirty] = useState(false);
  const [saveToast, setSaveToast] = useState({ visible: false, msg: '', ok: true });
  const [cluster, setCluster] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingSkeletons, setDeletingSkeletons] = useState(false);
  const [resettingScores, setResettingScores] = useState(false);
  const [activeSection, setActiveSection] = useState('session');

  const accountName    = localStorage.getItem('accountName') || 'User';
  const userEmail      = localStorage.getItem('userEmail')   || '';
  const token          = () => localStorage.getItem('token');
  const avatarInitials = accountName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [sessionLength,        setSessionLength]        = useState('10');
  const [autoRotate,           setAutoRotate]           = useState(false);
  const [autoQueue,            setAutoQueue]            = useState(true);
  const [weightedVoting,       setWeightedVoting]       = useState(true);
  const [sessionHistory,       setSessionHistory]       = useState(true);
  const [enableDiscussion,     setEnableDiscussion]     = useState(false);
  const [discussionRounds,     setDiscussionRounds]     = useState('2');
  const [anonymousDiscussion,  setAnonymousDiscussion]  = useState(false);
  const [discussionBasePrompt, setDiscussionBasePrompt] = useState('');
  const [scoringMode,          setScoringMode]          = useState('cumulative');
  const [nodeTimeoutSeconds,   setNodeTimeoutSeconds]   = useState('40');
  const [maxNodeTimeouts,      setMaxNodeTimeouts]      = useState('3');
  const [recoveryPingInterval, setRecoveryPingInterval] = useState('40');
  const [maxTokens,            setMaxTokens]            = useState('512');
  const [temperature,          setTemperature]          = useState('0.7');

  const populate = (data) => {
    setSessionLength(String(data.sessionLimit ?? 10));
    setAutoRotate(data.autoRotate ?? false);
    setAutoQueue(data.autoQueue ?? true);
    setWeightedVoting(data.weightedVoting ?? true);
    setSessionHistory(data.sessionHistory ?? true);
    setDiscussionRounds(String(data.discussionRounds ?? 2));
    setEnableDiscussion(data.enableDiscussion ?? false);
    setAnonymousDiscussion(data.anonymousDiscussion ?? false);
    setDiscussionBasePrompt(data.discussionBasePrompt ?? '');
    setScoringMode(data.scoringMode ?? 'cumulative');
    setNodeTimeoutSeconds(String(data.nodeTimeoutSeconds ?? 40));
    setMaxNodeTimeouts(String(data.maxNodeTimeouts ?? 3));
    setRecoveryPingInterval(String(data.recoveryPingInterval ?? 40));
    setMaxTokens(String(data.maxTokens ?? 512));
    setTemperature(String(data.temperature ?? 0.7));
  };

  useEffect(() => {
    const load = async () => {
      try {
        const clusterId = searchParams.get('id');
        if (!clusterId) { navigate('/dashboard'); return; }
        const res = await fetch(`${getClusterAPI()}/api/v1/clusters/${clusterId}`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (!res.ok) { navigate('/dashboard'); return; }
        const data = await res.json();
        setCluster(data);
        populate(data);
        const sysRes = await fetch(`${getClusterAPI()}/api/v1/clusters/systems?clusterId=${data.id}`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          const me = sysData.find(s => s.email === userEmail);
          if (me) {
            setIsHost(me.isHost);
            if (!me.isHost) navigate(`/cluster?id=${clusterId}`);
          }
        }
      } catch { navigate('/dashboard'); }
    };
    load();
  }, []);

  if (!cluster || !isHost) return null;

  const markDirty = () => setDirty(true);

  const showToast = (msg, ok = true) => {
    setSaveToast({ visible: true, msg, ok });
    setTimeout(() => setSaveToast(t => ({ ...t, visible: false })), 2400);
  };

  const saveChanges = async () => {
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/update-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          clusterId:            cluster.id,
          autoRotate, autoQueue, weightedVoting, sessionHistory,
          sessionLimit:         parseInt(sessionLength),
          discussionRounds:     parseInt(discussionRounds),
          enableDiscussion, anonymousDiscussion, discussionBasePrompt,
          scoringMode,
          nodeTimeoutSeconds:   parseInt(nodeTimeoutSeconds),
          maxNodeTimeouts:      parseInt(maxNodeTimeouts),
          recoveryPingInterval: parseInt(recoveryPingInterval),
          maxTokens:            parseInt(maxTokens),
          temperature:          parseFloat(temperature),
        })
      });
      if (res.ok) {
        setDirty(false);
        showToast('Settings saved', true);
      } else {
        showToast('Error saving — check logs', false);
      }
    } catch { showToast('Error saving changes', false); }
  };

  const discardChanges = async () => {
    setDirty(false);
    const res = await fetch(`${getClusterAPI()}/api/v1/clusters/${cluster.id}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) { const data = await res.json(); setCluster(data); populate(data); }
    showToast('Changes discarded', true);
  };

  const deleteCluster = async () => {
    if (!window.confirm('PERMANENTLY DELETE this cluster and all its data? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ clusterId: cluster.id })
      });
      if (res.ok) { clearClusterSession(); navigate('/dashboard'); }
      else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to delete cluster.'); }
    } catch { alert('Error deleting cluster.'); }
    setDeleting(false);
  };

  const deleteSkeletons = async () => {
    if (!window.confirm('Delete all empty skeleton slots? This will permanently remove preserved scores for unloaded models. This cannot be undone.')) return;
    setDeletingSkeletons(true);
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/skeletons?clusterId=${cluster.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.ok) {
        const d = await res.json();
        alert(`Deleted ${d.deleted} skeleton slot(s).`);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to delete skeletons.');
      }
    } catch { alert('Error deleting skeletons.'); }
    setDeletingSkeletons(false);
  };

  const resetScores = async () => {
    if (!window.confirm('Reset all scores, wins, losses, and votes for this cluster? This cannot be undone.')) return;
    setResettingScores(true);
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/reset-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ clusterId: cluster.id })
      });
      if (res.ok) {
        const d = await res.json();
        alert(`Reset scores for ${d.modelsReset} model(s).`);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to reset scores.');
      }
    } catch { alert('Error resetting scores.'); }
    setResettingScores(false);
  };

  // ── Sub-components ────────────────────────────────────────────────────────
  const Toggle = ({ checked, onChange }) => (
    <label style={{ position:'relative', width:44, height:24, flexShrink:0, cursor:'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange}
        style={{ opacity:0, width:0, height:0, position:'absolute' }} />
      <div style={{
        position:'absolute', inset:0, borderRadius:12,
        background: checked ? 'var(--accent)' : 'var(--bg4)',
        border:`1px solid ${checked ? 'var(--accent)' : 'var(--border-bright)'}`,
        transition:'background .18s, border-color .18s'
      }}>
        <div style={{
          position:'absolute', top:3,
          left: checked ? 23 : 3,
          width:16, height:16, borderRadius:'50%',
          background: checked ? '#000' : 'var(--text-dim)',
          transition:'left .18s'
        }}/>
      </div>
    </label>
  );

  const Row = ({ label, desc, hint, last, children }) => (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'15px 20px',
      borderBottom: last ? 'none' : '1px solid var(--border)',
      gap:24
    }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:500, marginBottom:3, color:'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize:11, color:'var(--text-mid)', lineHeight:1.55 }}>{desc}</div>}
        {hint && <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontFamily:'var(--font-mono)', marginTop:4 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink:0 }}>{children}</div>
    </div>
  );

  const NInput_TEST_MARKER = ({ value, onChange, min, max, step }) => (
    <input type="number" min={min} max={max} step={step} value={value} onChange={onChange} data-marker="x"
      style={{ background:'var(--bg3)', border:'1px solid var(--border-bright)', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:13, padding:'7px 12px', borderRadius:'var(--radius-md)', outline:'none', width:100, textAlign:'right', transition:'border-color .15s' }}
      onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
      onBlur={e => e.target.style.borderColor = 'var(--border-bright)'} />
  );

  const NSelect = ({ value, onChange, options }) => (
    <select value={value} onChange={onChange}
      style={{ background:'var(--bg3)', border:'1px solid var(--border-bright)', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:12, padding:'7px 12px', borderRadius:'var(--radius-md)', outline:'none', minWidth:150, cursor:'pointer', transition:'border-color .15s' }}
      onFocus={e => e.target.style.borderColor = 'var(--accent-border)'}
      onBlur={e => e.target.style.borderColor = 'var(--border-bright)'}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  // ── Sidebar nav items ─────────────────────────────────────────────────────
  const SECTIONS = [
    { id:'session',    label:'Session',           icon:<svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13}}><rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6h6M4 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { id:'discussion', label:'Discussion',         icon:<svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13}}><path d="M2 3h10v6H8l-3 2V9H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> },
    { id:'scoring',    label:'Scoring',            icon:<svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13}}><path d="M7 1l1.5 3.5L13 5l-3.5 3 1 4L7 10.5 3.5 12l1-4L1 5l4.5-.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
    { id:'nodes',      label:'Nodes & Inference',  icon:<svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13}}><circle cx="3" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.2"/><path d="M4.8 7h4.4M7 4.8v.01M5.2 6.2L4 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg> },
    { id:'danger',     label:'Danger Zone',        icon:<svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13}}><path d="M7 1.5L12.5 11H1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M7 6v2.5M7 10v.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>, danger:true },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-sans)' }}>
      <style>{`
        .cs-textarea {
          width:100%; background:var(--bg3); border:1px solid var(--border-bright);
          border-radius:var(--radius-md); padding:10px 14px; color:var(--text);
          font-family:var(--font-sans); font-size:13px; line-height:1.6;
          outline:none; resize:vertical; min-height:90px; transition:border-color .15s;
          box-sizing:border-box;
        }
        .cs-textarea:focus { border-color:var(--accent-border); }

        /* Toast — top right, never overlaps recorder */
        .cs-toast {
          position:fixed; top:72px; right:24px; z-index:200;
          display:flex; align-items:center; gap:10px;
          background:var(--bg3); border:1px solid var(--border-bright);
          border-radius:var(--radius-lg); padding:11px 16px;
          box-shadow:var(--shadow-md);
          transform:translateX(calc(100% + 32px));
          transition:transform .22s cubic-bezier(0.16,1,0.3,1), opacity .22s ease;
          opacity:0; pointer-events:none;
          min-width:220px;
        }
        .cs-toast.visible {
          transform:translateX(0);
          opacity:1; pointer-events:all;
        }
        .cs-toast.dirty {
          transform:translateX(0);
          opacity:1; pointer-events:all;
        }

        /* Sidebar nav item */
        .cs-nav-item {
          display:flex; align-items:center; gap:9px;
          padding:9px 14px; border-radius:var(--radius-md);
          font-size:12px; font-weight:500; color:var(--text-mid);
          cursor:pointer; border:none; background:none;
          width:100%; text-align:left; transition:all var(--transition);
          font-family:var(--font-sans);
        }
        .cs-nav-item:hover { color:var(--text); background:var(--bg4); }
        .cs-nav-item.active { color:var(--accent); background:var(--accent-dim); }
        .cs-nav-item.danger-item { color:rgba(239,68,68,.6); }
        .cs-nav-item.danger-item:hover { color:var(--red); background:var(--red-dim); }
        .cs-nav-item.danger-item.active { color:var(--red); background:var(--red-dim); border:1px solid rgba(239,68,68,.2); }

        /* Section card */
        .cs-section {
          background:var(--bg2); border:1px solid var(--border);
          border-radius:var(--radius-lg); overflow:hidden;
        }
        .cs-section.danger-section { border-color:rgba(239,68,68,.18); }
        .cs-section-head {
          padding:13px 20px; display:flex; align-items:center; gap:9px;
          border-bottom:1px solid var(--border); background:var(--bg3);
        }
        .cs-section-head-title { font-size:11px; font-weight:600; color:var(--text-mid); text-transform:uppercase; letter-spacing:.1em; font-family:var(--font-mono); }
        .cs-section-head.danger-head { background:rgba(239,68,68,.04); }
        .cs-section-head.danger-head .cs-section-head-title { color:rgba(239,68,68,.65); }

        /* Danger buttons */
        .cs-danger-btn {
          padding:7px 14px; background:rgba(239,68,68,.07);
          border:1px solid rgba(239,68,68,.22); color:var(--red);
          border-radius:var(--radius-md); font-size:12px; font-weight:500;
          cursor:pointer; transition:all .15s; font-family:var(--font-sans);
        }
        .cs-danger-btn:hover { background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.38); }
        .cs-danger-btn:disabled { opacity:.4; cursor:not-allowed; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:'var(--nav-height)', borderBottom:'1px solid var(--border)', background:'var(--bg)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <div className="nd-logo">
            <div className="nd-logo-mark"><span/><span/><span/><span/></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:2 }}>
            {[['Dashboard', '/dashboard'], ['Cluster', `/cluster?id=${cluster.id}`]].map(([l, p]) => (
              <button key={l} onClick={() => navigate(p)} style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6, transition:'color .15s, background .15s' }}
                onMouseEnter={e => e.target.style.color = 'var(--text)'}
                onMouseLeave={e => e.target.style.color = 'var(--text-mid)'}>{l}</button>
            ))}
            <button style={{ background:'var(--accent-dim)', border:'none', fontSize:12, fontWeight:500, color:'var(--accent)', cursor:'default', padding:'5px 9px', borderRadius:6 }}>Settings</button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{accountName}</div>
            <div style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{userEmail}</div>
          </div>
          <div className="nd-avatar">{avatarInitials}</div>
        </div>
      </nav>

      {/* ── SAVE TOAST — top right, never overlaps recorder ── */}
      <div className={`cs-toast ${saveToast.visible ? 'visible' : ''}`}
        style={{ borderColor: saveToast.ok ? 'var(--accent-border)' : 'rgba(239,68,68,.3)' }}>
        <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: saveToast.ok ? 'var(--accent)' : 'var(--red)', boxShadow:`0 0 6px ${saveToast.ok ? 'var(--accent)' : 'var(--red)'}` }}/>
        <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-mid)' }}>{saveToast.msg}</span>
      </div>

      {/* ── UNSAVED CHANGES INDICATOR — also top right, below toast ── */}
      {dirty && (
        <div className="cs-toast dirty" style={{ top: saveToast.visible ? 126 : 72, display:'flex', gap:10, alignItems:'center', transition:'top .2s ease' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--yellow)', boxShadow:'0 0 6px var(--yellow)', flexShrink:0 }}/>
          <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-mid)', flex:1 }}>Unsaved changes</span>
          <button className="btn btn-ghost btn-sm" onClick={discardChanges}>Discard</button>
          <button className="btn btn-primary btn-sm" onClick={saveChanges}>Save</button>
        </div>
      )}

      {/* ── PAGE LAYOUT ── */}
      <div style={{ maxWidth:960, margin:'0 auto', padding:'28px 24px 60px', display:'grid', gridTemplateColumns:'200px 1fr', gap:24, alignItems:'start' }}>

        {/* ── SIDEBAR ── */}
        <div style={{ position:'sticky', top:'calc(var(--nav-height) + 16px)' }}>
          {/* Cluster info */}
          <div style={{ padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 5px var(--accent)', flexShrink:0 }}/>
              <span style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cluster.name}</span>
            </div>
            <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-dim)', marginBottom:8 }}>cla_{cluster.id}</div>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--accent)', background:'var(--accent-dim)', border:'1px solid var(--accent-border)', padding:'2px 7px', borderRadius:3, textTransform:'uppercase', letterSpacing:'.06em' }}>Active</span>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text-mid)', background:'var(--bg4)', border:'1px solid var(--border)', padding:'2px 7px', borderRadius:3 }}>{cluster.isPublic ? 'Public' : 'Private'}</span>
            </div>
          </div>

          {/* Section nav */}
          <nav style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {SECTIONS.map(s => (
              <button key={s.id}
                className={`cs-nav-item ${activeSection === s.id ? 'active' : ''} ${s.danger ? 'danger-item' : ''}`}
                onClick={() => setActiveSection(s.id)}>
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>

          {/* Save shortcut at bottom of sidebar */}
          {dirty && (
            <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:6 }}>
              <button className="btn btn-primary" style={{ width:'100%', fontSize:12 }} onClick={saveChanges}>Save Changes</button>
              <button className="btn btn-ghost" style={{ width:'100%', fontSize:12 }} onClick={discardChanges}>Discard</button>
            </div>
          )}
        </div>

        {/* ── CONTENT ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

          {/* ── SESSION ── */}
          {activeSection === 'session' && (
            <div className="cs-section">
              <div className="cs-section-head">
                <svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13,color:'var(--text-mid)'}}><rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6h6M4 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span className="cs-section-head-title">Session</span>
              </div>
              <Row label="Session Length" desc="Number of questions per session before it closes and triggers post-session processing.">
                <NSelect value={sessionLength} onChange={e => { setSessionLength(e.target.value); markDirty(); }} options={[['5','5 questions'],['10','10 questions'],['20','20 questions'],['30','30 questions'],['50','50 questions'],['100','100 questions'],['0','Unlimited']]} />
              </Row>
              <Row label="Auto-Rotation" desc="Replace the lowest scoring model automatically when the session limit is reached.">
                <Toggle checked={autoRotate} onChange={e => { setAutoRotate(e.target.checked); markDirty(); }} />
              </Row>
              <Row label="Auto-Queue" desc="When a model is removed via rotation, automatically load the next available model from the queue folder.">
                <Toggle checked={autoQueue} onChange={e => { setAutoQueue(e.target.checked); markDirty(); }} />
              </Row>
              <Row label="Session History" desc="Retain session logs and response history for review after a session ends." last>
                <Toggle checked={sessionHistory} onChange={e => { setSessionHistory(e.target.checked); markDirty(); }} />
              </Row>
            </div>
          )}

          {/* ── DISCUSSION ── */}
          {activeSection === 'discussion' && (
            <div className="cs-section">
              <div className="cs-section-head">
                <svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13,color:'var(--text-mid)'}}><path d="M2 3h10v6H8l-3 2V9H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                <span className="cs-section-head-title">Model Discussion — Experimental</span>
              </div>
              <Row label="Enable Model Discussion" desc={`After each session ends, models get discussion rounds to reflect and respond to each other. Each model maintains private notes that persist while loaded.`}>
                <Toggle checked={enableDiscussion} onChange={e => { setEnableDiscussion(e.target.checked); markDirty(); }} />
              </Row>

              {enableDiscussion && (
                <>
                  <Row label="Discussion Rounds" desc="Number of rounds models respond to each other after the session ends.">
                    <NSelect value={discussionRounds} onChange={e => { setDiscussionRounds(e.target.value); markDirty(); }} options={[['1','1 round'],['2','2 rounds'],['3','3 rounds'],['5','5 rounds']]} />
                  </Row>
                  <Row label="Anonymous Discussion" desc="Hide model identities from each other during the discussion phase." last={!enableDiscussion}>
                    <Toggle checked={anonymousDiscussion} onChange={e => { setAnonymousDiscussion(e.target.checked); markDirty(); }} />
                  </Row>
                  <div style={{ padding:'16px 20px' }}>
                    <div style={{ fontSize:13, fontWeight:500, marginBottom:4, color:'var(--text)' }}>Discussion Base Prompt</div>
                    <div style={{ fontSize:11, color:'var(--text-mid)', marginBottom:10, lineHeight:1.55 }}>Prompt given to all models at the start of discussion. Leave blank to use the default (reflect on the last question).</div>
                    <textarea className="cs-textarea" value={discussionBasePrompt}
                      onChange={e => { setDiscussionBasePrompt(e.target.value); markDirty(); }}
                      placeholder="e.g. Reflect on this session. What patterns did you notice?" />
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontFamily:'var(--font-mono)', marginTop:5 }}>
                      {discussionBasePrompt.trim().split(/\s+/).filter(Boolean).length} / 200 words recommended max
                    </div>
                  </div>
                </>
              )}

              {!enableDiscussion && (
                <div style={{ padding:'24px 20px', textAlign:'center', color:'var(--text-mid)', fontSize:12, fontFamily:'var(--font-mono)' }}>
                  Enable discussion above to configure discussion options.
                </div>
              )}
            </div>
          )}

          {/* ── SCORING ── */}
          {activeSection === 'scoring' && (
            <div className="cs-section">
              <div className="cs-section-head">
                <svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13,color:'var(--text-mid)'}}><path d="M7 1l1.5 3.5L13 5l-3.5 3 1 4L7 10.5 3.5 12l1-4L1 5l4.5-.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                <span className="cs-section-head-title">Scoring & Voting</span>
              </div>
              <Row label="Weighted Voting" desc="Models with higher accumulated scores carry more influence on voting results (0.5× to 1.5× weight). Rewards consistently performing models.">
                <Toggle checked={weightedVoting} onChange={e => { setWeightedVoting(e.target.checked); markDirty(); }} />
              </Row>
              <Row label="Scoring Mode" desc="How scores accumulate across sessions. Cumulative adds up indefinitely. Seasonal resets each session. Rolling average keeps a moving window." last>
                <NSelect value={scoringMode} onChange={e => { setScoringMode(e.target.value); markDirty(); }} options={[['cumulative','Cumulative'],['seasonal','Seasonal'],['rolling','Rolling Average']]} />
              </Row>
            </div>
          )}

          {/* ── NODES ── */}
          {activeSection === 'nodes' && (
            <div className="cs-section">
              <div className="cs-section-head">
                <svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13,color:'var(--text-mid)'}}><circle cx="3" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/><circle cx="11" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.2"/></svg>
                <span className="cs-section-head-title">Nodes & Inference</span>
              </div>
              <Row label="Node Response Timeout" desc="Seconds to wait for a node to respond before skipping it for the current question. Lower values make the cluster faster but may miss slow nodes." hint="Range: 10 – 300s · Default: 40s">
                <NInput value={nodeTimeoutSeconds} onChange={e => { setNodeTimeoutSeconds(e.target.value); markDirty(); }} min="10" max="300" />
              </Row>
              <Row label="Max Consecutive Timeouts" desc="How many consecutive timeouts a node can hit before the cluster automatically marks it offline and stops routing to it." hint="Range: 1 – 20 · Default: 3">
                <NInput value={maxNodeTimeouts} onChange={e => { setMaxNodeTimeouts(e.target.value); markDirty(); }} min="1" max="20" />
              </Row>
              <Row label="Recovery Ping Interval" desc="Seconds between automatic pings sent to offline nodes to check if they've come back online." hint="Range: 10 – 300s · Default: 40s">
                <NInput value={recoveryPingInterval} onChange={e => { setRecoveryPingInterval(e.target.value); markDirty(); }} min="10" max="300" />
              </Row>
              <Row label="Max Tokens" desc="Maximum number of tokens each model can generate per response. Higher values allow longer answers but increase latency." hint="Range: 64 – 4096">
                <NInput value={maxTokens} onChange={e => { setMaxTokens(e.target.value); markDirty(); }} min="64" max="4096" />
              </Row>
              <Row label="Temperature" desc="Controls randomness in model outputs. 0.0 is fully deterministic. 1.0 is balanced. 2.0 is highly creative / unpredictable." hint="Range: 0.0 – 2.0 · Default: 0.7" last>
                <NInput value={temperature} onChange={e => { setTemperature(e.target.value); markDirty(); }} min="0" max="2" step="0.1" />
              </Row>
            </div>
          )}

          {/* ── DANGER ── */}
          {activeSection === 'danger' && (
            <div className="cs-section danger-section">
              <div className="cs-section-head danger-head">
                <svg viewBox="0 0 14 14" fill="none" style={{width:13,height:13,color:'rgba(239,68,68,.65)'}}><path d="M7 1.5L12.5 11H1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M7 6v2.5M7 10v.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <span className="cs-section-head-title">Danger Zone</span>
              </div>
              <Row label="Reset All Scores" desc="Wipe all model scores, wins, losses, and votes for this cluster. Individual model files are not affected — only the tracked performance data is cleared.">
                <button className="cs-danger-btn" onClick={resetScores} disabled={resettingScores}>
                  {resettingScores ? 'Resetting…' : 'Reset Scores'}
                </button>
              </Row>
              <Row label="Delete Skeleton Slots" desc="Remove all empty skeleton slots that are preserving scores for previously loaded models. Warning: this permanently deletes the score history for those positions.">
                <button className="cs-danger-btn" onClick={deleteSkeletons} disabled={deletingSkeletons}>
                  {deletingSkeletons ? 'Deleting…' : 'Delete Skeletons'}
                </button>
              </Row>
              <Row label="Delete Cluster" desc="Permanently remove this cluster, all its settings, model records, and session history. All connected workers will be disconnected. This cannot be undone." last>
                <button className="cs-danger-btn" onClick={deleteCluster} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete Cluster'}
                </button>
              </Row>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterSettings;