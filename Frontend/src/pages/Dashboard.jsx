import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClusterAPI, getLocalAPI, getAiAPI } from '../config';

// ── GraphRenderer ─────────────────────────────────────────────────────────────
class GraphRenderer {
  constructor(canvas, color, maxValue = 100) {
    this.canvas = canvas;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.color = color;
    this.maxValue = maxValue;
    this.data = [];
    this.MAX_DATA_POINTS = 60;
    this.resize();
  }
  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;
  }
  addDataPoint(value) { this.data.push(value); if (this.data.length > this.MAX_DATA_POINTS) this.data.shift(); this.render(); }
  setData(data) { this.data = data.slice(-this.MAX_DATA_POINTS); this.render(); }
  render() {
    if (!this.canvas) return;
    const { ctx, width, height, data, maxValue, MAX_DATA_POINTS, color } = this;
    ctx.clearRect(0, 0, width, height);
    if (data.length < 2) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = (height / 4) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    const spacing = width / (MAX_DATA_POINTS - 1);
    const pts = data.map((v, i) => ({ x: width - (data.length - 1 - i) * spacing, y: height - Math.min(v / maxValue, 1) * height }));
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(0.4, color + '20');
    grad.addColorStop(1, color + '04');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(pts[0].x, height);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, height); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
  }
}

