import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClusterAPI } from '../config';

const API = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';


const GRAPH_HISTORY_KEY = 'graph_history_v2';

// Mirrors theme.css's --graph-cpu / --graph-ram / --graph-gpu / --graph-net tokens.
// Canvas 2D fillStyle/strokeStyle can't read CSS custom properties directly,
// so these are kept here as the resolved values of those same tokens.
const GRAPH_COLORS = {
  cpu: '#10b981',
  ram: '#34d399',
  gpu: '#10b981',
  net: '#f59e0b',
};

const loadGraphHistory = (nodeId) => {
  try {
    const nodeKey = `graph_history_node_${nodeId}`;
    const nodeStored = localStorage.getItem(nodeKey);
    if (nodeStored) {
      const parsed = JSON.parse(nodeStored);
      if (parsed && Array.isArray(parsed.cpu)) return { data: parsed, key: nodeKey };
    }
    if (nodeId === 0 || nodeId === '0') {
      const shared = localStorage.getItem(GRAPH_HISTORY_KEY);
      if (shared) {
        const parsed = JSON.parse(shared);
        if (parsed && Array.isArray(parsed.cpu)) {
          return {
            data: {
              cpu: parsed.cpu,
              ram: parsed.mem,
              gpu: Array.isArray(parsed.gpu) ? parsed.gpu : (Object.values(parsed.gpu)[0] || []),
              net: parsed.net,
            },
            key: nodeKey
          };
        }
      }
    }
  } catch (e) {}
  return {
    data: { cpu: Array(60).fill(0), ram: Array(60).fill(0), gpu: Array(60).fill(0), net: Array(60).fill(0) },
    key: `graph_history_node_${nodeId}`
  };
};

// ── Icons (no emoji anywhere — plain stroke SVGs matching the rest of the app) ──
const WarningIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, flexShrink: 0 }}>
    <path d="M8 1.5L15 14H1L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="8" cy="11.8" r="0.9" fill="currentColor" />
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" style={{ width: 11, height: 11, flexShrink: 0 }}>
    <path d="M1.5 3.5A1 1 0 012.5 2.5h2.7l1 1.2h5.3a1 1 0 011 1V11a1 1 0 01-1 1h-9a1 1 0 01-1-1V3.5z" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" style={{ width: 12, height: 12, flexShrink: 0 }}>
    <path d="M2.5 4h9M5.5 4V2.7c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7V4M5.5 6.5v4M8.5 6.5v4M3.3 4l.5 7.3c0 .4.4.7.8.7h4.8c.4 0 .8-.3.8-.7L11 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const OfflineIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" style={{ width: 28, height: 28 }}>
    <path d="M4 4l24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M9 13a10 10 0 0114 0M12.3 16.3a5.5 5.5 0 017.4 0M16 23.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
  </svg>
);

