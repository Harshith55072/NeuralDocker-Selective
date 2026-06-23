import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getClusterAPI } from '../config';

const API = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';

const WorkerNode = () => {
  const navigate = useNavigate();
  const accountName = localStorage.getItem('accountName') || 'User';
  const userEmail   = localStorage.getItem('userEmail')   || '';
  const userId      = localStorage.getItem('userId');
  const token       = localStorage.getItem('token');
  const [searchParams] = useSearchParams();
  const clusterId = searchParams.get('id') ? parseInt(searchParams.get('id')) : null;
  const avatarInitials = (accountName || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [cluster,     setCluster]     = useState(null);
  const [stats,       setStats]       = useState(null);
  const [nodeOnline,  setNodeOnline]  = useState(true);
  const [permission,  setPermission]  = useState(true);   // resourcePermissionGranted
  const [toggling,    setToggling]    = useState(false);
  const [loadedModels, setLoadedModels] = useState([]);
  const [leaving,     setLeaving]     = useState(false);

  const cpuRef = useRef(null);
  const ramRef = useRef(null);
  const gpuRef = useRef(null);
  const netRef = useRef(null);
  const hists  = useRef({
    cpu: Array(60).fill(0), ram: Array(60).fill(0),
    gpu: Array(60).fill(0), net: Array(60).fill(0),
  });

  // ── Redirect host back to cluster dashboard ────────────────────────────────
  useEffect(() => {
    const check = async () => {
      if (!clusterId) { navigate('/dashboard'); return; }
      try {
        const res = await fetch(`${getClusterAPI()}/api/v1/clusters/${clusterId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) { navigate('/dashboard'); return; }
        const data = await res.json();
        setCluster(data);
        if (parseInt(data.hostId) === parseInt(userId)) {
          navigate(`/cluster?id=${clusterId}`);
        }
      } catch { navigate('/dashboard'); }
    };
    check();
  }, [clusterId]);

  // ── Fetch worker's own permission state ────────────────────────────────────
  useEffect(() => {
    if (!clusterId) return;
    const fetchPerm = async () => {
      try {
        const res = await fetch(`${getClusterAPI()}/api/v1/clusters/systems?clusterId=${clusterId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const systems = await res.json();
        const me = systems.find(s => s.email === userEmail);
        if (me) setPermission(me.resourcePermissionGranted !== false);
      } catch {}
    };
    fetchPerm();
  }, [clusterId]);

  // ── Poll system stats ──────────────────────────────────────────────────────
  const drawGraph = useCallback((canvas, data, color) => {
    if (!canvas) return;
    const W = canvas.parentElement?.clientWidth || 200;
    const H = 70;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
    if (data.length < 2) return;
    const step = W / 59, pad = 4;
    const vy = v => H - pad - (v / 100) * (H - pad * 2);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '00');
    ctx.beginPath(); ctx.moveTo(0, vy(data[0]));
    for (let i = 1; i < data.length; i++) {
      const px = (i-1)*step, py = vy(data[i-1]), x = i*step, y = vy(data[i]);
      ctx.bezierCurveTo((px+x)/2, py, (px+x)/2, y, x, y);
    }
    ctx.lineTo((data.length-1)*step, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, vy(data[0]));
    for (let i = 1; i < data.length; i++) {
      const px = (i-1)*step, py = vy(data[i-1]), x = i*step, y = vy(data[i]);
      ctx.bezierCurveTo((px+x)/2, py, (px+x)/2, y, x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API}/api/system-stats`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setStats(data); setNodeOnline(true);
        hists.current.cpu.push(data.cpu?.usage ?? 0);       hists.current.cpu.shift();
        hists.current.ram.push(data.memory?.percentage ?? 0); hists.current.ram.shift();
        hists.current.gpu.push(data.gpu?.[0]?.load ?? 0);   hists.current.gpu.shift();
        hists.current.net.push(data.network?.download_speed ?? 0); hists.current.net.shift();
        drawGraph(cpuRef.current, hists.current.cpu, '#10b981');
        drawGraph(ramRef.current, hists.current.ram, '#10b981');
        drawGraph(gpuRef.current, hists.current.gpu, '#10b981');
        drawGraph(netRef.current, hists.current.net, '#10b981');
      } catch {
        setNodeOnline(false);
        [cpuRef, ramRef, gpuRef, netRef].forEach(r =>
          drawGraph(r.current, Array(60).fill(0), '#10b981'));
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, 2000);
    return () => clearInterval(id);
  }, [drawGraph]);

  // ── Models loaded on this node by host ────────────────────────────────────
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API}/api/models/active`);
        if (res.ok) setLoadedModels(await res.json());
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, 4000);
    return () => clearInterval(id);
  }, []);

  // ── Toggle permission ──────────────────────────────────────────────────────
  const togglePermission = async () => {
    setToggling(true);
    const next = !permission;
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/my-permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clusterId, granted: next })
      });
      if (res.ok) setPermission(next);
      else alert('Failed to update resource sharing — please try again.');
    } catch { alert('Failed to update resource sharing — please try again.'); }
    setToggling(false);
  };

  // ── Leave cluster ──────────────────────────────────────────────────────────
  const leaveCluster = async () => {
    if (!window.confirm('Leave this cluster? Your loaded models will be unregistered.')) return;
    setLeaving(true);
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clusterId })
      });
      if (res.ok) { navigate('/dashboard'); }
      else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to leave.'); }
    } catch { alert('Error leaving cluster.'); }
    setLeaving(false);
  };

  const gpu = stats?.gpu?.[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <style>{`
        .wn-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:var(--nav-height,52px); border-bottom:1px solid var(--border); background:var(--bg); }
        .wn-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg,10px); overflow:hidden; }
        .wn-card-head { padding:12px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--bg3); }
        .wn-card-title { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:rgba(255,255,255,0.48); font-family:var(--font-mono); }
        .wn-stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--border); }
        .wn-stat { background:var(--bg2); padding:16px 18px; }
        .wn-stat label { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:rgba(255,255,255,0.45); font-family:var(--font-mono); margin-bottom:6px; }
        .wn-stat .val { font-family:var(--font-mono); font-size:24px; font-weight:600; color:var(--accent); }
        .wn-stat .sub { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); margin-top:3px; }
        .wn-bar { height:3px; background:var(--border); border-radius:2px; margin-top:10px; overflow:hidden; }
        .wn-bar-fill { height:100%; border-radius:2px; background:var(--accent); transition:width .5s ease; }
        .wn-graph-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .wn-graph { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
        .wn-graph-head { padding:10px 14px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--bg3); }
        .wn-graph-label { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:rgba(255,255,255,0.48); font-family:var(--font-mono); }
        .wn-graph-val { font-family:var(--font-mono); font-size:13px; font-weight:600; color:var(--accent); }
        .wn-graph-wrap { padding:8px 12px 10px; }
        .wn-perm-block { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .wn-perm-block.paused { border-color:rgba(245,158,11,.3); background:rgba(245,158,11,.03); }
        .wn-toggle { position:relative; width:44px; height:24px; flex-shrink:0; }
        .wn-toggle input { opacity:0; width:0; height:0; position:absolute; }
        .wn-toggle-track { position:absolute; inset:0; border-radius:12px; background:var(--border); border:1px solid var(--border-bright); cursor:pointer; transition:background .2s,border-color .2s; }
        .wn-toggle input:checked ~ .wn-toggle-track { background:var(--accent); border-color:var(--accent); }
        .wn-toggle-thumb { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#000; transition:transform .2s; pointer-events:none; }
        .wn-toggle input:checked ~ .wn-toggle-track .wn-toggle-thumb { transform:translateX(20px); }
        .wn-model-row { display:flex; align-items:center; gap:10px; padding:10px 18px; border-bottom:1px solid var(--border); }
        .wn-model-row:last-child { border-bottom:none; }
      `}</style>

      {/* Nav */}
      <nav className="wn-nav">
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <div className="nd-logo" style={{ cursor:'pointer' }} onClick={() => navigate('/dashboard')}>
            <div className="nd-logo-mark"><span/><span/><span/><span/></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:2 }}>
            <button className="cd-nav-link" style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }} onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button className="cd-nav-link" style={{ border:'none', fontSize:12, fontWeight:500, color:'var(--accent)', cursor:'pointer', padding:'5px 9px', borderRadius:6, background:'var(--accent-dim)' }}>Worker Node</button>
            <button className="cd-nav-link" style={{ background:'none', border:'none', fontSize:12, fontWeight:500, color:'var(--text-mid)', cursor:'pointer', padding:'5px 9px', borderRadius:6 }} onClick={() => navigate('/system-resources')}>Resources</button>
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

      <div style={{ maxWidth:900, margin:'0 auto', padding:'28px 24px 60px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:18, fontWeight:600 }}>Worker Node</h1>
            <p style={{ fontSize:11, color:'var(--text-mid)', fontFamily:'var(--font-mono)', marginTop:3 }}>
              Contributing resources to <span style={{ color:'var(--accent)' }}>{cluster?.name || '…'}</span>
              {cluster && <span style={{ color:'var(--text-dim)' }}> · cla_{cluster.id}</span>}
            </p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:6, border:'1px solid', fontSize:10, fontFamily:'var(--font-mono)', fontWeight:600, letterSpacing:'.06em',
              background: nodeOnline ? 'var(--accent-dim)' : 'var(--red-dim)',
              borderColor: nodeOnline ? 'var(--accent-border)' : 'rgba(239,68,68,.25)',
              color: nodeOnline ? 'var(--accent)' : 'var(--red)'
            }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background: nodeOnline ? 'var(--accent)' : 'var(--red)', boxShadow: nodeOnline ? '0 0 5px var(--accent)' : 'none' }} />
              {nodeOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        {/* Permission control */}
        <div className={`wn-perm-block ${!permission ? 'paused' : ''}`}>
          <div>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>
              Resource Sharing
            </div>
            <div style={{ fontSize:11, color:'var(--text-mid)', lineHeight:1.5 }}>
              {permission
                ? 'Your GPU and CPU are available to the cluster host. The host can load models onto your machine.'
                : 'Resource sharing is paused. The host cannot load new models on your machine. Models already running are unaffected.'}
            </div>
          </div>
          <label className="wn-toggle" title={permission ? 'Pause sharing' : 'Resume sharing'}>
            <input type="checkbox" checked={permission} onChange={togglePermission} disabled={toggling} />
            <div className="wn-toggle-track"><div className="wn-toggle-thumb" /></div>
          </label>
        </div>

        {/* Stats */}
        <div className="wn-card">
          <div className="wn-stat-grid">
            <div className="wn-stat">
              <label>CPU</label>
              <div className="val">{stats?.cpu?.usage ?? 0}%</div>
              <div className="sub">{stats?.cpu?.frequency?.current || '—'}</div>
              <div className="wn-bar"><div className="wn-bar-fill" style={{ width:`${stats?.cpu?.usage ?? 0}%` }}/></div>
            </div>
            <div className="wn-stat">
              <label>RAM</label>
              <div className="val">{stats?.memory?.percentage ?? 0}%</div>
              <div className="sub">{stats?.memory?.used || '—'} / {stats?.memory?.total || '—'} GB</div>
              <div className="wn-bar"><div className="wn-bar-fill" style={{ width:`${stats?.memory?.percentage ?? 0}%` }}/></div>
            </div>
            <div className="wn-stat">
              <label>GPU</label>
              <div className="val">{gpu?.load ?? 0}%</div>
              <div className="sub">{gpu?.memory_used || '—'} / {gpu?.memory_total || '—'} GB VRAM</div>
              <div className="wn-bar"><div className="wn-bar-fill" style={{ width:`${gpu?.load ?? 0}%` }}/></div>
            </div>
            <div className="wn-stat">
              <label>Network</label>
              <div className="val">{stats?.network?.download_speed ?? 0}</div>
              <div className="sub">↓ Mbps · ↑ {stats?.network?.upload_speed ?? 0}</div>
              <div className="wn-bar"><div className="wn-bar-fill" style={{ width:`${Math.min(100, stats?.network?.download_speed ?? 0)}%` }}/></div>
            </div>
          </div>
        </div>

        {/* Graphs */}
        <div className="wn-graph-grid">
          {[
            { label:'CPU', ref:cpuRef, val:`${stats?.cpu?.usage ?? 0}%` },
            { label:'RAM', ref:ramRef, val:`${stats?.memory?.percentage ?? 0}%` },
            { label:'GPU', ref:gpuRef, val:`${gpu?.load ?? 0}%` },
            { label:'Network', ref:netRef, val:`${stats?.network?.download_speed ?? 0} Mbps` },
          ].map(g => (
            <div key={g.label} className="wn-graph">
              <div className="wn-graph-head">
                <span className="wn-graph-label">{g.label}</span>
                <span className="wn-graph-val">{g.val}</span>
              </div>
              <div className="wn-graph-wrap"><canvas ref={g.ref} /></div>
            </div>
          ))}
        </div>

        {/* Models loaded by host */}
        <div className="wn-card">
          <div className="wn-card-head">
            <span className="wn-card-title">Models loaded on this node</span>
            <span style={{ fontSize:11, color:'var(--text-mid)', fontFamily:'var(--font-mono)' }}>{loadedModels.length} active</span>
          </div>
          {loadedModels.length === 0 ? (
            <div style={{ padding:'20px 18px', fontSize:12, color:'var(--text-mid)', fontFamily:'var(--font-mono)' }}>
              No models currently loaded on this node.
            </div>
          ) : loadedModels.map(m => (
            <div key={m.name} className="wn-model-row">
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 5px var(--accent)', flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500 }}>{m.name}</div>
                <div style={{ fontSize:10, color:'var(--text-mid)', fontFamily:'var(--font-mono)', marginTop:1 }}>
                  {m.gpu_layers > 0 ? `${m.gpu_layers} GPU layers` : 'CPU only'}
                </div>
              </div>
              <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--accent)', background:'var(--accent-dim)', border:'1px solid var(--accent-border)', padding:'2px 7px', borderRadius:4 }}>active</span>
            </div>
          ))}
        </div>

        {/* Cluster info + Leave */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'start' }}>
          <div className="wn-card">
            <div className="wn-card-head"><span className="wn-card-title">Cluster Info</span></div>
            {[
              { label:'Cluster', val: cluster?.name || '—' },
              { label:'Cluster ID', val: cluster ? `cla_${cluster.id}` : '—' },
              { label:'Your Role', val: 'Worker Node' },
              { label:'Visibility', val: cluster?.isPublic ? 'Public' : 'Private' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 18px', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                <span style={{ color:'var(--text-mid)', fontSize:11 }}>{row.label}</span>
                <span style={{ fontFamily:'var(--font-mono)', color:'var(--text-mid)' }}>{row.val}</span>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
            <button
              onClick={leaveCluster}
              disabled={leaving}
              style={{ padding:'9px 18px', background:'var(--red-dim)', border:'1px solid rgba(239,68,68,.3)', color:'var(--red)', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', whiteSpace:'nowrap' }}
            >
              {leaving ? 'Leaving…' : 'Leave Cluster'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default WorkerNode;