// ── Sparkline ────────────────────────────────────────────────────────────────
const Sparkline = ({ values, color, label, unit = '%', maxVal = 100 }) => {
  if (!values || values.length < 2) return null;
  const W = 600, H = 80, PAD = 4;
  const max = Math.max(...values, maxVal);
  const pts = values.map((v, i) => ({ x: PAD + (i / (values.length - 1)) * (W - PAD * 2), y: PAD + (1 - Math.min(v / max, 1)) * (H - PAD * 2) }));
  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = [`M ${pts[0].x.toFixed(1)},${H}`, ...pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`), `L ${pts[pts.length - 1].x.toFixed(1)},${H}`, 'Z'].join(' ');
  const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  const peak = Math.max(...values).toFixed(1);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--font-mono)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>avg {avg}{unit} · peak {peak}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 64, display: 'block', borderRadius: 4 }}>
        <defs><linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={PAD} y1={PAD + f * (H - PAD * 2)} x2={W - PAD} y2={PAD + f * (H - PAD * 2)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />)}
        <path d={area} fill={`url(#g-${label})`} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ── Graph history ─────────────────────────────────────────────────────────────
const GRAPH_KEY = 'graph_history_v2';
const loadGraphHistory = () => { try { const s = localStorage.getItem(GRAPH_KEY); if (s) { const p = JSON.parse(s); if (p && Array.isArray(p.cpu)) return p; } } catch {} return { cpu: [], mem: [], net: [], gpu: {} }; };
const saveGraphHistory = (h) => { try { localStorage.setItem(GRAPH_KEY, JSON.stringify(h)); } catch {} };

// ── Recording Viewer Modal ────────────────────────────────────────────────────
const RecordingViewer = ({ recording, onClose, onDelete }) => {
  if (!recording) return null;
  const { meta, samples } = recording.data;
  const extract = key => (samples || []).map(s => s[key] ?? 0);
  const fmt = iso => iso ? new Date(iso).toLocaleString() : '—';
  const fmtDur = s => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return (
    <div className="nd-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="nd-modal" style={{ maxWidth: 680, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="nd-modal-header">
          <div>
            <div className="nd-modal-title">{meta?.filename || 'Recording'}</div>
            <div className="nd-modal-sub">{fmt(meta?.started_at)} · {fmtDur(meta?.duration || 0)} · {meta?.sample_count || 0} samples</div>
            {meta?.folder && meta.folder !== '.' && <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{meta.folder}</div>}
          </div>
          <button className="nd-modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          {meta?.system && (
            <div style={{ display: 'flex', gap: 20, padding: '9px 13px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 20, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
              <span>OS: <strong style={{ color: 'var(--text-mid)' }}>{meta.system.os}</strong></span>
              <span>Host: <strong style={{ color: 'var(--text-mid)' }}>{meta.system.node_name}</strong></span>
              <span>Arch: <strong style={{ color: 'var(--text-mid)' }}>{meta.system.architecture}</strong></span>
            </div>
          )}
          {samples && samples.length > 1 ? (
            <>
              <Sparkline values={extract('cpu')} color="var(--graph-cpu)" label="CPU Usage" unit="%" maxVal={100} />
              <Sparkline values={extract('memory')} color="var(--graph-ram)" label="Memory Usage" unit="%" maxVal={100} />
              <Sparkline values={extract('ram_used')} color="#34d399" label="RAM Used" unit=" GB" maxVal={extract('ram_total')[0] || 32} />
              <Sparkline values={extract('gpu')} color="var(--graph-gpu)" label="GPU Load" unit="%" maxVal={100} />
              <Sparkline values={extract('gpu_memory')} color="var(--accent)" label="GPU VRAM" unit="%" maxVal={100} />
              <Sparkline values={extract('net_down')} color="var(--blue)" label="Network Download" unit=" Mbps" maxVal={Math.max(...extract('net_down'), 10)} />
              <Sparkline values={extract('net_up')} color="var(--graph-net)" label="Network Upload" unit=" Mbps" maxVal={Math.max(...extract('net_up'), 10)} />
            </>
          ) : <div className="nd-empty"><div className="nd-empty-sub">No sample data in this recording.</div></div>}
        </div>
        <div className="nd-modal-footer">
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(meta?.filename, meta?.folder)}>Delete</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Folder Manager Modal ──────────────────────────────────────────────────────
const FolderManagerModal = ({ recordings, onClose, onDelete, onMove, onCreateFolder }) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [movingRec, setMovingRec] = useState(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const folders = ['root', ...Array.from(new Set(recordings.map(r => r.folder).filter(f => f && f !== '.' && f !== 'root')))];
  const grouped = folders.reduce((acc, folder) => {
    acc[folder] = recordings.filter(r => { const rf = r.folder === '.' ? 'root' : (r.folder || 'root'); return rf === folder; });
    return acc;
  }, {});
  const fmtDate = iso => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const fmtDur = s => s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
  return (
    <div className="nd-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="nd-modal" style={{ maxWidth: 720, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="nd-modal-header">
          <div>
            <div className="nd-modal-title">Recording Manager</div>
            <div className="nd-modal-sub">{recordings.length} recordings · {folders.length} folders</div>
          </div>
          <button className="nd-modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '16px 22px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22, padding: '12px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)' }}>
            <input className="nd-input" type="text" placeholder="New folder name…" value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newFolderName.trim()) { onCreateFolder(newFolderName.trim()); setNewFolderName(''); } }}
              style={{ flex: 1 }} />
            <button className="btn btn-accent-ghost btn-sm" onClick={() => { if (newFolderName.trim()) { onCreateFolder(newFolderName.trim()); setNewFolderName(''); } }}>Create</button>
          </div>
          {folders.map(folder => (
            <div key={folder} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 7, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: folder === 'root' ? 'var(--text-dim)' : 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{folder === 'root' ? '/ root' : `/ ${folder}`}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{grouped[folder]?.length || 0} files</span>
              </div>
              {(!grouped[folder] || grouped[folder].length === 0) ? (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', padding: '6px 0' }}>Empty</div>
              ) : grouped[folder].map(rec => (
                <div key={rec.filename} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 5, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginBottom: 2 }}>{fmtDate(rec.started_at)}</div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-dim)' }}>
                      <span>{fmtDur(rec.duration)}</span>
                      <span>{rec.sample_count} pts</span>
                      <span>{rec.size_kb} KB</span>
                    </div>
                  </div>
                  {movingRec?.filename === rec.filename ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="nd-select" value={moveTarget} onChange={e => setMoveTarget(e.target.value)} style={{ fontSize: 10, padding: '4px 8px' }}>
                        <option value="">Select folder…</option>
                        {folders.filter(f => f !== folder).map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <button className="btn btn-accent-ghost btn-sm" onClick={() => { if (moveTarget) { onMove(rec.filename, rec.folder, moveTarget); setMovingRec(null); setMoveTarget(''); } }}>Move</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setMovingRec(null); setMoveTarget(''); }}>×</button>
                    </div>
                  ) : <button className="btn btn-ghost btn-sm" onClick={() => { setMovingRec(rec); setMoveTarget(''); }}>Move</button>}
                  {confirmDelete === rec.filename ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-danger btn-sm" onClick={() => { onDelete(rec.filename, rec.folder); setConfirmDelete(null); }}>Confirm</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>×</button>
                    </div>
                  ) : <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(rec.filename)}>Delete</button>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="nd-modal-footer">
          <span />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats]     = useState(null);
  const [lastUpdate, setLastUpdate] = useState('--');
  const [profileVisible, setProfileVisible] = useState(false);
  const accountName    = localStorage.getItem('accountName') || 'User';
  const userEmail      = localStorage.getItem('userEmail')   || '';
  const avatarInitials = accountName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const [sidebarTab, setSidebarTab]         = useState('clusters');
  const [recordings, setRecordings]         = useState([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [viewerOpen, setViewerOpen]         = useState(false);
  const [viewerData, setViewerData]         = useState(null);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [recordingCtxMenu, setRecordingCtxMenu]   = useState({ visible: false, x: 0, y: 0, filename: null, folder: null });
  const [userHasCluster, setUserHasCluster] = useState(false);
  const [clusters, setClusters]             = useState([]);
  const [clusterCtxMenu, setClusterCtxMenu] = useState({ visible: false, x: 0, y: 0, cluster: null });
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [clusterType, setClusterType]       = useState('private');
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterPassword, setNewClusterPassword] = useState('');

  const graphHistoryRef = useRef(loadGraphHistory());
  const cpuCanvasRef    = useRef(null);
  const memCanvasRef    = useRef(null);
  const netCanvasRef    = useRef(null);
  const gpuCanvasRefs   = useRef({});
  const cpuGraphRef     = useRef(null);
  const memGraphRef     = useRef(null);
  const netGraphRef     = useRef(null);
  const gpuGraphRefs    = useRef({});
  const profileRef      = useRef(null);

  // ── Graph init + polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (cpuCanvasRef.current) { cpuGraphRef.current = new GraphRenderer(cpuCanvasRef.current, '#10b981', 100); cpuGraphRef.current.setData(graphHistoryRef.current.cpu); }
    if (memCanvasRef.current) { memGraphRef.current = new GraphRenderer(memCanvasRef.current, '#34d399', 100); memGraphRef.current.setData(graphHistoryRef.current.mem); }
    if (netCanvasRef.current) { netGraphRef.current = new GraphRenderer(netCanvasRef.current, '#10b981', 100); netGraphRef.current.setData(graphHistoryRef.current.net); }

    const fetchData = async () => {
      try {
        const statsUrl = import.meta.env.VITE_STATS_API_URL || 'http://localhost:8001';
        const res = await fetch(`${statsUrl}/api/system-stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data); setLastUpdate(new Date().toLocaleTimeString());
          const cpuVal = data.cpu?.usage ?? 0;
          const memVal = data.memory?.percentage ?? 0;
          const netVal = data.network?.download_speed ?? 0;
          cpuGraphRef.current?.addDataPoint(cpuVal);
          memGraphRef.current?.addDataPoint(memVal);
          netGraphRef.current?.addDataPoint(netVal);
          graphHistoryRef.current.cpu.push(cpuVal); if (graphHistoryRef.current.cpu.length > 60) graphHistoryRef.current.cpu.shift();
          graphHistoryRef.current.mem.push(memVal); if (graphHistoryRef.current.mem.length > 60) graphHistoryRef.current.mem.shift();
          graphHistoryRef.current.net.push(netVal); if (graphHistoryRef.current.net.length > 60) graphHistoryRef.current.net.shift();
          data.gpu?.forEach(gpu => {
            const canvas = gpuCanvasRefs.current[gpu.id];
            if (canvas) {
              if (!gpuGraphRefs.current[gpu.id]) { gpuGraphRefs.current[gpu.id] = new GraphRenderer(canvas, '#10b981', 100); if (graphHistoryRef.current.gpu[gpu.id]) gpuGraphRefs.current[gpu.id].setData(graphHistoryRef.current.gpu[gpu.id]); }
              const gpuVal = gpu.load ?? 0;
              gpuGraphRefs.current[gpu.id].addDataPoint(gpuVal);
              if (!graphHistoryRef.current.gpu[gpu.id]) graphHistoryRef.current.gpu[gpu.id] = [];
              graphHistoryRef.current.gpu[gpu.id].push(gpuVal);
              if (graphHistoryRef.current.gpu[gpu.id].length > 60) graphHistoryRef.current.gpu[gpu.id].shift();
            }
          });
          saveGraphHistory(graphHistoryRef.current);
        }
      } catch { setLastUpdate('Connection Error'); }

      const apiUrl = getClusterAPI();
      try {
        const t = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/v1/clusters/my-cluster`, { headers: { Authorization: `Bearer ${t}` } });
        setUserHasCluster(res.status === 200);
      } catch {}
      try {
        const t = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/v1/clusters/my-clusters`, { headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) {
          const data = await res.json();
          setClusters(Array.isArray(data) ? data.map(c => ({
            id: `cla_${c.clusterId}`,
            rawId: c.clusterId,
            name: c.clusterName,
            isHost: c.isHost,
            status: 'active',
            models: { active: 0, total: 0 },
            uptime: '—',
            requests: 0
          })) : []);
        } else {
          console.warn('my-clusters fetch failed:', res.status);
        }
      } catch (e) { console.error('cluster fetch error:', e); }
    };

    fetchData();
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, []);

  const clusterCtxRef   = useRef(clusterCtxMenu);
  const recordingCtxRef = useRef(recordingCtxMenu);
  useEffect(() => { clusterCtxRef.current = clusterCtxMenu; }, [clusterCtxMenu]);
  useEffect(() => { recordingCtxRef.current = recordingCtxMenu; }, [recordingCtxMenu]);

  useEffect(() => {
    const hide = () => {
      if (clusterCtxRef.current.visible) setClusterCtxMenu(m => ({ ...m, visible: false }));
      if (recordingCtxRef.current.visible) setRecordingCtxMenu(m => ({ ...m, visible: false }));
    };
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, []);

  useEffect(() => {
    const handleOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileVisible(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const fetchRecordings = useCallback(async () => {
    setRecordingsLoading(true);
    try {
      const res = await fetch(`${getAiAPI()}/api/recordings/list`);
      const data = await res.json();
      setRecordings(Array.isArray(data) ? data : []);
    } catch { setRecordings([]); } finally { setRecordingsLoading(false); }
  }, []);

  useEffect(() => { if (sidebarTab === 'recordings') fetchRecordings(); }, [sidebarTab, fetchRecordings]);

  const openRecording = async (filename, folder) => {
    const aiApi = getAiAPI();
    const normFolder = (!folder || folder === '.' || folder === 'root') ? '' : folder;
    const url = normFolder ? `${aiApi}/api/recordings/view/${encodeURIComponent(filename)}?folder=${encodeURIComponent(normFolder)}` : `${aiApi}/api/recordings/view/${encodeURIComponent(filename)}`;
    try {
      const res = await fetch(url);
      if (res.ok) { const data = await res.json(); if (data?.samples) { setViewerData({ data }); setViewerOpen(true); return; } }
      const fallback = await fetch(`${aiApi}/api/recordings/view/${encodeURIComponent(filename)}`);
      if (fallback.ok) { const data = await fallback.json(); if (data?.samples) { setViewerData({ data }); setViewerOpen(true); return; } }
      alert('Recording not found.');
    } catch { alert('Failed to load recording.'); }
  };

  const deleteRecording = async (filename, folder) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    const aiApi = getAiAPI();
    const normFolder = (!folder || folder === '.' || folder === 'root') ? '' : folder;
    const url = normFolder ? `${aiApi}/api/recordings/delete/${encodeURIComponent(filename)}?folder=${encodeURIComponent(normFolder)}` : `${aiApi}/api/recordings/delete/${encodeURIComponent(filename)}`;
    try { await fetch(url, { method: 'DELETE' }); setViewerOpen(false); setViewerData(null); fetchRecordings(); } catch { alert('Delete failed.'); }
  };

  const moveRecording = async (filename, fromFolder, toFolder) => {
    const normFrom = (!fromFolder || fromFolder === '.' || fromFolder === 'root') ? '' : fromFolder;
    const normTo = (!toFolder || toFolder === 'root') ? '' : toFolder;
    try {
      const res = await fetch(`${getAiAPI()}/api/recordings/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, from_folder: normFrom, to_folder: normTo }) });
      if (!res.ok) alert('Move failed.');
      fetchRecordings();
    } catch { alert('Move failed.'); }
  };

  const createFolder = async (name) => {
    try { await fetch(`${getAiAPI()}/api/recordings/create-folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: name }) }); fetchRecordings(); } catch {}
  };

  const createCluster = async () => {
    if (!newClusterName.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const apiUrl = getLocalAPI(); // creating a cluster always targets this machine's own backend, not any joined cluster
      const res = await fetch(`${apiUrl}/api/v1/clusters/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newClusterName.trim(), isPublic: clusterType === 'public', password: newClusterPassword })
      });
      if (res.ok) {
        const c = await res.json();
        setClusters(prev => [...prev, {
          id: `cla_${c.id}`,
          rawId: c.id,
          name: c.name,
          isHost: true,
          status: 'active',
          models: { active: 0, total: 0 },
          uptime: '—',
          requests: 0
        }]);
        setCreateModalVisible(false);
        setNewClusterName('');
        setNewClusterPassword('');
        setUserHasCluster(true);
        navigate(`/cluster?id=${c.id}`);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || d.message || 'Failed to create cluster.');
      }
    } catch { alert('Error connecting to backend.'); }
  };

  const fmtDate = iso => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const fmtDur = s => s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
  const displayFolder = f => (!f || f === '.' || f === 'root') ? null : f;
  const usagePct = (val) => Math.min(Number(val) || 0, 100);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .db-nav-link { background:none; border:none; font-size:12px; font-weight:500; color:var(--text-mid); cursor:pointer; padding:5px 9px; border-radius:var(--radius-md); transition:color var(--transition),background var(--transition); }
        .db-nav-link:hover { color:var(--text); background:var(--bg4); }
        .db-nav-link.active { color:var(--accent); background:var(--accent-dim); }

        .db-layout { display:grid; grid-template-columns:1fr 280px; gap:0; flex:1; min-height:0; }
        .db-main { padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px; }
        .db-sidebar { border-left:1px solid var(--border); display:flex; flex-direction:column; overflow:hidden; }

        /* Graph cards */
        .db-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        .db-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }

        /* Card header gets a very slight background lift to separate it from body */
        .db-card-head {
          display:flex; align-items:center; justify-content:space-between;
          padding:11px 16px 10px;
          border-bottom:1px solid var(--border);
          background:var(--bg3);
        }
        .db-card-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-mid); font-family:var(--font-mono); }
        .db-card-val { font-family:var(--font-mono); font-size:16px; font-weight:700; letter-spacing:-0.02em; }
        .db-card-body { padding:12px 16px 14px; }
        .db-graph { height:72px; margin:8px 0 12px; }
        .db-graph canvas { display:block; width:100%; height:100%; }

        /* Stat rows — dimmer label, brighter value */
        .db-stats { display:grid; grid-template-columns:1fr 1fr; gap:5px 16px; }
        .db-stat { display:flex; justify-content:space-between; align-items:baseline; gap:6px; padding:3px 0; }
        .db-stat-label { font-size:10px; color:var(--text-dim); font-family:var(--font-mono); white-space:nowrap; }
        .db-stat-value { font-size:11px; font-weight:500; font-family:var(--font-mono); color:var(--text-mid); text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px; }

        /* Per-core grid */
        .db-core-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(64px,1fr)); gap:4px; margin-top:8px; }
        .db-core { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-sm); padding:5px 8px; display:flex; justify-content:space-between; align-items:center; }
        .db-core-label { font-size:9px; color:var(--text-dim); font-family:var(--font-mono); }
        .db-core-val { font-size:10px; font-family:var(--font-mono); font-weight:600; }

        /* System info bar — clean pill style */
        .db-sysbar { display:flex; gap:8px; flex-wrap:wrap; }
        .db-sysitem {
          display:flex; flex-direction:column; gap:2px; padding:8px 14px;
          background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-md); min-width:0;
        }
        .db-sysitem-label { font-size:9px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-dim); font-family:var(--font-mono); }
        .db-sysitem-value { font-size:12px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }

        /* Sidebar */
        .db-sidebar-tabs { display:flex; border-bottom:1px solid var(--border); flex-shrink:0; }
        .db-tab-btn {
          flex:1; padding:10px 0; background:none; border:none; cursor:pointer;
          font-size:11px; font-weight:600; color:var(--text-dim);
          border-bottom:2px solid transparent;
          transition:all var(--transition);
          font-family:var(--font-sans);
          letter-spacing:0.02em;
        }
        .db-tab-btn:hover { color:var(--text-mid); }
        .db-tab-btn.active { color:var(--accent); border-bottom-color:var(--accent); }
        .db-sidebar-body { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:8px; }
        .db-sidebar-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
        .db-sidebar-label { font-size:9px; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-dim); font-family:var(--font-mono); }

        /* Cluster cards */
        .db-cluster-card {
          padding:11px 13px; background:var(--bg3);
          border:1px solid var(--border); border-radius:var(--radius-lg);
          cursor:pointer; transition:border-color var(--transition),background var(--transition);
          user-select:none;
        }
        .db-cluster-card:hover { border-color:var(--border-bright); background:var(--bg4); }
        .db-cluster-name { font-size:13px; font-weight:500; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .db-cluster-id { font-family:var(--font-mono); font-size:10px; color:var(--text-dim); }

        /* Recording cards */
        .db-rec-card {
          padding:10px 12px; background:var(--bg3);
          border:1px solid var(--border); border-radius:var(--radius-md);
          cursor:pointer; transition:border-color var(--transition),background var(--transition);
          text-align:left; width:100%; color:inherit; font-family:inherit;
        }
        .db-rec-card:hover { border-color:var(--accent-border); background:var(--bg4); }

        /* Last-update chip */
        .db-update-chip {
          display:flex; align-items:center; gap:6px;
          padding:4px 10px; background:var(--bg2); border:1px solid var(--border);
          border-radius:var(--radius-sm);
        }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:'var(--nav-height)', borderBottom:'1px solid var(--border)', background:'var(--bg)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:24 }}>
          <div className="nd-logo">
            <div className="nd-logo-mark"><span/><span/><span/><span/></div>
            <div className="nd-logo-text"><span className="nd-logo-sub">NeuralDocker</span><span className="nd-logo-name">Selective</span></div>
          </div>
          <div style={{ display:'flex', gap:2 }}>
            <button className="db-nav-link active">Dashboard</button>
            <button className="db-nav-link" onClick={() => navigate('/create-cluster')}>Create Cluster</button>
            <button className="db-nav-link" onClick={() => navigate('/join-cluster')}>Join Cluster</button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, position:'relative' }} ref={profileRef} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{accountName}</div>
            <div style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{userEmail}</div>
          </div>
          <div className="nd-avatar" onClick={() => setProfileVisible(v => !v)}>{avatarInitials}</div>
          {profileVisible && (
            <div className="nd-profile-dropdown animate-in">
              <button onClick={() => { const c = clusters.find(cl => cl.isHost) || clusters[0]; if (c) navigate(c.isHost ? `/cluster?id=${c.rawId}` : `/worker-node?id=${c.rawId}`); else navigate('/create-cluster'); }}>Go to Cluster</button>
              <div className="nd-divider" style={{ margin:'2px 0' }} />
              <button className="danger" onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('accountName');
                localStorage.removeItem('userId');
                navigate('/');
              }}>Log Out</button>
            </div>
          )}
        </div>
      </nav>

      <div className="db-layout" style={{ flex:1 }}>

        {/* ── MAIN ── */}
        <div className="db-main">

          {/* Page header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:'-0.02em', marginBottom:3 }}>System Monitor</h1>
              <p style={{ fontSize:12, color:'var(--text-mid)' }}>Real-time hardware performance</p>
            </div>
            <div className="db-update-chip">
              <div className="status-dot online" />
              <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--text-mid)' }}>{lastUpdate}</span>
            </div>
          </div>

          {/* System info bar */}
          <div className="db-sysbar">
            {[
              ['OS', stats?.system?.os],
              ['Architecture', stats?.system?.architecture],
              ['Uptime', stats?.system?.uptime],
              ['Hostname', stats?.system?.node_name],
            ].map(([label, val]) => (
              <div className="db-sysitem" key={label}>
                <span className="db-sysitem-label">{label}</span>
                <span className="db-sysitem-value">{val || '—'}</span>
              </div>
            ))}
          </div>

          {/* Graph grid */}
          <div className="db-grid">

            {/* CPU */}
            <div className="db-card">
              <div className="db-card-head">
                <span className="db-card-title">CPU</span>
                <span className="db-card-val" style={{ color:'var(--graph-cpu)' }}>{stats?.cpu?.usage ?? '--'}%</span>
              </div>
              <div className="db-card-body">
                <div className="nd-progress" style={{ marginBottom:6 }}>
                  <div className="nd-progress-fill" style={{ width:`${usagePct(stats?.cpu?.usage)}%`, background:'var(--graph-cpu)' }} />
                </div>
                <div className="db-graph"><canvas ref={cpuCanvasRef} style={{ height:72 }} /></div>
                <div className="db-stats">
                  {[['Model', stats?.cpu?.name], ['Freq', stats?.cpu?.frequency?.current], ['Cores', stats?.cpu?.cores], ['Threads', stats?.cpu?.threads], ['Temp', stats?.cpu?.temperature ? `${stats.cpu.temperature}°C` : '--'], ['Max Freq', stats?.cpu?.frequency?.max]].map(([l, v]) => (
                    <div className="db-stat" key={l}><span className="db-stat-label">{l}</span><span className="db-stat-value">{v ?? '--'}</span></div>
                  ))}
                </div>
                {stats?.cpu?.per_core_usage?.length > 0 && (
                  <>
                    <div className="label-caps" style={{ marginTop:14, marginBottom:6 }}>Per-Core</div>
                    <div className="db-core-grid">
                      {stats.cpu.per_core_usage.map((u, i) => (
                        <div className="db-core" key={i}>
                          <span className="db-core-label">C{i}</span>
                          <span className="db-core-val" style={{ color: u > 80 ? 'var(--red)' : u > 60 ? 'var(--yellow)' : 'var(--graph-cpu)' }}>{u}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Memory */}
            <div className="db-card">
              <div className="db-card-head">
                <span className="db-card-title">Memory (RAM)</span>
                <span className="db-card-val" style={{ color:'var(--graph-ram)' }}>{stats?.memory?.percentage ?? '--'}%</span>
              </div>
              <div className="db-card-body">
                <div className="nd-progress" style={{ marginBottom:6 }}>
                  <div className="nd-progress-fill" style={{ width:`${usagePct(stats?.memory?.percentage)}%`, background:'var(--graph-ram)' }} />
                </div>
                <div className="db-graph"><canvas ref={memCanvasRef} style={{ height:72 }} /></div>
                <div className="db-stats">
                  {[['Used', stats?.memory?.used ? `${stats.memory.used} GB` : '--'], ['Total', stats?.memory?.total ? `${stats.memory.total} GB` : '--'], ['Available', stats?.memory?.available ? `${stats.memory.available} GB` : '--']].map(([l, v]) => (
                    <div className="db-stat" key={l}><span className="db-stat-label">{l}</span><span className="db-stat-value">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>

            {/* GPUs */}
            {stats?.gpu?.map((gpu, idx) => (
              <div className="db-card" key={idx}>
                <div className="db-card-head">
                  <span className="db-card-title">GPU {gpu.id} — {gpu.name}</span>
                  <span className="db-card-val" style={{ color:'var(--graph-gpu)' }}>{gpu.load}%</span>
                </div>
                <div className="db-card-body">
                  <div className="nd-progress" style={{ marginBottom:6 }}>
                    <div className="nd-progress-fill" style={{ width:`${usagePct(gpu.load)}%`, background:'var(--graph-gpu)' }} />
                  </div>
                  <div className="db-graph"><canvas ref={el => gpuCanvasRefs.current[gpu.id] = el} style={{ height:72 }} /></div>
                  <div className="db-stats">
                    {[['VRAM Total', `${gpu.memory_total} GB`], ['VRAM Used', `${gpu.memory_used} GB`], ['Temp', gpu.temperature ? `${gpu.temperature}°C` : 'N/A']].map(([l, v]) => (
                      <div className="db-stat" key={l}><span className="db-stat-label">{l}</span><span className="db-stat-value">{v}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Network */}
            <div className="db-card">
              <div className="db-card-head">
                <span className="db-card-title">Network</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div className={`status-dot ${stats?.network?.status === 'Connected' ? 'online' : 'offline'}`} />
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-mid)' }}>{stats?.network?.status ?? '--'}</span>
                </div>
              </div>
              <div className="db-card-body">
                <div className="db-graph"><canvas ref={netCanvasRef} style={{ height:72 }} /></div>
                <div className="db-stats">
                  <div className="db-stat"><span className="db-stat-label">Download</span><span className="db-stat-value" style={{ color:'var(--accent)' }}>{stats?.network?.download_speed ?? '--'} Mbps</span></div>
                  <div className="db-stat"><span className="db-stat-label">Upload</span><span className="db-stat-value" style={{ color:'var(--graph-net)' }}>{stats?.network?.upload_speed ?? '--'} Mbps</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div className="db-sidebar">
          <div className="db-sidebar-tabs">
            <button className={`db-tab-btn ${sidebarTab === 'clusters' ? 'active' : ''}`} onClick={() => setSidebarTab('clusters')}>
              Clusters
            </button>
            <button className={`db-tab-btn ${sidebarTab === 'recordings' ? 'active' : ''}`} onClick={() => setSidebarTab('recordings')}>
              Recordings
            </button>
          </div>

          <div className="db-sidebar-body">
            {sidebarTab === 'clusters' && (
              <>
                <div className="db-sidebar-head">
                  <span className="db-sidebar-label">My Clusters</span>
                  <button className="btn btn-accent-ghost btn-sm" onClick={() => setCreateModalVisible(true)}>+ New</button>
                </div>
                {clusters.length === 0 ? (
                  <div className="nd-empty" style={{ padding:'24px 8px' }}>
                    <div className="nd-empty-icon">⬡</div>
                    <div className="nd-empty-sub">No clusters yet. Create one or join an existing cluster.</div>
                  </div>
                ) : clusters.map(c => (
                  <div key={c.id} className="db-cluster-card"
                    onClick={e => { e.preventDefault(); setClusterCtxMenu({ visible: true, x: e.clientX, y: e.clientY, cluster: c }); }}
                    onDoubleClick={() => navigate(c.isHost ? `/cluster?id=${c.rawId}` : `/worker-node?id=${c.rawId}`)}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <span className="db-cluster-name">{c.name}</span>
                      <div style={{ display:'flex', gap:5 }}>
                        <span className={`badge ${c.isHost ? 'badge-accent' : 'badge-neutral'}`}>{c.isHost ? 'Host' : 'Worker'}</span>
                        <span className={`badge ${c.status === 'active' ? 'badge-accent' : 'badge-neutral'}`}>{c.status}</span>
                      </div>
                    </div>
                    <div className="db-cluster-id">{c.id}</div>
                  </div>
                ))}
              </>
            )}

            {sidebarTab === 'recordings' && (
              <>
                <div className="db-sidebar-head">
                  <span className="db-sidebar-label">Saved Sessions</span>
                  <div style={{ display:'flex', gap:5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setFolderManagerOpen(true)}>Manage</button>
                    <button className="btn btn-ghost btn-sm" onClick={fetchRecordings}>↺</button>
                  </div>
                </div>
                {recordingsLoading && <div className="nd-empty"><span className="spin">⟳</span></div>}
                {!recordingsLoading && recordings.length === 0 && (
                  <div className="nd-empty" style={{ padding:'24px 8px' }}>
                    <div className="nd-empty-sub">No recordings yet. Use the REC button to capture a session.</div>
                  </div>
                )}
                {recordings.map((rec, idx) => (
                  <button key={rec.filename || idx} className="db-rec-card"
                    onClick={() => rec.filename && openRecording(rec.filename, rec.folder)}
                    onContextMenu={e => rec.filename && (e.preventDefault(), setRecordingCtxMenu({ visible: true, x: e.clientX, y: e.clientY, filename: rec.filename, folder: rec.folder }))}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:600, fontFamily:'var(--font-mono)', color:'var(--accent)' }}>{fmtDate(rec.started_at)}</span>
                      <span style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{rec.size_kb} KB</span>
                    </div>
                    <div style={{ display:'flex', gap:10, fontSize:10, color:'var(--text-mid)', fontFamily:'var(--font-mono)' }}>
                      <span>{fmtDur(rec.duration)}</span>
                      <span>{rec.sample_count} pts</span>
                    </div>
                    {displayFolder(rec.folder) && (
                      <div style={{ marginTop:5, fontSize:9, color:'var(--accent)', fontFamily:'var(--font-mono)', opacity:0.7 }}>
                        {rec.folder}
                      </div>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTEXT MENUS ── */}
      {clusterCtxMenu.visible && (
        <div className="nd-ctx-menu" style={{ left:clusterCtxMenu.x, top:clusterCtxMenu.y }} onClick={e => e.stopPropagation()}>
          <div className="nd-ctx-label">{clusterCtxMenu.cluster?.name}</div>
          <button className="nd-ctx-item" onClick={() => {
            const target = clusterCtxMenu.cluster;
            if (target) navigate(target.isHost ? `/cluster?id=${target.rawId}` : `/worker-node?id=${target.rawId}`);
            setClusterCtxMenu(m => ({ ...m, visible:false }));
          }}>Open Cluster</button>
          <div className="nd-ctx-divider" />
          <button className="nd-ctx-item" onClick={() => setClusterCtxMenu(m => ({ ...m, visible:false }))}>View Details</button>
        </div>
      )}

      {recordingCtxMenu.visible && (
        <div className="nd-ctx-menu" style={{ left:recordingCtxMenu.x, top:recordingCtxMenu.y }} onClick={e => e.stopPropagation()}>
          <div className="nd-ctx-label">Recording</div>
          <button className="nd-ctx-item" onClick={() => { openRecording(recordingCtxMenu.filename, recordingCtxMenu.folder); setRecordingCtxMenu(m => ({ ...m, visible:false })); }}>View Recording</button>
          <button className="nd-ctx-item" onClick={() => { setFolderManagerOpen(true); setRecordingCtxMenu(m => ({ ...m, visible:false })); }}>Manage Folders</button>
          <div className="nd-ctx-divider" />
          <button className="nd-ctx-item danger" onClick={() => { deleteRecording(recordingCtxMenu.filename, recordingCtxMenu.folder); setRecordingCtxMenu(m => ({ ...m, visible:false })); }}>Delete</button>
        </div>
      )}

      {/* ── CREATE CLUSTER MODAL ── */}
      {createModalVisible && (
        <div className="nd-overlay" style={{ display:'flex' }} onClick={() => setCreateModalVisible(false)}>
          <div className="nd-modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <div className="nd-modal-header">
              <div><div className="nd-modal-title">Create Cluster</div><div className="nd-modal-sub">Set up a new NeuralDocker cluster.</div></div>
              <button className="nd-modal-close" onClick={() => setCreateModalVisible(false)}>×</button>
            </div>
            <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label className="label-caps" style={{ display:'block', marginBottom:7 }}>Cluster Type</label>
                <select className="nd-select" style={{ width:'100%' }} value={clusterType} onChange={e => setClusterType(e.target.value)}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <div>
                <label className="label-caps" style={{ display:'block', marginBottom:7 }}>Cluster Name</label>
                <input className="nd-input" type="text" placeholder="e.g. my-local-cluster"
                  value={newClusterName} onChange={e => setNewClusterName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCluster()} />
              </div>
              {clusterType === 'public' && (
                <div>
                  <label className="label-caps" style={{ display:'block', marginBottom:7 }}>Password</label>
                  <input className="nd-input" type="password" placeholder="Set a cluster password"
                    value={newClusterPassword} onChange={e => setNewClusterPassword(e.target.value)} />
                </div>
              )}
            </div>
            <div className="nd-modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setCreateModalVisible(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={createCluster}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORDING VIEWER ── */}
      {viewerOpen && <RecordingViewer recording={viewerData} onClose={() => { setViewerOpen(false); setViewerData(null); }} onDelete={deleteRecording} />}

      {/* ── FOLDER MANAGER ── */}
      {folderManagerOpen && <FolderManagerModal recordings={recordings} onClose={() => setFolderManagerOpen(false)} onDelete={deleteRecording} onMove={moveRecording} onCreateFolder={createFolder} />}
    </div>
  );
};

export default Dashboard;