const ChevronRight = () => (
  <svg viewBox="0 0 14 14" fill="none" style={{ width: 14, height: 14, flexShrink: 0 }}>
    <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BackArrow = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const SystemResources = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('monitor');
  const [recordings, setRecordings] = useState([]);
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nodeOnline, setNodeOnline] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [recordingError, setRecordingError] = useState('');
  const [firstLoad, setFirstLoad] = useState(true);

  const accountName = localStorage.getItem('accountName') || 'User';
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token');
  const avatarInitials = (accountName || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [node] = useState(() => {
    const stored = sessionStorage.getItem('sel_system');
    if (stored) return JSON.parse(stored);
    return {
      id: 0, name: accountName, status: 'online',
      isHost: true, cpu: 'Loading...', ram: 0,
      gpuName: 'Loading...', gpuVram: 0, os: 'Loading...',
      uptime: '0s', ping: 'N/A (host)'
    };
  });

  const isLocalNode = !node.id || node.id === 0 ||
    String(node.id) === String(userId) ||
    node.isHost;

  const [cluster, setCluster] = useState(null);
  const [activeModels, setActiveModels] = useState([]);
  const [recordingCtxMenu, setRecordingCtxMenu] = useState({
    visible: false, x: 0, y: 0, filename: null, folder: null
  });

  const cpuCanvasRef = useRef(null);
  const ramCanvasRef = useRef(null);
  const gpuCanvasRef = useRef(null);
  const netCanvasRef = useRef(null);
  const recordingCanvasRef = useRef(null);

  const { data: initialHistory, key: histKey } = loadGraphHistory(node.id);
  const hists = useRef(initialHistory);
  const histStorageKey = histKey;

  const saveHists = () => {
    try { localStorage.setItem(histStorageKey, JSON.stringify(hists.current)); } catch (e) {}
  };

  const drawGraph = (canvasEl, data, color, options = {}) => {
    if (!canvasEl) return;
    const parent = canvasEl.parentElement;
    if (!parent) return;
    const W = parent.clientWidth - (options.padding || 28);
    const H = options.height || 90;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = W * dpr;
    canvasEl.height = H * dpr;
    canvasEl.style.width = W + 'px';
    canvasEl.style.height = H + 'px';

    const ctx = canvasEl.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    if (!data || data.length < 2) return;

    const n = data.length;
    const stepX = W / (59);
    const pad = 6;
    const maxValue = options.maxValue || 100;
    const vy = v => H - pad - (v / maxValue) * (H - pad * 2);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(0, vy(data[0]));
    for (let i = 1; i < n; i++) {
      const x = i * stepX, y = vy(data[i]);
      const px = (i - 1) * stepX, py = vy(data[i - 1]);
      ctx.bezierCurveTo((px + x) / 2, py, (px + x) / 2, y, x, y);
    }
    ctx.lineTo((n - 1) * stepX, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, vy(data[0]));
    for (let i = 1; i < n; i++) {
      const x = i * stepX, y = vy(data[i]);
      const px = (i - 1) * stepX, py = vy(data[i - 1]);
      ctx.bezierCurveTo((px + x) / 2, py, (px + x) / 2, y, x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const lx = (n - 1) * stepX, ly = vy(data[n - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const drawRecordingGraph = (data, key, color) => {
    const canvas = recordingCanvasRef.current;
    if (!canvas || !data || data.length < 2) return;
    const values = data.map(s => s[key] ?? 0);
    const W = canvas.parentElement?.clientWidth || 600;
    const H = 200;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = 8;
    const maxVal = Math.max(...values, 1);
    const vy = v => H - pad - (v / maxVal) * (H - pad * 2);
    const vx = i => pad + (i / (values.length - 1)) * (W - pad * 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = pad + (i / 4) * (H - pad * 2);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');

    ctx.beginPath();
    ctx.moveTo(vx(0), vy(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(vx(i), vy(values[i]));
    ctx.lineTo(vx(values.length - 1), H);
    ctx.lineTo(vx(0), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(vx(0), vy(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(vx(i), vy(values[i]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  useEffect(() => {
    drawGraph(cpuCanvasRef.current, hists.current.cpu, GRAPH_COLORS.cpu);
    drawGraph(ramCanvasRef.current, hists.current.ram, GRAPH_COLORS.ram);
    drawGraph(gpuCanvasRef.current, hists.current.gpu, GRAPH_COLORS.gpu);
    drawGraph(netCanvasRef.current, hists.current.net, GRAPH_COLORS.net, { maxValue: 100 });
  }, []);

  useEffect(() => {
    const fetchCluster = async () => {
      try {
        const res = await fetch(`${getClusterAPI()}/api/v1/clusters/my-cluster`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setCluster(await res.json());
      } catch (e) {}
    };
    fetchCluster();
  }, []);

  useEffect(() => {
    if (activeTab !== 'monitor') return;

    const fetchStats = async () => {
      try {
        let data;
        if (isLocalNode) {
          const res = await fetch(`${API}/api/system-stats`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
        } else {
          const res = await fetch(
            `${getClusterAPI()}/api/v1/clusters/proxy/system-stats?targetId=${node.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.json();
        }

        setStats(data);
        setNodeOnline(true);
        setFetchError('');
        setFirstLoad(false);

        const newCpu = data.cpu?.usage ?? 0;
        const newRam = data.memory?.percentage ?? 0;
        const newGpu = data.gpu?.[0]?.load ?? 0;
        const newNet = data.network?.download_speed ?? 0;

        hists.current.cpu.push(newCpu); hists.current.cpu.shift();
        hists.current.ram.push(newRam); hists.current.ram.shift();
        hists.current.gpu.push(newGpu); hists.current.gpu.shift();
        hists.current.net.push(newNet); hists.current.net.shift();

        saveHists();

        drawGraph(cpuCanvasRef.current, hists.current.cpu, GRAPH_COLORS.cpu);
        drawGraph(ramCanvasRef.current, hists.current.ram, GRAPH_COLORS.ram);
        drawGraph(gpuCanvasRef.current, hists.current.gpu, GRAPH_COLORS.gpu);
        drawGraph(netCanvasRef.current, hists.current.net, GRAPH_COLORS.net, { maxValue: 100 });

      } catch (err) {
        setNodeOnline(false);
        setFetchError(`Cannot reach node: ${err.message}`);
        setFirstLoad(false);
        hists.current.cpu.push(0); hists.current.cpu.shift();
        hists.current.ram.push(0); hists.current.ram.shift();
        hists.current.gpu.push(0); hists.current.gpu.shift();
        hists.current.net.push(0); hists.current.net.shift();
        drawGraph(cpuCanvasRef.current, hists.current.cpu, GRAPH_COLORS.cpu);
        drawGraph(ramCanvasRef.current, hists.current.ram, GRAPH_COLORS.ram);
        drawGraph(gpuCanvasRef.current, hists.current.gpu, GRAPH_COLORS.gpu);
        drawGraph(netCanvasRef.current, hists.current.net, GRAPH_COLORS.net, { maxValue: 100 });
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [activeTab, isLocalNode, node.id]);

  useEffect(() => {
    const fetchActive = async () => {
      try {
        let data;
        if (isLocalNode) {
          const res = await fetch(`${API}/api/models/active`);
          if (res.ok) data = await res.json();
        } else {
          const res = await fetch(
            `${getClusterAPI()}/api/v1/clusters/proxy/models/active?targetId=${node.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) data = await res.json();
        }
        if (data) setActiveModels(data);
      } catch (e) {}
    };

    fetchActive();
    const id = setInterval(fetchActive, 3000);
    return () => clearInterval(id);
  }, [isLocalNode, node.id]);

  useEffect(() => {
    if (activeTab !== 'recordings' || !isLocalNode) return;
    const fetchList = async () => {
      try {
        const res = await fetch(`${API}/api/recordings/list`);
        const data = await res.json();
        setRecordings(Array.isArray(data) ? data : []);
      } catch (e) {}
    };
    fetchList();
  }, [activeTab, isLocalNode]);

  useEffect(() => {
    if (selectedRecording?.data) {
      setTimeout(() => drawRecordingGraph(selectedRecording.data, 'cpu', GRAPH_COLORS.cpu), 50);
    }
  }, [selectedRecording]);

  const recordingCtxMenuRef = useRef(recordingCtxMenu);
  useEffect(() => { recordingCtxMenuRef.current = recordingCtxMenu; }, [recordingCtxMenu]);

  useEffect(() => {
    const hideMenu = () => {
      if (recordingCtxMenuRef.current.visible)
        setRecordingCtxMenu(m => ({ ...m, visible: false }));
    };
    window.addEventListener('click', hideMenu);
    return () => window.removeEventListener('click', hideMenu);
  }, []);

  const handleRecordingCtxMenu = (e, filename, folder) => {
    e.preventDefault();
    e.stopPropagation();
    setRecordingCtxMenu({ visible: true, x: e.clientX, y: e.clientY, filename, folder });
  };

  const deleteRecording = async (filename, folder) => {
    if (!window.confirm(`Delete recording "${filename}"?`)) return;
    const normFolder = (!folder || folder === '.' || folder === 'root') ? '' : folder;
    const url = normFolder
      ? `${API}/api/recordings/delete/${encodeURIComponent(filename)}?folder=${encodeURIComponent(normFolder)}`
      : `${API}/api/recordings/delete/${encodeURIComponent(filename)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        setRecordings(prev => prev.filter(r => r.filename !== filename));
        if (selectedRecording?.filename === filename) setSelectedRecording(null);
      } else {
        setRecordingError('Could not delete that recording.');
      }
    } catch (err) {
      setRecordingError('Could not delete that recording.');
    }
  };

  const loadRecording = async (file, folder = 'root') => {
    setIsLoading(true);
    setRecordingError('');
    const normFolder = (!folder || folder === '.' || folder === 'root') ? '' : folder;
    const url = normFolder
      ? `${API}/api/recordings/view/${encodeURIComponent(file)}?folder=${encodeURIComponent(normFolder)}`
      : `${API}/api/recordings/view/${encodeURIComponent(file)}`;
    try {
      let res = await fetch(url);
      if (!res.ok) res = await fetch(`${API}/api/recordings/view/${encodeURIComponent(file)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.samples) {
          setSelectedRecording({
            filename: file, folder,
            data: data.samples,
            info: data.meta?.system || { os: 'Unknown' },
            meta: data.meta
          });
        } else {
          setRecordingError('Could not load recording data.');
        }
      } else {
        setRecordingError('Recording not found on server.');
      }
    } catch (err) {
      setRecordingError('Could not load recording data.');
    } finally { setIsLoading(false); }
  };

  const displayFolder = f => (!f || f === '.' || f === 'root') ? 'Root' : f;
  const fmtDur = s => {
    if (!s) return '0s';
    return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
  };

  const offline = !nodeOnline;
  const showSkeleton = firstLoad && activeTab === 'monitor' && !offline;

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', minHeight: '100vh' }}>
      <style>{`
        .sr-page { max-width: 1040px; margin: 0 auto; padding: 32px 24px 80px; }

        .sr-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
        .sr-header-title { font-size: 18px; font-weight: 600; }
        .sr-header-sub { font-size: 11px; color: var(--text-mid); margin-top: 3px; font-family: var(--font-mono); }

        .sr-tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--border); margin-bottom: 22px; }
        .sr-tab { background: none; border: none; color: var(--text-mid); font-size: 13px; font-weight: 500; padding: 11px 0; cursor: pointer; position: relative; transition: color var(--transition); }
        .sr-tab:hover { color: var(--text); }
        .sr-tab.active { color: var(--text); }
        .sr-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: var(--accent); }
        .sr-tab:disabled { opacity: 0.35; cursor: not-allowed; }
        .sr-tab:disabled:hover { color: var(--text-mid); }

        .sr-identity-strip { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 13px 18px; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 18px; }
        .sr-id-stat label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); font-family: var(--font-mono); margin-bottom: 3px; }
        .sr-id-stat value { font-family: var(--font-mono); font-size: 13px; }
        .sr-id-divider { width: 1px; height: 30px; background: var(--border); flex-shrink: 0; }

        .sr-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 18px; }
        .sr-sum-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 15px 17px; transition: border-color var(--transition); }
        .sr-sum-card:hover { border-color: var(--border-bright); }
        .sr-sum-card label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); font-family: var(--font-mono); margin-bottom: 8px; }
        .sr-sum-val { font-family: var(--font-mono); font-size: 25px; font-weight: 600; line-height: 1; }
        .sr-sum-sub { font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 5px; }
        .sr-usage-bar { height: 3px; background: var(--border); border-radius: 2px; margin-top: 11px; overflow: hidden; }
        .sr-usage-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }

        .sr-graphs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-bottom: 20px; }

        .sr-model-table { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 20px; }
        .sr-mt-head { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; padding: 9px 16px; border-bottom: 1px solid var(--border); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); font-family: var(--font-mono); }
        .sr-mt-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; padding: 11px 16px; border-bottom: 1px solid var(--border); align-items: center; }
        .sr-mt-row:last-child { border-bottom: none; }
        .sr-mt-model { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; }
        .sr-mt-val { font-family: var(--font-mono); font-size: 12px; color: var(--text-mid); }

        .sr-recording-item { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all var(--transition); margin-bottom: 8px; }
        .sr-recording-item:hover { background: var(--bg3); border-color: var(--border-bright); }
        .sr-recording-item.active { border-color: var(--accent-border); background: var(--accent-dim); }

        .sr-viewer-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 22px; margin-top: 22px; }
        .sr-viewer-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
        .sr-viewer-graph { background: var(--bg3); border-radius: var(--radius-md); padding: 18px; }

        .sr-rec-folder-tag { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: var(--radius-sm); font-size: 9px; font-family: var(--font-mono); background: var(--accent-dim); border: 1px solid var(--accent-border); color: var(--accent); margin-top: 4px; }

        .sr-skeleton-card { height: 86px; }
      `}</style>

      {/* NAV */}
      <nav className="nd-nav">
        <div className="nd-nav-left">
          <div className="nd-logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <div className="nd-logo-mark"><span/><span/><span/><span/></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <div className="nd-nav-links">
            {[['Dashboard', '/dashboard'], ['Cluster', '/cluster'], ['Create Cluster', '/create-cluster'], ['Join Cluster', '/join-cluster'], ['Cookbook', '/cookbook']].map(([l, p]) => (
              <button key={l} className="nd-nav-link" onClick={() => navigate(p)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="nd-nav-right">
          <div className="nd-avatar">{avatarInitials}</div>
        </div>
      </nav>

      <div className="sr-page">
        <div className="sr-header">
          <button className="nd-back-btn" onClick={() => navigate(-1)}>
            <BackArrow />
            Back
          </button>
          <div style={{ flex: 1 }}>
            <div className="sr-header-title">{node.name} — Resources</div>
            <div className="sr-header-sub">
              {isLocalNode ? 'Local node (host)' : `Remote node · ID ${node.id}`}
            </div>
          </div>
          {!isLocalNode && <span className="badge badge-yellow">Remote</span>}
          <div className={`badge ${offline ? 'badge-red' : 'badge-accent'}`}>
            <div className={`status-dot ${offline ? 'offline' : 'online'}`} />
            {offline ? 'Offline' : 'Live'}
          </div>
        </div>

        {fetchError && (
          <div className="nd-error-banner" style={{ marginBottom: 16 }}>
            <WarningIcon />
            {fetchError}
            {!isLocalNode && ' — node may be offline or unreachable through its tunnel.'}
          </div>
        )}

        <div className="sr-tabs">
          <button className={`sr-tab ${activeTab === 'monitor' ? 'active' : ''}`} onClick={() => setActiveTab('monitor')}>
            Live Monitor
          </button>
          <button
            className={`sr-tab ${activeTab === 'recordings' ? 'active' : ''}`}
            onClick={() => isLocalNode && setActiveTab('recordings')}
            disabled={!isLocalNode}
            title={!isLocalNode ? 'Recordings are only available on the local node' : ''}
          >
            Recorded Sessions {!isLocalNode && '(host only)'}
          </button>
        </div>

        {activeTab === 'monitor' ? (
          <>
            <div className="sr-identity-strip">
              <div className="sr-id-stat"><label>Node</label><value>{node.name}</value></div>
              <div className="sr-id-divider" />
              <div className="sr-id-stat">
                <label>Status</label>
                <value style={{ color: offline ? 'var(--red)' : 'var(--accent)' }}>
                  {offline ? 'offline' : 'online'}
                </value>
              </div>
              <div className="sr-id-divider" />
              <div className="sr-id-stat">
                <label>Role</label>
                <value>{node.isHost ? <span className="badge badge-accent">Host</span> : 'Worker'}</value>
              </div>
              <div className="sr-id-divider" />
              <div className="sr-id-stat">
                <label>Type</label>
                <value style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>
                  {isLocalNode ? 'Local' : 'Remote'}
                </value>
              </div>
              {node.consecutiveTimeouts > 0 && (
                <>
                  <div className="sr-id-divider" />
                  <div className="sr-id-stat">
                    <label>Timeouts</label>
                    <value style={{ color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>
                      {node.consecutiveTimeouts}
                    </value>
                  </div>
                </>
              )}
            </div>

            {offline ? (
              <div className="nd-empty" style={{ background: 'var(--bg2)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ color: 'var(--red)', opacity: 0.6 }}><OfflineIcon /></div>
                <div className="nd-empty-title">Node unreachable</div>
                <div className="nd-empty-sub">
                  {isLocalNode
                    ? 'The local ai-service is not responding. Make sure Docker is running.'
                    : 'This node is offline or its tunnel URL has changed. The system will attempt auto-recovery every 40 seconds.'}
                </div>
              </div>
            ) : showSkeleton ? (
              <>
                <div className="sr-summary-row">
                  {[0, 1, 2, 3].map(i => <div key={i} className="nd-card skeleton sr-skeleton-card" />)}
                </div>
                <div className="sr-graphs-grid">
                  {[0, 1, 2, 3].map(i => <div key={i} className="nd-card skeleton" style={{ height: 150 }} />)}
                </div>
              </>
            ) : (
              <>
                <div className="sr-summary-row animate-in">
                  <div className="sr-sum-card">
                    <label>CPU Usage</label>
                    <div className="sr-sum-val" style={{ color: GRAPH_COLORS.cpu }}>{(stats?.cpu?.usage || 0)}%</div>
                    <div className="sr-sum-sub">{stats?.cpu?.frequency?.current || '—'}</div>
                    <div className="sr-usage-bar">
                      <div className="sr-usage-fill" style={{ background: GRAPH_COLORS.cpu, width: `${stats?.cpu?.usage || 0}%` }} />
                    </div>
                  </div>
                  <div className="sr-sum-card">
                    <label>RAM Usage</label>
                    <div className="sr-sum-val" style={{ color: GRAPH_COLORS.ram }}>{(stats?.memory?.percentage || 0)}%</div>
                    <div className="sr-sum-sub">{stats?.memory?.used || '—'} / {stats?.memory?.total || '—'} GB</div>
                    <div className="sr-usage-bar">
                      <div className="sr-usage-fill" style={{ background: GRAPH_COLORS.ram, width: `${stats?.memory?.percentage || 0}%` }} />
                    </div>
                  </div>
                  <div className="sr-sum-card">
                    <label>GPU Usage</label>
                    <div className="sr-sum-val" style={{ color: GRAPH_COLORS.gpu }}>{(stats?.gpu?.[0]?.load || 0)}%</div>
                    <div className="sr-sum-sub">{stats?.gpu?.[0]?.memory_used || '—'} / {stats?.gpu?.[0]?.memory_total || '—'} GB</div>
                    <div className="sr-usage-bar">
                      <div className="sr-usage-fill" style={{ background: GRAPH_COLORS.gpu, width: `${stats?.gpu?.[0]?.load || 0}%` }} />
                    </div>
                  </div>
                  <div className="sr-sum-card">
                    <label>Network I/O</label>
                    <div className="sr-sum-val" style={{ color: GRAPH_COLORS.net }}>{stats?.network?.download_speed || 0} Mbps</div>
                    <div className="sr-sum-sub">↑ {stats?.network?.upload_speed || 0} Mbps</div>
                    <div className="sr-usage-bar">
                      <div className="sr-usage-fill" style={{ background: GRAPH_COLORS.net, width: `${Math.min(100, stats?.network?.download_speed || 0)}%` }} />
                    </div>
                  </div>
                </div>

                <div className="sr-graphs-grid animate-in">
                  <div className="nd-graph-card">
                    <div className="nd-graph-header">
                      <span className="label-caps">CPU Usage</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: GRAPH_COLORS.cpu }}>{stats?.cpu?.usage || 0}%</span>
                    </div>
                    <div className="nd-graph-body"><canvas ref={cpuCanvasRef} /></div>
                  </div>
                  <div className="nd-graph-card">
                    <div className="nd-graph-header">
                      <span className="label-caps">RAM Usage</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: GRAPH_COLORS.ram }}>{stats?.memory?.percentage || 0}%</span>
                    </div>
                    <div className="nd-graph-body"><canvas ref={ramCanvasRef} /></div>
                  </div>
                  <div className="nd-graph-card">
                    <div className="nd-graph-header">
                      <span className="label-caps">GPU Usage</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: GRAPH_COLORS.gpu }}>{stats?.gpu?.[0]?.load || 0}%</span>
                    </div>
                    <div className="nd-graph-body"><canvas ref={gpuCanvasRef} /></div>
                  </div>
                  <div className="nd-graph-card">
                    <div className="nd-graph-header">
                      <span className="label-caps">Network Throughput</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: GRAPH_COLORS.net }}>{stats?.network?.download_speed || 0} Mbps</span>
                    </div>
                    <div className="nd-graph-body"><canvas ref={netCanvasRef} /></div>
                  </div>
                </div>

                <div className="label-caps" style={{ marginBottom: 10 }}>Active on this node</div>
                <div className="sr-model-table">
                  <div className="sr-mt-head">
                    <span>Model</span><span>Status</span><span>Score</span>
                    <span>Wins</span><span>Votes</span>
                  </div>
                  {activeModels.length === 0 ? (
                    <div className="nd-empty-sub" style={{ padding: '18px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      No models loaded on this node.
                    </div>
                  ) : (
                    activeModels.map(m => (
                      <div key={m.name} className="sr-mt-row">
                        <div className="sr-mt-model">
                          <div className="status-dot online" />
                          {m.name}
                        </div>
                        <div className="sr-mt-val" style={{ color: 'var(--accent)' }}>online</div>
                        <div className="sr-mt-val">{Math.round(m.score || 0)}</div>
                        <div className="sr-mt-val">{m.wins || 0}</div>
                        <div className="sr-mt-val">{m.votes || 0}</div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="animate-in">
            <div className="label-caps" style={{ marginBottom: 16 }}>Recorded hardware sessions</div>

            {recordingError && (
              <div className="nd-error-banner" style={{ marginBottom: 14 }}>
                <WarningIcon />
                {recordingError}
              </div>
            )}

            {recordings.length === 0 ? (
              <div className="nd-empty" style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
                <div className="nd-empty-sub">No recordings found. Use the floating REC button to start a session.</div>
              </div>
            ) : (
              recordings.map(rec => (
                <div
                  key={rec.filename}
                  className={`sr-recording-item ${selectedRecording?.filename === rec.filename ? 'active' : ''}`}
                  onClick={() => loadRecording(rec.filename, rec.folder)}
                  onContextMenu={e => handleRecordingCtxMenu(e, rec.filename, rec.folder)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg viewBox="0 0 14 14" fill="none" style={{ width: 16, height: 16, color: 'var(--text-dim)', flexShrink: 0 }}>
                      <path d="M2 3.5A1.5 1.5 0 013.5 2h7A1.5 1.5 0 0112 3.5v7a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 012 10.5v-7z" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{rec.filename}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        {rec.started_at ? new Date(rec.started_at).toLocaleString() : '—'} · {fmtDur(rec.duration)}
                      </div>
                      {rec.folder && rec.folder !== '.' && rec.folder !== 'root' && (
                        <span className="sr-rec-folder-tag"><FolderIcon /> {rec.folder}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-dim)' }}><ChevronRight /></span>
                </div>
              ))
            )}

            {isLoading && (
              <div className="nd-empty-sub" style={{ padding: 20, textAlign: 'center' }}>
                Loading recording…
              </div>
            )}

            {selectedRecording && !isLoading && (
              <div className="sr-viewer-card">
                <div className="sr-viewer-header">
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>{selectedRecording.filename}</h2>
                    <p style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                      {selectedRecording.info?.os || '—'} · {selectedRecording.data.length} samples · {fmtDur(selectedRecording.meta?.duration)}
                    </p>
                    {selectedRecording.folder && selectedRecording.folder !== 'root' && selectedRecording.folder !== '.' && (
                      <span className="sr-rec-folder-tag" style={{ marginTop: 6 }}><FolderIcon /> {selectedRecording.folder}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => deleteRecording(selectedRecording.filename, selectedRecording.folder)}>
                      <TrashIcon /> Delete
                    </button>
                    <button className="nd-back-btn" onClick={() => setSelectedRecording(null)}>Close</button>
                  </div>
                </div>
                <div className="sr-viewer-graph">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <span className="label-caps">CPU Usage Over Time (%)</span>
                    <span style={{ color: GRAPH_COLORS.cpu, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      avg {(selectedRecording.data.reduce((a, b) => a + (b.cpu || 0), 0) / selectedRecording.data.length).toFixed(1)}% · peak {Math.max(...selectedRecording.data.map(d => d.cpu || 0)).toFixed(1)}%
                    </span>
                  </div>
                  <canvas ref={recordingCanvasRef} style={{ display: 'block', width: '100%', height: 200 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
                  {[
                    { label: 'AVG CPU', color: GRAPH_COLORS.cpu, val: (selectedRecording.data.reduce((a, b) => a + (b.cpu || 0), 0) / selectedRecording.data.length).toFixed(1) + '%' },
                    { label: 'MAX CPU', color: GRAPH_COLORS.cpu, val: Math.max(...selectedRecording.data.map(d => d.cpu || 0)).toFixed(1) + '%' },
                    { label: 'AVG RAM', color: GRAPH_COLORS.ram, val: (selectedRecording.data.reduce((a, b) => a + (b.memory || 0), 0) / selectedRecording.data.length).toFixed(1) + '%' },
                    { label: 'PEAK GPU', color: GRAPH_COLORS.gpu, val: Math.max(...selectedRecording.data.map(d => d.gpu || 0)).toFixed(1) + '%' },
                  ].map(s => (
                    <div key={s.label} className="sr-viewer-graph" style={{ padding: 12 }}>
                      <div className="label-caps" style={{ marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 24 }}>
          <div className="nd-card">
            <div className="nd-card-header"><span className="label-caps">Hardware</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>CPU</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.cpu || '—'}</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>GPU</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.gpuName || '—'}</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>Total RAM</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.ram ? `${node.ram} GB` : '—'}</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr', borderBottom: 'none' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>OS</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.os || '—'}</span></div>
          </div>
          <div className="nd-card">
            <div className="nd-card-header"><span className="label-caps">Cluster info</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>Cluster ID</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{cluster ? `cla_${cluster.id}` : '—'}</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>Node role</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.isHost ? 'Host node' : 'Worker node'}</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>Node ID</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.id || '—'}</span></div>
            <div className="sr-mt-row" style={{ gridTemplateColumns: '1fr 1fr', borderBottom: 'none' }}><span className="nd-empty-sub" style={{ padding: 0, color: 'var(--text-mid)' }}>Ping to host</span><span className="sr-mt-val" style={{ textAlign: 'right' }}>{node.ping || '—'}</span></div>
          </div>
        </div>

        {stats?.disk?.length > 0 && (
          <div className="nd-card" style={{ marginTop: 12 }}>
            <div className="nd-card-header"><span className="label-caps">Storage</span></div>
            {stats.disk.map((d, i) => (
              <div key={i} style={{ padding: '12px 18px', borderBottom: i < stats.disk.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)' }}>
                    {d.mountpoint} <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>({d.fstype})</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {d.used} / {d.total} GB
                    <span style={{ color: 'var(--text-dim)', fontSize: 10, marginLeft: 8 }}>{d.percentage}%</span>
                  </span>
                </div>
                <div className="nd-progress">
                  <div className={`nd-progress-fill ${d.percentage > 90 ? 'critical' : d.percentage > 70 ? 'warning' : ''}`} style={{ width: `${d.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {recordingCtxMenu.visible && (
        <div className="nd-ctx-menu" style={{ top: recordingCtxMenu.y, left: recordingCtxMenu.x }} onClick={e => e.stopPropagation()}>
          <div className="nd-ctx-label">{recordingCtxMenu.filename}</div>
          <button className="nd-ctx-item" onClick={() => { loadRecording(recordingCtxMenu.filename, recordingCtxMenu.folder); setRecordingCtxMenu(m => ({ ...m, visible: false })); }}>
            View recording
          </button>
          <div className="nd-ctx-divider" />
          <button className="nd-ctx-item danger" onClick={() => { deleteRecording(recordingCtxMenu.filename, recordingCtxMenu.folder); setRecordingCtxMenu(m => ({ ...m, visible: false })); }}>
            <TrashIcon /> Delete
          </button>
        </div>
      )}
    </div>
  );
};

export default SystemResources;