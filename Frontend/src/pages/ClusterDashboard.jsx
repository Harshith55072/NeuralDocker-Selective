import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getClusterAPI, getAiAPI, getLocalAPI, clearClusterSession, saveClusterHostUrl, hasFreshClusterHostUrl } from '../config';

// How long we keep quietly auto-retrying the last-known host URL before we
// give up and ask the user to paste a new one. A short blip (host machine
// asleep for a minute, wifi hiccup, ngrok momentarily flaky) recovers on its
// own within this window without ever bothering the user; a real tunnel
// change (host restarted, got a new ngrok URL) won't, and falls through to
// the manual banner once the window closes.
const RECONNECT_GRACE_MS = 5 * 60 * 1000; // 5 minutes
// After this many consecutive failed polls we start showing the (non-blocking)
// "reconnecting…" indicator — short enough to give quick feedback, long enough
// that one dropped request doesn't flash it.
const QUIET_RETRY_THRESHOLD = 3;

const API = getAiAPI();

// Single accent colour for all models — differentiated by opacity/position, not rainbow
const MODEL_COLORS = [
  '#10b981', // emerald — primary
  '#34d399', // emerald light
  '#6ee7b7', // emerald lighter
  '#059669', // emerald dark
  '#a7f3d0', // emerald pale
  '#047857', // emerald deeper
  '#d1fae5', // emerald ghost
  '#065f46', // emerald deepest
];

const colorFromName = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return MODEL_COLORS[Math.abs(hash) % MODEL_COLORS.length];
};

const ClusterDashboard = () => {
  const navigate = useNavigate();
  const accountName    = localStorage.getItem('accountName') || 'User';
  const userEmail      = localStorage.getItem('userEmail')   || 'user@example.com';
  const userId         = localStorage.getItem('userId');
  const avatarInitials = (accountName || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const profileRef = useRef(null);
  const [searchParams] = useSearchParams(); 
  const urlClusterId = searchParams.get('id') ? parseInt(searchParams.get('id')) : null; 
  const [clusterId, setClusterId] = useState(urlClusterId);

  const [models, setModels]   = useState([]);
  const [cluster, setCluster] = useState(null);
  const [systems, setSystems] = useState([]);

  const [modelManagerOpen,  setModelManagerOpen]  = useState(false);
  const [availableModels,   setAvailableModels]   = useState([]);
  const [scanning,          setScanning]          = useState(false);
  const [scanError,         setScanError]         = useState('');
  const [loadingModel,      setLoadingModel]      = useState(null);
  const [unloadingModel,    setUnloadingModel]    = useState(null);
  const [autoAssigning,     setAutoAssigning]     = useState(false);

  const MAX_SCORE = models.length > 0 ? Math.max(...models.map(m => m.score || 0), 1) : 1000;

  const [basePrompt,          setBasePrompt]          = useState('');
  const [tempBasePrompt,      setTempBasePrompt]      = useState('');
  const [discussionEnabled,   setDiscussionEnabled]   = useState(true);
  const [discussionOpen,      setDiscussionOpen]      = useState(false);
  const [drawerOpen,          setDrawerOpen]          = useState(false);
  const [settingsOpen,        setSettingsOpen]        = useState(false);
  const [bpModalOpen,         setBpModalOpen]         = useState(false);
  const [ctxMenu,             setCtxMenu]             = useState({ visible: false, x: 0, y: 0, system: null });
  const [selectedModelId,     setSelectedModelId]     = useState(null);
  const [copied,              setCopied]              = useState(false);
  const [ngrokStatus,         setNgrokStatus]         = useState('unknown');
  const [ngrokUrl,            setNgrokUrl]            = useState('');
  const [inviteOpen,          setInviteOpen]          = useState(false);
  const [inviteCopied,        setInviteCopied]        = useState('');
  const [responses,           setResponses]           = useState([]);
  const [viewMode,            setViewMode]            = useState('stack');
  const [discussions,         setDiscussions]         = useState([]);
  const [messages,            setMessages]            = useState(() => {
    try { const s = sessionStorage.getItem('cluster_messages'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [inputText,           setInputText]           = useState('');
  const [sessionAnswers,      setSessionAnswers]      = useState(0);
  const [sessionLimit,        setSessionLimit]        = useState(10);
  const [autoRotate,          setAutoRotate]          = useState(false);
  const [isTyping,            setIsTyping]            = useState(false);
  const [statusMsg,           setStatusMsg]           = useState('');
  const [profileVisible,      setProfileVisible]      = useState(false);
  const [selectedSystemForModels, setSelectedSystemForModels] = useState(null);
  const [systemPrompt]                                = useState('You are a helpful AI assistant.');
  const [modelNotes,          setModelNotes]          = useState([]);
  const [notesModalOpen,      setNotesModalOpen]      = useState(false);
  const [liveDiscussionPrompt,       setLiveDiscussionPrompt]       = useState('');
  const [discussionPromptModalOpen,  setDiscussionPromptModalOpen]  = useState(false);
  const [tempDiscussionPrompt,       setTempDiscussionPrompt]       = useState('');
  const [clusterDiscussionEnabled,   setClusterDiscussionEnabled]   = useState(false);
  const [sessionEndModal,    setSessionEndModal]    = useState(false);
  const [sessionEndCountdown, setSessionEndCountdown] = useState(5);
  const [pendingPrompt,      setPendingPrompt]      = useState('');
  const [sessionEndResolver, setSessionEndResolver] = useState(null);
  const [isPostProcessing,   setIsPostProcessing]   = useState(false);
  const [clustersNavOpen,    setClustersNavOpen]    = useState(false);
  // ── Session history (built client-side from `messages` — see project.md notes
  // on backend persistence: the backend does NOT store prompt/answer text anywhere,
  // only aggregate per-model win/loss/vote counters. This panel is only as durable
  // as `messages`/sessionStorage — it's gone on Reset Session, a new tab, or another device.
  const [historyOpen,         setHistoryOpen]         = useState(false);
  const [historyExpanded,     setHistoryExpanded]     = useState({});
  const [historyRespExpanded, setHistoryRespExpanded] = useState({});
  // Durable history — fetched from /consensus/history, backed by consensus_log
  // in the DB. Falls back to the client-side `messages` reconstruction below
  // if the fetch fails (offline, host unreachable), so the panel still shows
  // at least this session's data.
  const [durableHistory,      setDurableHistory]      = useState(null); // null = not loaded yet
  const [historyLoading,      setHistoryLoading]      = useState(false);
  const [historyLoadError,    setHistoryLoadError]    = useState('');
  const failCount = useRef(0);
  const firstFailAt = useRef(null);
  const [hostUnreachable, setHostUnreachable] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectUrl, setReconnectUrl] = useState('');

  // Keep clusterId in sync with the URL on every navigation — query-param-only
  // route changes (e.g. /cluster?id=A -> /cluster?id=B) do NOT remount this
  // component, so without this effect, all fetches silently kept using the
  // first cluster ever mounted on this page instance. This was the root cause
  // of the cross-cluster Systems drawer leak (project.md issue #7).
  useEffect(() => {
    if (urlClusterId !== clusterId) {
      setClusterId(urlClusterId);
      // Clear all previous cluster's state immediately so nothing stale renders
      // while the new cluster's data is still in flight
      setModels([]);
      setCluster(null);
      setSystems([]);
      setMessages([]);
      setResponses([]);
      setDiscussions([]);
    }
  }, [urlClusterId]);

  const sessionPct = Math.min((sessionAnswers / sessionLimit) * 100, 100);
  const sessionCls = sessionPct >= 90 ? 'critical' : sessionPct >= 70 ? 'warning' : '';

  const currentUserSystem = useMemo(() => systems.find(s => s.hostname === userEmail), [systems, userEmail]);
  const systemsLoaded = systems.length > 0;

  // Pair each answered bot message with the user prompt that triggered it.
  // `all_responses` (every model's answer + scores) already gets attached to
  // the bot message in handleSendMessage — this just reshapes it for display.
  // This is the client-side/session-only fallback, used only if the durable
  // fetch below hasn't loaded yet or failed.
  const clientHistoryEntries = useMemo(() => {
    const entries = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'bot' && !m.error && Array.isArray(m.all_responses)) {
        let userMsg = null;
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'user') { userMsg = messages[j]; break; }
        }
        entries.push({
          id: m.id,
          prompt: userMsg?.content || '(prompt unavailable)',
          time: m.time || userMsg?.timestamp || '',
          winnerModel: m.model,
          winnerScore: m.avg_score,
          responses: [...m.all_responses].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0)),
        });
      }
    }
    return entries.reverse(); // most recent question first
  }, [messages]);

  // Durable entries — from consensus_log via the backend, survives Reset
  // Session / new tabs / other devices. Preferred source whenever it's loaded.
  const durableHistoryEntries = useMemo(() => {
    if (!durableHistory) return null;
    return durableHistory.map(log => ({
      id: `log-${log.id}`,
      prompt: log.prompt || '(prompt unavailable)',
      time: log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      winnerModel: log.winnerModel,
      winnerScore: (log.allResponses || []).find(r => r.model === log.winnerModel)?.avg_score,
      responses: [...(log.allResponses || [])].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0)),
    }));
  }, [durableHistory]);

  const historyEntries = durableHistoryEntries !== null ? durableHistoryEntries : clientHistoryEntries;

  const fetchConsensusHistory = useCallback(async () => {
    if (!clusterId) return;
    setHistoryLoading(true); setHistoryLoadError('');
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/consensus/history?clusterId=${clusterId}&limit=200`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        let e = {};
        try { e = await res.json(); } catch (_) {}
        throw new Error(e.error || 'Failed to load history.');
      }
      const data = await res.json();
      setDurableHistory(data);
    } catch (e) {
      // Leave durableHistory as-is (null or previous value) so the client-side
      // fallback (this session's `messages`) still renders.
      setHistoryLoadError(e.message || 'Could not reach the server.');
    } finally {
      setHistoryLoading(false);
    }
  }, [clusterId]);

  useEffect(() => { if (historyOpen) fetchConsensusHistory(); }, [historyOpen, fetchConsensusHistory]);

  const toggleHistoryEntry = (id) => setHistoryExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleHistoryAnswer = (key) => setHistoryRespExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const isHost = useMemo(() => {
    if (cluster && userId && parseInt(cluster.hostId) === parseInt(userId)) return true;
    if (currentUserSystem) return currentUserSystem.isHost;
    if (cluster && !systemsLoaded && cluster.hostId) return parseInt(cluster.hostId) === parseInt(userId);
    return false;
  }, [currentUserSystem, cluster, systemsLoaded, userId]);

  // ── Fetch active models ────────────────────────────────────────────────────
  const fetchActiveModels = useCallback(async () => {
    try {
      const cId = clusterId;
      if (!cId) return;
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/proxy/models/active-cluster?clusterId=${cId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) return;
      const dbModels = await res.json();
      let runtimeNames = []; let runtimeHydrated = false;
      try {
        const rtRes = await fetch(`${API}/api/models/active`);
        if (rtRes.ok) {
          const rtData = await rtRes.json();
          runtimeNames = rtData.map(m => m.name);
          runtimeHydrated = true;
          const dbActiveNames = dbModels
            .filter(m => !(m.isEmpty || m.is_empty) && currentUserSystem && m.systemId === currentUserSystem.id)
            .map(m => m.name);
          const hasStaleRecords = dbActiveNames.some(n => !runtimeNames.includes(n));
          if (hasStaleRecords && !loadingModel) {
            // 15s delay prevents racing against a model that just finished loading
            setTimeout(() => {
              fetch(`${getClusterAPI()}/api/v1/clusters/sync-runtime-models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ activeModelNames: runtimeNames })
              }).catch(() => {});
            }, 15000);
          }
        }
      } catch (_) {}
      setModels(prev => {
        return dbModels.map((m) => {
          const isEmpty = m.isEmpty || m.is_empty || false;
          // Show DB models immediately; if runtime hasn't responded yet, keep previous online state
          const prevModel = prev.find(p => p.id === (m.id || m.name) || p.name === m.name);

          // `runtimeNames` only ever reflects THIS machine's local ai-service — it has
          // no visibility into other nodes' runtimes. Only use it to verify models that
          // actually belong to this machine; for models on other systems, trust the DB
          // record (a non-empty slot means it was loaded — that system's own client is
          // responsible for marking it empty via sync-runtime-models if it actually died).
          const isOwnSystem = currentUserSystem && m.systemId === currentUserSystem.id;
          let isActive;
          if (isEmpty) {
            isActive = false;
          } else if (isOwnSystem) {
            isActive =  runtimeHydrated
              ? runtimeNames.includes(m.name)
              : prevModel?.status === 'online'; // keep last known state on first mount
          } else {
            isActive = true;
          }

          return {
            ...m,
            gpuLayers: m.gpuLayers ?? m.gpu_layers ?? 0,
            id: m.id || m.name,
            color: isEmpty ? 'rgba(255,255,255,0.12)' : colorFromName(m.name),
            version: m.name?.match(/\d+[bB]/)?.[0]?.toUpperCase() || '',
            status: isEmpty ? 'empty' : isActive ? 'online' : 'offline',
            displayName: isEmpty ? (m.slotLabel || 'Empty Slot') : m.name,
          };
        });
      });
    } catch (_) {}
  }, [loadingModel, clusterId, currentUserSystem]);

  useEffect(() => { fetchActiveModels(); const id = setInterval(fetchActiveModels, 3000); return () => clearInterval(id); }, [fetchActiveModels]);

  // ── Fetch cluster ──────────────────────────────────────────────────────────
  const fetchClusterInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const cId = clusterId;
      if (!cId) return;
      const clusterUrl = `${getClusterAPI()}/api/v1/clusters/${cId}`;
      const res = await fetch(clusterUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 200) {
        const data = await res.json();
        console.log("Cluster data from backend:", data);
        setCluster(data);
        sessionStorage.setItem('clusterId', data.id);
        // Connection is good — reset the failure streak and refresh this
        // cluster's stored host URL so it doesn't go stale while in active use.
        failCount.current = 0;
        firstFailAt.current = null;
        setHostUnreachable(false);
        setReconnecting(false);
        saveClusterHostUrl(cId, getClusterAPI(cId));
        
        // Don't hard-redirect based on hostId alone — isHost is resolved from
        // the membership table via the systems fetch below. Let the worker banner
        // handle non-host users instead.
        
        setSessionLimit(data.sessionLimit || 10);
        setSessionAnswers(data.sessionAnswers || 0);
        setAutoRotate(data.autoRotate || false);
        setClusterDiscussionEnabled(Boolean(data.enableDiscussion));
        setLiveDiscussionPrompt(data.discussionBasePrompt || '');
        const resolvedId = cId || data.id;
        const sysRes = await fetch(`${getClusterAPI()}/api/v1/clusters/systems?clusterId=${resolvedId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          setSystems(sysData.map(s => ({
            id: s.id, name: s.accountName, hostname: s.email,
            ip: 'Connected', status: s.isOnline ? 'online' : 'offline', isHost: s.isHost,
            cpu: 'N/A', ram: 'N/A', score: s.score,
            wins: s.wins, losses: s.losses, votes: s.votes,
            resourcePermissionGranted: s.resourcePermissionGranted
          })));
        }
      } else if (res.status !== 204) {
        console.warn('Cluster fetch returned', res.status);
        // Don't navigate — could be a transient error. Let the next poll retry.
      }
    } catch (err) {
      console.error(err);
      failCount.current++;
      if (failCount.current === 1) firstFailAt.current = Date.now();

      if (failCount.current >= QUIET_RETRY_THRESHOLD) {
        // Nothing fresh to even auto-retry against (never stored, or the
        // cached URL already expired) — no point stalling, ask right away.
        const cId2 = clusterId;
        const hasFreshUrl = cId2 && hasFreshClusterHostUrl(cId2);
        const graceExpired = firstFailAt.current && (Date.now() - firstFailAt.current > RECONNECT_GRACE_MS);

        if (!hasFreshUrl || graceExpired) {
          setReconnecting(false);
          setHostUnreachable(true);
        } else {
          setReconnecting(true);
        }
      }
    }
  }, [navigate, userId, clusterId]);

  useEffect(() => {
    fetchClusterInfo();
    const id = setInterval(fetchClusterInfo, 15000); // poll every 15s for session counter
    return () => clearInterval(id);
  }, [fetchClusterInfo]);

  const fetchNgrokStatus = useCallback(async (clusterData) => {
    if (!clusterData) return;
    if (clusterData.isPublic && clusterData.hostTunnelUrl) {
      setNgrokStatus('connected');
      setNgrokUrl(clusterData.hostTunnelUrl);
    } else if (!clusterData.isPublic) {
      setNgrokStatus('disconnected'); // private = always local only
      setNgrokUrl('');
    } else {
      // public but no tunnel yet
      setNgrokStatus('disconnected');
      setNgrokUrl('');
    }
  }, []);

  useEffect(() => { fetchNgrokStatus(cluster); const id = setInterval(() => fetchNgrokStatus(cluster), 30000); return () => clearInterval(id); }, [fetchNgrokStatus, cluster]);

  useEffect(() => {
    if (!modelManagerOpen || !selectedSystemForModels || selectedSystemForModels.id === currentUserSystem?.id) return;
    const id = setInterval(async () => {
      try {
        await fetch(`${getClusterAPI()}/api/v1/clusters/proxy/models/active?targetId=${selectedSystemForModels.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      } catch (_) {}
    }, 3000);
    return () => clearInterval(id);
  }, [modelManagerOpen, selectedSystemForModels, currentUserSystem]);

  useEffect(() => { if (modelManagerOpen) scanModels(); }, [modelManagerOpen, selectedSystemForModels]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileVisible(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // ── Scan / Load / Unload models ────────────────────────────────────────────
  const scanModels = async () => {
    setScanning(true); setScanError('');
    try {
      let url = `${API}/api/models/scan`;
      if (selectedSystemForModels && selectedSystemForModels.id !== currentUserSystem?.id)
        url = `${getClusterAPI()}/api/v1/clusters/proxy/models/scan?clusterId=${clusterId}&targetId=${selectedSystemForModels.id}`;
      const res = await fetch(url, { headers: selectedSystemForModels ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {} });
      if (!res.ok) {
        let e = {};
        try { e = await res.json(); } catch (_) {}
        setScanError(e.error || e.detail || e.message || 'Scan failed.');
        return;
      }
      const data = await res.json();
      setAvailableModels(data);
      if (data.length === 0) setScanError('No model files found in the models folder.');
    } catch (e) { setScanError(`Cannot reach system: ${e.message}`); }
    finally { setScanning(false); }
  };

  const autoAssignAndLoad = async (model) => {
    setAutoAssigning(true); setScanError('');
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/best-node?clusterId=${clusterId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'No available nodes'); }
      const best = await res.json();
      setScanError(`⚡ Auto-assigning to ${best.accountName} (${Math.round(best.freeVram)}MB free)…`);
      setSelectedSystemForModels({ id: best.id, name: best.accountName });
      await loadModel(model);
    } catch (e) {
      setScanError(`Auto-assign failed: ${e.message}`);
    } finally {
      setAutoAssigning(false);
    }
  };

  const loadModel = async (model) => {
    setLoadingModel(model.name); setScanError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    try {
      const targetId = selectedSystemForModels?.id || currentUserSystem?.id;
      if (!targetId) throw new Error('No system selected for model loading.');
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/proxy/models/load?clusterId=${clusterId}&targetId=${targetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ path: model.path, name: model.name }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.status === 503) {
        const e = await res.json().catch(() => ({}));
        const raw = e.raw ? JSON.parse(e.raw) : {};
        const retrySeconds = raw.retry_after || 30;
        setScanError(`⏳ Node is busy loading another model. Retrying in ${retrySeconds}s…`);
        setTimeout(() => loadModel(model), retrySeconds * 1000);
        setLoadingModel(null);
        return;
      }
      
      if (!res.ok) {
        let e = {};
        try { e = await res.json(); } catch (_) {}
        // Backend (ClusterController) returns errors as {"error": "..."}, while
        // ai-service (FastAPI, hit directly for local scans) uses {"detail": "..."}.
        // This previously only checked e.message, which neither of those sets, so
        // every load failure silently collapsed to the generic 'Load failed.' text
        // below regardless of the real reason (capacity reached, permission paused,
        // model file not found, communication error, etc).
        throw new Error(e.error || e.message || e.detail || 'Load failed.');
      }
      const result = await res.json();
      const gpuLayers = result?.gpu_layers ?? 0;
      setScanError(`✓ ${model.name} loaded (${gpuLayers > 0 ? gpuLayers + ' GPU layers' : 'CPU mode'})`);
      await fetchActiveModels(); await scanModels();
    } catch (e) {
      clearTimeout(timeoutId);
      setScanError(e.name === 'AbortError' ? 'Load timed out after 5 minutes.' : e.message);
    } finally { setLoadingModel(null); }
  };

  const unloadModel = async (name, systemId) => {
    if (!window.confirm(`Unload "${name}"?`)) return;
    setUnloadingModel(name);
    try {
      const targetId = systemId || selectedSystemForModels?.id || currentUserSystem?.id;
      if (!targetId) throw new Error('No system selected.');
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/proxy/models/unload?clusterId=${clusterId}&targetId=${targetId}&name=${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        let e = {};
        try { e = await res.json(); } catch (_) {}
        throw new Error(e.error || e.message || e.detail || 'Unload failed.');
      }
      await fetchActiveModels();
      setAvailableModels(prev => prev.map(m => m.name === name ? { ...m, loaded: false } : m));
    } catch (e) { console.error('Unload error:', e); setScanError(e.message); }
    finally { setUnloadingModel(null); }
  };

  const fetchModelNotes = async () => {
    try {
      const cId = clusterId;
      if (!cId) return;
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/models/notes?clusterId=${cId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) { setModelNotes(await res.json()); setNotesModalOpen(true); }
    } catch (e) { console.error('Failed to fetch model notes:', e); }
  };

  const saveDiscussionPrompt = async () => {
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/discussion-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ discussionBasePrompt: tempDiscussionPrompt, clusterId })
      });
      if (res.ok) { setLiveDiscussionPrompt(tempDiscussionPrompt); setDiscussionPromptModalOpen(false); }
    } catch (e) { console.error('Failed to save discussion prompt:', e); }
  };

  // ── Session end check and countdown ────────────────────────────────────────
  const checkSessionEnd = (text) => {
    const limit = cluster?.sessionLimit || sessionLimit;
    const progress = sessionAnswers || 0;
    const nextCount = progress + 1;
    const willEnd = limit > 0 && nextCount >= limit;
    const hasPostWork = cluster?.enableDiscussion || cluster?.autoRotate;
    if (willEnd && hasPostWork) {
      return new Promise((resolve) => {
        setPendingPrompt(text);
        setSessionEndCountdown(5);
        setSessionEndModal(true);
        setSessionEndResolver(() => resolve);
      });
    }
    return Promise.resolve(null);
  };

  useEffect(() => {
    if (!sessionEndModal) return;
    if (sessionEndCountdown <= 0) {
      // Auto-proceed after countdown — must actually (re)send the pending
      // prompt, same as the "Continue" button does. Previously this only
      // resolved the checkSessionEnd() promise and closed the modal, which
      // made handleSendMessage's `if (result !== null) return;` guard bail
      // out silently: the resolved value here is `false` (not null), so the
      // message was dropped with no request ever sent and no error shown.
      setSessionEndModal(false);
      if (sessionEndResolver) sessionEndResolver(false); // false = don't skip
      handleSendMessage(false);
      return;
    }
    const t = setTimeout(() => setSessionEndCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [sessionEndModal, sessionEndCountdown, sessionEndResolver]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSendMessage = async (skipPost = null) => {
    if (!inputText.trim() || isTyping || !isHost || isPostProcessing) return;
    const text = inputText;

    // If skipPost is null, we haven't checked yet
    if (skipPost === null) {
      const result = await checkSessionEnd(text);
      if (result !== null) return; // modal is showing, wait for user choice
    }

    const fullPrompt = basePrompt ? `${basePrompt}\n\n${text}` : text;
    const userMsg = { id: Date.now(), role: 'user', content: text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => { const next = [...prev, userMsg]; sessionStorage.setItem('cluster_messages', JSON.stringify(next)); return next; });
    setResponses([]); setInputText(''); setIsTyping(true); setStatusMsg('Models are thinking...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${getClusterAPI()}/api/v1/clusters/consensus/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          prompt: fullPrompt,
          system_prompt: systemPrompt,
          clusterId,
          skipPostSession: skipPost === true
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) { const t = await res.text(); throw new Error(t || 'Consensus failed'); }
      const data = await res.json();
      if (!data.winner) throw new Error('No winner found in consensus response');
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const aiMsg = { id: Date.now() + 1, role: 'bot', content: data.winner.answer, model: data.winner.model, avg_score: data.winner.avg_score, all_responses: data.all_responses, time: now };
      setMessages(prev => { const next = [...prev, aiMsg]; sessionStorage.setItem('cluster_messages', JSON.stringify(next)); return next; });
      setSessionAnswers(data.session_progress);
      setSessionLimit(data.session_limit);
      const sortedResponses = [...data.all_responses].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
      setResponses(sortedResponses.map((r, i) => {
        const m = models.find(mo => mo.name === r.model);
        const isWinner = r.model === data.winner.model;
        return { id: Date.now() + Math.random(), name: r.model, color: m?.color || colorFromName(r.model), score: (r.avg_score || 0).toFixed(1), time: now, preview: r.answer?.slice(0, 80) + (r.answer?.length > 80 ? '…' : ''), body: r.answer, expanded: isWinner, isWinner, votes_count: r.scores?.length || 0, scores: r.scores || [] };
      }));
      if (data.discussion_messages?.length > 0) {
        if (discussionEnabled) setDiscussionOpen(true);
        setDiscussions(data.discussion_messages.map((msg, i) => {
          const m = models.find(mo => mo.name === msg.model);
          return { name: msg.model || 'Unknown', color: m?.color || colorFromName(msg.model), time: now, text: msg.message || '', round: msg.round || 1, updatedNotes: msg.updatedNotes || false };
        }));
      } else {
        setDiscussions(data.all_responses.map((r, i) => {
          const m = models.find(mo => mo.name === r.model);
          return { name: r.model, color: m?.color || colorFromName(r.model), time: now, text: `Consensus reached with an average accuracy of ${r.avg_score?.toFixed(1)}/5.0 based on ${r.scores?.length || 0} votes.` };
        }));
      }
      if (data.session_ended) { 
        await fetchClusterInfo(); 
        await fetchActiveModels(); 
        if (!data.post_session_skipped) {
          setIsPostProcessing(true);
          setStatusMsg('⏳ Post-session processing… Discussion and rotation in progress.');
          if (data.discussion_enabled && cluster?.enableDiscussion) { 
            setDiscussionOpen(true); 
            setDiscussions([]); 
            let seenCount = 0;
            let stableCount = 0;
            const pollId = setInterval(async () => { 
              try { 
                const dRes = await fetch( 
                  `${getClusterAPI()}/api/v1/clusters/discussion/live?clusterId=${clusterId}&since=${seenCount}`, 
                  { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } } 
                ); 
                if (dRes.ok) { 
                  const dData = await dRes.json(); 
                  if (dData.messages?.length > 0) { 
                    seenCount += dData.messages.length; 
                    stableCount = 0;
                    const now = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); 
                    setDiscussions(prev => [ 
                      ...prev, 
                      ...dData.messages.map(msg => { 
                        const m = models.find(mo => mo.name === msg.model); 
                        return { 
                          name: msg.model, 
                          color: m?.color || colorFromName(msg.model), 
                          time: now, 
                          text: msg.message, 
                          round: msg.round, 
                          updatedNotes: msg.updatedNotes 
                        }; 
                      }) 
                    ]); 
                  } else if (seenCount > 0) {
                    stableCount++;
                    if (stableCount >= 3) {
                      clearInterval(pollId);
                      setIsPostProcessing(false);
                      setStatusMsg('✓ New session started');
                      setTimeout(() => setStatusMsg(''), 3000);
                    }
                  }
                } 
              } catch (_) {} 
            }, 3000); 
            setTimeout(() => { 
              clearInterval(pollId); 
              setIsPostProcessing(false);
              setStatusMsg(''); 
            }, 120000); 
          } else {
            setTimeout(() => {
              setIsPostProcessing(false);
              setStatusMsg('');
            }, 3000);
          }
        } else {
          setTimeout(() => setStatusMsg(''), 3000); 
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e.name === 'AbortError' ? 'Request timed out.' : e.message;
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', content: `Error: ${msg}`, error: true }]);
    } finally { setIsTyping(false); }
  };

  const doReconnect = () => {
    localStorage.setItem('clusterBackendUrl', reconnectUrl.trim());
    failCount.current = 0;
    setHostUnreachable(false);
    setReconnectUrl('');
    fetchClusterInfo();
  };

  // ── Misc handlers ──────────────────────────────────────────────────────────
  const handleLeaveCluster = async () => {
    if (!window.confirm('Leave this cluster?')) return;
    try {
      const res = await fetch(`${getLocalAPI()}/api/v1/clusters/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ clusterId })
      });
      if (res.ok) { clearClusterSession(); navigate('/dashboard'); }
      else { const data = await res.json().catch(() => ({})); alert(data.error || 'Failed to leave cluster.'); }
    } catch (e) { alert('Error leaving cluster.'); }
  };

  const copyClusterId = () => {
    if (!cluster) return;
    navigator.clipboard.writeText(`cla_${cluster.id}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const copyInviteField = (field, value) => {
    navigator.clipboard.writeText(value).then(() => { setInviteCopied(field); setTimeout(() => setInviteCopied(''), 2000); });
  };

  const toggleSettings = (e) => { e.stopPropagation(); setSettingsOpen(s => !s); };

  const handleCtxMenu = (e, sys) => { e.preventDefault(); setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, system: sys }); };
  const closeCtxMenu = useCallback(() => setCtxMenu(c => ({ ...c, visible: false })), []);

  const quickSetting = (type) => {
    setSettingsOpen(false);
    if (type === 'session') navigate(`/cluster-settings?id=${clusterId}`);
    else if (type === 'discussion') { setDiscussionEnabled(v => !v); if (discussionEnabled && discussionOpen) setDiscussionOpen(false); }
    else if (type === 'reset') {
      if (window.confirm('Reset the current session? All responses will be cleared.')) {
        fetch(`${getClusterAPI()}/api/v1/clusters/update-settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ sessionAnswers: 0, clusterId }) })
          .then(() => { setSessionAnswers(0); setResponses([]); setDiscussions([]); setMessages([]); });
      }
    }
  };

  const ctxAction = (action) => {
    const sys = ctxMenu.system; closeCtxMenu(); if (!sys) return;
    if (action === 'resources') { sessionStorage.setItem('sel_system', JSON.stringify(sys)); navigate('/system-resources'); }
    else if (action === 'models') { setSelectedSystemForModels(sys); setModelManagerOpen(true); }
    else if (action === 'restart') { if (sys.status === 'offline') alert(`${sys.name} is offline.`); else if (window.confirm(`Restart ${sys.name}?`)) alert(`Restart signal sent to ${sys.name}.`); }
    else if (action === 'disconnect') { if (sys.isHost) alert('Cannot disconnect the host node.'); else if (window.confirm(`Disconnect ${sys.name}?`)) alert(`${sys.name} disconnected.`); }
    else if (action === 'terminate') { if (sys.isHost) alert('Cannot terminate the host node.'); else if (window.confirm(`⚠ Terminate ${sys.name}?`)) alert(`${sys.name} terminated.`); }
  };

  const toggleResponse = (id) => setResponses(rs => rs.map(r => r.id === id ? { ...r, expanded: !r.expanded } : r));

  useEffect(() => {
    const h = () => { setSettingsOpen(false); closeCtxMenu(); setProfileVisible(false); setClustersNavOpen(false); };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [closeCtxMenu]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        /* ── Local overrides only — tokens come from theme.css ── */
        .cd-nav-link { background:none; border:none; font-size:12px; font-weight:500; color:var(--text-mid); cursor:pointer; padding:5px 9px; border-radius:var(--radius-md); transition:color var(--transition),background var(--transition); }
        .cd-nav-link:hover { color:var(--text); background:var(--bg4); }
        .cd-nav-link.active { color:var(--accent); background:var(--accent-dim); }

        /* Cluster bar */
        .cd-bar { display:flex; align-items:center; justify-content:space-between; padding:9px 24px; border-bottom:1px solid var(--border); background:var(--bg2); gap:16px; flex-shrink:0; }
        .cd-bar-left { display:flex; align-items:center; gap:10px; }
        .cd-bar-right { display:flex; align-items:center; gap:14px; }
        .cd-cluster-name { font-size:14px; font-weight:600; }
        .cd-cluster-id { font-family:var(--font-mono); font-size:11px; color:var(--text-dim); }
        .cd-copy-btn { display:flex; align-items:center; gap:4px; background:none; border:1px solid var(--border); color:var(--text-dim); font-family:var(--font-mono); font-size:10px; padding:2px 8px; border-radius:var(--radius-sm); cursor:pointer; transition:all var(--transition); }
        .cd-copy-btn:hover { border-color:var(--border-bright); color:var(--text-mid); }
        .cd-copy-btn.copied { color:var(--accent); border-color:var(--accent-border); }
        .cd-stat { text-align:right; }
        .cd-stat label { display:block; font-size:9px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.08em; margin-bottom:3px; font-family:var(--font-mono); }
        .cd-stat value { font-family:var(--font-mono); font-size:13px; font-weight:500; }
        .cd-session-wrap { display:flex; align-items:center; gap:8px; }
        .cd-session-bar { width:64px; height:3px; background:var(--border); border-radius:2px; overflow:hidden; }
        .cd-session-fill { height:100%; border-radius:2px; background:var(--accent); transition:width .4s ease,background .3s; }
        .cd-session-fill.warning { background:var(--yellow); }
        .cd-session-fill.critical { background:var(--red); }
        .cd-session-count { font-family:var(--font-mono); font-size:12px; color:var(--accent); }
        .cd-session-count.warning { color:var(--yellow); }
        .cd-session-count.critical { color:var(--red); }
        .cd-bar-btn { display:flex; align-items:center; gap:6px; background:none; border:1px solid var(--border-mid); color:var(--text-mid); font-size:12px; font-weight:500; padding:6px 12px; border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition); white-space:nowrap; }
        .cd-bar-btn:hover { border-color:var(--border-bright); color:var(--text); background:var(--bg4); }
        .cd-bar-btn.active { border-color:var(--accent-border); color:var(--accent); background:var(--accent-dim); }

        /* Ngrok */
        .ngrok-pill { display:flex; align-items:center; gap:5px; padding:3px 9px; border-radius:var(--radius-sm); font-size:10px; font-family:var(--font-mono); font-weight:600; letter-spacing:.05em; border:1px solid; cursor:default; }
        .ngrok-pill.connected { background:var(--accent-dim); border-color:var(--accent-border); color:var(--accent); }
        .ngrok-pill.disconnected { background:var(--red-dim); border-color:rgba(239,68,68,0.25); color:var(--red); }
        .ngrok-pill.unknown { background:var(--bg4); border-color:var(--border); color:var(--text-dim); }

        .cd-reconnect-banner { padding:8px 24px; background:var(--red-dim); border-bottom:1px solid rgba(239,68,68,.25); display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .cd-reconnect-input { flex:1; max-width:380px; background:var(--bg3); border:1px solid var(--border-mid); border-radius:var(--radius-md); padding:6px 10px; color:var(--text); font-family:var(--font-mono); font-size:11px; outline:none; }

        /* Settings dropdown */
        .cd-settings-wrap { position:relative; }
        .cd-settings-dd { position:absolute; right:0; top:calc(100% + 8px); width:210px; background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-md); display:none; z-index:60; }
        .cd-settings-dd.open { display:block; }
        .cd-dd-label { padding:8px 14px 6px; font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-dim); font-family:var(--font-mono); border-bottom:1px solid var(--border); }
        .cd-dd-item { display:flex; align-items:center; gap:9px; padding:9px 14px; font-size:12px; color:var(--text-mid); cursor:pointer; transition:background var(--transition); border:none; background:none; width:100%; text-align:left; }
        .cd-dd-item:hover { background:var(--bg4); color:var(--text); }
        .cd-dd-item.danger { color:rgba(239,68,68,.7); }
        .cd-dd-item.danger:hover { color:var(--red); background:var(--red-dim); }

        /* Main layout */
        .cd-main { display:grid; grid-template-columns:300px 1fr; flex:1; overflow:hidden; min-height:0; }

        /* Model panel */
        .cd-model-panel { border-right:1px solid var(--border); display:flex; flex-direction:column; overflow:hidden; min-height:0; }
        .cd-panel-header { padding:11px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; gap:8px; }
        .cd-panel-title { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-dim); font-family:var(--font-mono); }
        .cd-model-list { overflow-y:auto; flex:1; min-height:0; }

        /* Model card */
        .cd-model-card { padding:13px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background var(--transition); position:relative; }
        .cd-model-card:hover { background:var(--bg3); }
        .cd-model-card.selected { background:var(--bg3); }
        .cd-model-card.selected::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--accent); }
        .cd-model-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
        .cd-model-left { display:flex; align-items:center; gap:9px; flex:1; min-width:0; }
        .cd-model-rank { font-family:var(--font-mono); font-size:10px; color:var(--text-dim); width:14px; flex-shrink:0; text-align:right; }
        .cd-rank-1 { color:var(--accent) !important; }
        .cd-rank-2 { color:var(--text-mid) !important; }
        .cd-model-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .cd-model-name { font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cd-model-sub { font-size:10px; color:var(--text-dim); font-family:var(--font-mono); margin-top:1px; }
        .cd-model-score { font-family:var(--font-mono); font-size:15px; font-weight:600; flex-shrink:0; }
        .cd-model-mini { display:flex; gap:10px; margin-top:5px; }
        .cd-model-mini span { font-family:var(--font-mono); font-size:10px; color:var(--text-dim); }
        .cd-unload-btn { opacity:0; background:none; border:1px solid rgba(239,68,68,.2); color:rgba(239,68,68,.6); font-size:9px; font-family:var(--font-mono); padding:2px 6px; border-radius:var(--radius-sm); cursor:pointer; transition:all var(--transition); flex-shrink:0; }
        .cd-model-card:hover .cd-unload-btn { opacity:1; }
        .cd-unload-btn:hover { background:var(--red-dim); color:var(--red); border-color:rgba(239,68,68,.4); }

        /* Arena */
        .cd-arena-wrap { display:grid; grid-template-columns:1fr; flex:1; overflow:hidden; transition:grid-template-columns .22s ease; min-height:0; }
        .cd-arena-wrap.disc-open { grid-template-columns:1fr 280px; }
        .cd-arena { display:flex; flex-direction:column; overflow:hidden; min-height:0; }
        .cd-prompt-bar { padding:11px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; background:var(--bg2); flex-shrink:0; }
        .cd-bp-btn { width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:none; border:1px solid var(--border-mid); border-radius:var(--radius-md); cursor:pointer; color:var(--text-dim); transition:all var(--transition); position:relative; }
        .cd-bp-btn .dot { position:absolute; top:5px; right:5px; width:4px; height:4px; border-radius:50%; background:var(--accent); display:none; }
        .cd-bp-btn.has-prompt .dot { display:block; }
        .cd-bp-btn.has-prompt { border-color:var(--accent-border); color:var(--accent); background:var(--accent-dim); }
        .cd-prompt-input { flex:1; background:var(--bg3); border:1px solid var(--border-mid); border-radius:var(--radius-md); padding:9px 14px; color:var(--text); font-family:var(--font-sans); font-size:13px; outline:none; transition:border-color var(--transition); }
        .cd-prompt-input:focus { border-color:var(--accent-border); }
        .cd-prompt-input::placeholder { color:var(--text-dim); }
        .cd-send-btn { padding:9px 18px; border-radius:var(--radius-md); background:var(--text); color:#000; border:none; cursor:pointer; font-size:13px; font-weight:600; white-space:nowrap; transition:opacity var(--transition); display:flex; align-items:center; gap:7px; }
        .cd-send-btn:hover { opacity:.85; }
        .cd-send-btn:disabled { opacity:.35; cursor:not-allowed; }
        .cd-bp-strip { display:none; align-items:center; gap:8px; padding:5px 20px; background:var(--accent-dim); border-bottom:1px solid var(--accent-border); flex-shrink:0; }
        .cd-bp-strip.visible { display:flex; }
        .cd-toolbar { padding:9px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .cd-toolbar-label { font-size:10px; color:var(--text-dim); font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.1em; }
        .cd-view-toggle { display:flex; gap:3px; }
        .cd-view-btn { padding:4px 10px; border-radius:var(--radius-sm); font-size:11px; border:1px solid var(--border); background:transparent; color:var(--text-dim); cursor:pointer; font-family:var(--font-mono); transition:all var(--transition); }
        .cd-view-btn.active { background:var(--bg4); border-color:var(--border-bright); color:var(--text); }
        /* min-height:0 is required here — without it, a flex child with flex:1 refuses to
           shrink below its content size, so long answers just get clipped by the parent's
           overflow:hidden instead of scrolling internally. This was the actual cause of
           "page can't scroll" on long model answers. */
        .cd-arena-body { flex:1; min-height:0; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:10px; }

        /* Response cards */
        .cd-rcard { border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg2); overflow:hidden; transition:border-color var(--transition); animation:slideInUp .18s ease forwards; }
        .cd-rcard.winner { border-color:var(--accent-border); }
        .cd-rcard:hover { border-color:var(--border-bright); }
        .cd-rcard-head { padding:11px 14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; border-bottom:1px solid transparent; transition:border-color var(--transition); }
        .cd-rcard.expanded .cd-rcard-head { border-bottom-color:var(--border); }
        .cd-rcard-left { display:flex; align-items:center; gap:9px; }
        .cd-rcard-name { font-size:13px; font-weight:500; }
        .cd-rcard-score { font-family:var(--font-mono); font-size:11px; color:var(--text-dim); }
        .winner-tag { font-size:9px; background:var(--accent-dim); color:var(--accent); border:1px solid var(--accent-border); padding:2px 7px; border-radius:var(--radius-sm); font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.06em; }
        .cd-rcard-right { display:flex; align-items:center; gap:12px; }
        .cd-expand-icon { width:14px; height:14px; color:var(--text-dim); transition:transform .2s; flex-shrink:0; }
        .cd-rcard.expanded .cd-expand-icon { transform:rotate(180deg); }
        .cd-rcard-preview { padding:8px 14px; font-size:12px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-style:italic; }
        .cd-rcard.expanded .cd-rcard-preview { display:none; }
        .cd-rcard-body { padding:14px; font-size:13px; line-height:1.7; color:var(--text-mid); display:none; }
        .cd-rcard.expanded .cd-rcard-body { display:block; }
        /* Long answers flow naturally in the single outer scroll (.cd-arena-body) instead of
           being trapped in their own small nested scrollbox — that nested-scroll trap was the
           cause of "can't scroll / looks odd" on long model answers. */
        .cd-vote-chip { width:18px; height:18px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; border:1px solid; }

        /* Discussion panel */
        .cd-disc { display:flex; flex-direction:column; overflow:hidden; border-left:1px solid var(--border); min-height:0; }
        .cd-disc-header { padding:12px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; background:var(--bg2); }
        .cd-disc-title { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--text-dim); font-family:var(--font-mono); }
        .cd-disc-body { flex:1; min-height:0; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
        .cd-disc-msg { display:flex; gap:9px; }
        .cd-disc-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; margin-top:5px; }
        .cd-disc-name { font-size:11px; font-weight:600; }
        .cd-disc-time { font-size:10px; color:var(--text-dim); font-family:var(--font-mono); }
        .cd-disc-text { font-size:12px; color:var(--text-mid); line-height:1.6; margin-top:3px; }
        .cd-disc-round { display:flex; align-items:center; gap:8px; padding:4px 0; }
        .cd-disc-round span { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-dim); font-family:var(--font-mono); white-space:nowrap; }
        .cd-disc-round::before,.cd-disc-round::after { content:''; flex:1; height:1px; background:var(--border); }

        /* Systems drawer */
        .cd-scrim { position:fixed; inset:0; z-index:40; background:rgba(0,0,0,0); pointer-events:none; transition:background .25s ease; }
        .cd-scrim.open { background:rgba(0,0,0,.55); pointer-events:all; }
        .cd-drawer { position:fixed; top:0; right:0; bottom:0; z-index:50; width:380px; max-width:100vw; background:var(--bg2); border-left:1px solid var(--border-bright); box-shadow:var(--shadow-xl); display:flex; flex-direction:column; transform:translateX(100%); transition:transform .25s cubic-bezier(.4,0,.2,1); }
        .cd-drawer.open { transform:translateX(0); }
        .cd-drawer-head { padding:16px 18px 13px; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content:space-between; gap:12px; background:var(--bg3); flex-shrink:0; }
        .cd-drawer-sum { display:grid; grid-template-columns:repeat(4,1fr); border-bottom:1px solid var(--border); flex-shrink:0; }
        .cd-drawer-sum-item { padding:10px 13px; border-right:1px solid var(--border); }
        .cd-drawer-sum-item label { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.09em; color:var(--text-dim); font-family:var(--font-mono); margin-bottom:3px; }
        .cd-drawer-sum-item value { font-family:var(--font-mono); font-size:15px; font-weight:600; }
        .cd-drawer-body { flex:1; min-height:0; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:9px; }
        .cd-snode { background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; transition:border-color var(--transition); cursor:pointer; }
        .cd-snode:hover { border-color:var(--border-bright); }
        .cd-snode.host { border-color:var(--accent-border); }
        .cd-snode-top { padding:11px 13px; display:flex; align-items:center; justify-content:space-between; gap:9px; border-bottom:1px solid var(--border); }
        .cd-snode-foot { padding:6px 13px; font-size:10px; color:var(--text-dim); font-family:var(--font-mono); display:flex; align-items:center; justify-content:space-between; }
        .cd-drawer-foot { padding:10px 14px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; background:var(--bg3); }

        /* Worker banner */
        .cd-worker-banner { padding:7px 24px; background:rgba(245,158,11,.05); border-bottom:1px solid rgba(245,158,11,.14); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }

        /* Modals */
        .cd-overlay { position:fixed; inset:0; z-index:200; background:rgba(0,0,0,.8); backdrop-filter:blur(8px); display:none; align-items:center; justify-content:center; }
        .cd-overlay.open { display:flex; }
        .cd-modal { background:var(--bg2); border:1px solid var(--border-bright); border-radius:var(--radius-xl); width:600px; max-width:calc(100vw - 32px); max-height:85vh; display:flex; flex-direction:column; box-shadow:var(--shadow-xl); overflow:hidden; }
        .cd-modal-sm { width:520px; }
        .cd-modal-head { padding:17px 22px 14px; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-shrink:0; }
        .cd-modal-title { font-size:14px; font-weight:600; margin-bottom:3px; }
        .cd-modal-sub { font-size:11px; color:var(--text-mid); line-height:1.5; }
        .cd-modal-body { flex:1; min-height:0; overflow-y:auto; }
        .cd-modal-foot { padding:11px 22px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; background:var(--bg3); flex-shrink:0; }
        .cd-mm-row { display:flex; align-items:center; gap:13px; padding:12px 22px; border-bottom:1px solid var(--border); transition:background var(--transition); }
        .cd-mm-row:hover { background:var(--bg3); }
        .cd-mm-icon { width:30px; height:30px; border-radius:var(--radius-md); background:var(--bg4); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .cd-mm-name { font-size:13px; font-weight:500; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cd-mm-meta { display:flex; gap:8px; }
        .cd-mm-meta span { font-family:var(--font-mono); font-size:10px; color:var(--text-dim); }
        .cd-loaded-badge { font-family:var(--font-mono); font-size:9px; color:var(--accent); background:var(--accent-dim); border:1px solid var(--accent-border); padding:2px 7px; border-radius:var(--radius-sm); text-transform:uppercase; letter-spacing:.06em; }

        /* Invite fields */
        .cd-invite-field { display:flex; gap:8px; align-items:center; background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-md); padding:9px 12px; }
        .cd-invite-val { flex:1; font-family:var(--font-mono); font-size:11px; color:var(--text-mid); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Session history modal */
        .cd-modal-history { width:760px; }
        .cd-hist-entry { border-bottom:1px solid var(--border); }
        .cd-hist-q { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 22px; cursor:pointer; transition:background var(--transition); }
        .cd-hist-q:hover { background:var(--bg3); }
        .cd-hist-q-left { display:flex; align-items:center; gap:11px; min-width:0; flex:1; }
        .cd-hist-q-idx { font-family:var(--font-mono); font-size:10px; color:var(--accent); background:var(--accent-dim); border:1px solid var(--accent-border); padding:2px 7px; border-radius:var(--radius-sm); flex-shrink:0; }
        .cd-hist-q-text { font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cd-hist-q-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .cd-hist-q-time { font-family:var(--font-mono); font-size:10px; color:var(--text-dim); }
        .cd-hist-answers { padding:0 22px 14px; display:flex; flex-direction:column; gap:7px; }
        .cd-hist-ans { border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg2); overflow:hidden; }
        .cd-hist-ans.winner { border-color:var(--accent-border); }
        .cd-hist-ans-head { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; cursor:pointer; transition:background var(--transition); }
        .cd-hist-ans-head:hover { background:var(--bg3); }
        .cd-hist-ans-body { padding:0 12px 12px; font-size:12px; line-height:1.65; color:var(--text-mid); border-top:1px solid var(--border); padding-top:10px; margin-top:-2px; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:'var(--nav-height)', borderBottom:'1px solid var(--border)', background:'var(--bg)', flexShrink:0, zIndex:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:24 }}>
          <div className="nd-logo" style={{ cursor:'pointer' }} onClick={() => navigate('/dashboard')}>
            <div className="nd-logo-mark"><span/><span/><span/><span/></div>
            <div className="nd-logo-text">
              <span className="nd-logo-sub">NeuralDocker</span>
              <span className="nd-logo-name">Selective</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:2, alignItems:'center' }}>
            <button className="cd-nav-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button className="cd-nav-link active">Cluster</button>
            <button className="cd-nav-link" onClick={() => navigate('/cookbook')}>Cookbook</button>
            {/* Clusters dropdown — Create + Join */}
            <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
              <button className="cd-nav-link" onClick={() => setClustersNavOpen(v => !v)}>
                Clusters
                <svg viewBox="0 0 10 6" fill="none" style={{ width:8, height:8, marginLeft:4, verticalAlign:'middle' }}>
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {clustersNavOpen && (
                <div style={{ 
                  position:'absolute', top:'calc(100% + 6px)', left:0, 
                  background:'var(--bg3)', border:'1px solid var(--border-bright)', 
                  borderRadius:'var(--radius-lg)', overflow:'hidden', 
                  boxShadow:'var(--shadow-md)', zIndex:60, minWidth:140, 
                }}>
                  <button className="cd-dd-item" onClick={() => { setClustersNavOpen(false); navigate('/create-cluster'); }}>Create Cluster</button>
                  <button className="cd-dd-item" onClick={() => { setClustersNavOpen(false); navigate('/join-cluster'); }}>Join Cluster</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div ref={profileRef} style={{ display:'flex', alignItems:'center', gap:10, position:'relative' }} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:500 }}>{accountName}</div>
            <div style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{userEmail}</div>
          </div>
          <div className="nd-avatar" onClick={() => setProfileVisible(v => !v)}>{avatarInitials}</div>
          {profileVisible && (
            <div className="nd-profile-dropdown animate-in">
              <button onClick={() => navigate('/dashboard')}>Dashboard</button>
              <button onClick={() => navigate(`/cluster-settings?id=${clusterId}`)}>Cluster Settings</button>
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

      {/* ── CLUSTER BAR ── */}
      <div className="cd-bar">
        <div className="cd-bar-left">
          {cluster && <span className="badge badge-accent">{cluster.isPublic ? 'Public' : 'Private'}</span>}
          <span className="cd-cluster-name">{cluster ? cluster.name : 'No Cluster'}</span>
          <span className="cd-cluster-id">{cluster ? `cla_${cluster.id}` : '—'}</span>
          {cluster && (
            <button className={`cd-copy-btn ${copied ? 'copied' : ''}`} onClick={copyClusterId}>
              {copied ? '✓ Copied' : 'Copy ID'}
            </button>
          )}
          {isHost && cluster?.isPublic && (
            <button className="btn btn-accent-ghost btn-sm" onClick={() => setInviteOpen(true)}>Invite</button>
          )}
          <div className={`ngrok-pill ${ngrokStatus}`} title={ngrokStatus === 'connected' ? `Tunnel: ${ngrokUrl}` : 'No active tunnel'}>
            <div className="status-dot" style={{ width:5, height:5, background: ngrokStatus === 'connected' ? 'var(--accent)' : ngrokStatus === 'disconnected' ? 'var(--red)' : 'var(--text-dim)', boxShadow: ngrokStatus === 'connected' ? '0 0 5px var(--accent)' : 'none' }} />
            {ngrokStatus === 'connected' ? 'Tunneled' : ngrokStatus === 'disconnected' ? 'Local Only' : '…'}
          </div>
        </div>

        <div className="cd-bar-right">
          <div className="cd-stat"><label>Nodes</label><value style={{ color:'var(--accent)' }}>{systems.length}</value></div>
          <div className="cd-stat"><label>Models</label><value style={{ color:'var(--accent)' }}>{models.filter(m => m.status === 'online').length}</value></div>
          <div className="cd-stat">
            <label>Session</label>
            <div className="cd-session-wrap">
              <div className="cd-session-bar"><div className={`cd-session-fill ${sessionCls}`} style={{ width:`${sessionPct}%` }}/></div>
              <span className={`cd-session-count ${sessionCls}`}>{sessionAnswers}/{sessionLimit}</span>
            </div>
          </div>
          <button className={`cd-bar-btn ${drawerOpen ? 'active' : ''}`} onClick={() => setDrawerOpen(true)}>
            <svg viewBox="0 0 14 14" fill="none" style={{ width:13, height:13 }}><rect x="1" y="2" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="8" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>
            Systems
          </button>
          <button className={`cd-bar-btn ${historyOpen ? 'active' : ''}`} onClick={() => setHistoryOpen(true)}>
            <svg viewBox="0 0 14 14" fill="none" style={{ width:13, height:13 }}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3l2.2 1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            History{historyEntries.length > 0 ? ` (${historyEntries.length})` : ''}
          </button>
          <div className="cd-settings-wrap">
            <button className="cd-bar-btn" onClick={toggleSettings}>
              <svg viewBox="0 0 14 14" fill="none" style={{ width:13, height:13 }}><circle cx="7" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.3"/><path d="M7 1.5v1.2M7 11.3v1.2M1.5 7h1.2M11.3 7h1.2M3.3 3.3l.85.85M9.85 9.85l.85.85M3.3 10.7l.85-.85M9.85 4.15l.85-.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Settings
            </button>
            <div className={`cd-settings-dd ${settingsOpen ? 'open' : ''}`} onClick={e => e.stopPropagation()}>
              <div className="cd-dd-label">Cluster</div>
              <button className="cd-dd-item" onClick={() => quickSetting('session')}>All Settings</button>
              {isHost && <button className="cd-dd-item" onClick={() => navigate(`/api-hosting?id=${clusterId}`)}>API Hosting</button>}
              {isHost && <button className="cd-dd-item" onClick={() => navigate(`/pipeline?id=${clusterId}`)}>Batch Pipeline</button>}
              <button className="cd-dd-item" onClick={() => quickSetting('discussion')}>{discussionEnabled ? 'Disable' : 'Enable'} Discussion</button>
              <div className="nd-divider" />
              <button className="cd-dd-item danger" onClick={() => quickSetting('reset')}>Reset Session</button>
            </div>
          </div>
        </div>
      </div>

      {/* Worker notice */}
      {!isHost && systemsLoaded && (
        <div className="cd-worker-banner">
          <span style={{ fontSize:12, color:'rgba(245,158,11,.8)', display:'flex', alignItems:'center', gap:7 }}>
            <svg viewBox="0 0 14 14" fill="none" style={{ width:13, height:13, flexShrink:0 }}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 6v3.5M7 4.5v.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            You are a <strong style={{ color:'var(--yellow)', margin:'0 3px' }}>worker node.</strong> Only the host can send prompts.
          </span>
          <button className="btn btn-danger btn-sm" onClick={handleLeaveCluster}>Leave</button>
        </div>
      )}

      {hostUnreachable && (
        <div className="cd-reconnect-banner">
          <span style={{ fontSize:12, color:'var(--red)', display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
            <svg viewBox="0 0 14 14" fill="none" style={{ width:13, height:13, flexShrink:0 }}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 6v3.5M7 4.5v.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Host unreachable — the invite URL may have changed.
          </span>
          <input
            className="cd-reconnect-input"
            placeholder="Paste new host URL…"
            value={reconnectUrl}
            onChange={e => setReconnectUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && reconnectUrl.trim() && doReconnect()}
          />
          <button className="btn btn-accent-ghost btn-sm" disabled={!reconnectUrl.trim()} onClick={doReconnect}>
            Reconnect
          </button>
        </div>
      )}

      {/* ── MAIN ── */}
      <div className="cd-main" style={{ flex:1, overflow:'hidden' }}>

        {/* Model panel */}
        <div className="cd-model-panel">
          <div className="cd-panel-header">
            <span className="cd-panel-title">Active Models</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-dim)' }}>{models.filter(m => m.status === 'online').length} online</span>
              {isHost && (
                <button className="btn btn-accent-ghost btn-sm" onClick={() => { setAvailableModels([]); setScanError(''); setSelectedSystemForModels(null); setModelManagerOpen(true); }}>
                  Manage
                </button>
              )}
            </div>
          </div>

          <div className="cd-model-list">
            {models.length === 0 ? (
              <div className="nd-empty" style={{ padding:'28px 16px' }}>
                <div className="nd-empty-icon">⬡</div>
                <div className="nd-empty-sub">No models loaded.{isHost && ' Click Manage to load one.'}</div>
              </div>
            ) : (
              [...models].sort((a, b) => (b.score || 0) - (a.score || 0)).map((m, idx) => (
                <div key={m.id} className={`cd-model-card ${selectedModelId === m.id ? 'selected' : ''}`} onClick={() => setSelectedModelId(m.id)}>
                  <div className="cd-model-top">
                    <div className="cd-model-left">
                      <span className={`cd-model-rank ${idx === 0 ? 'cd-rank-1' : idx === 1 ? 'cd-rank-2' : ''}`}>{idx + 1}</span>
                      <div className="cd-model-dot" style={{ background: m.color, boxShadow: m.status === 'online' ? `0 0 5px ${m.color}66` : 'none' }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div className="cd-model-name" style={{ color: m.status === 'empty' ? 'var(--text-dim)' : 'var(--text)', fontStyle: m.status === 'empty' ? 'italic' : 'normal' }}>
                          {m.displayName || m.name}
                        </div>
                        <div className="cd-model-sub" style={{ color: m.status === 'offline' ? 'var(--red)' : 'var(--text-dim)' }}>
                          {m.status === 'empty' ? 'empty slot · score preserved' : m.status === 'offline' ? 'offline · not responding' : m.gpuLayers > 0 ? `${m.gpuLayers} GPU layers` : 'CPU only'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <span className="cd-model-score" style={{ color: m.status === 'empty' ? 'var(--text-dim)' : m.color, opacity: m.status === 'empty' ? 0.4 : 1 }}>
                        {Math.round(m.score || 0)}
                      </span>
                      {isHost && m.status !== 'empty' && (
                        <button className="cd-unload-btn" onClick={e => { e.stopPropagation(); unloadModel(m.name, m.systemId); }} disabled={unloadingModel === m.name}>
                          {unloadingModel === m.name ? '…' : 'unload'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="nd-score-bar">
                    <div className="nd-score-bar-fill" style={{ 
                      width: m.status === 'empty' ? '4%' : `${Math.max(4, ((m.score || 0) / MAX_SCORE) * 100)}%`, 
                      background: m.status === 'empty' ? 'var(--border)' : m.status === 'offline' ? 'var(--red)' : m.color 
                    }} />
                  </div>
                  <div className="cd-model-mini">
                    <span style={{ color:'var(--accent)' }}>{m.wins || 0}W</span>
                    <span style={{ color:'var(--red)' }}>{m.losses || 0}L</span>
                    <span>{m.votes || 0} votes</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Arena */}
        <div className={`cd-arena-wrap ${discussionOpen ? 'disc-open' : ''}`}>
          <div className="cd-arena">

            {/* Prompt bar */}
            <div className="cd-prompt-bar">
              <button className={`cd-bp-btn ${basePrompt ? 'has-prompt' : ''}`} onClick={() => { setTempBasePrompt(basePrompt); setBpModalOpen(true); }} title="Set base prompt">
                <svg viewBox="0 0 14 14" fill="none" style={{ width:12, height:12 }}><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                <span className="dot"/>
              </button>
              <input
                className="cd-prompt-input"
                type="text"
                placeholder={!isHost ? 'Only the host can send prompts…' : models.filter(m => m.status==='online').length === 0 ? 'Load models first…' : 'Send a prompt to all models…'}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isTyping && isHost && !isPostProcessing && handleSendMessage()}
                disabled={isTyping || !isHost || isPostProcessing}
              />
              <button className="cd-send-btn" onClick={handleSendMessage} disabled={isTyping || !inputText.trim() || !isHost || isPostProcessing}>
                {isTyping
                  ? <><span className="spin">⟳</span> Thinking…</>
                  : <><svg viewBox="0 0 14 14" fill="none" style={{ width:13, height:13 }}><path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Send</>}
              </button>
            </div>

            {basePrompt && (
              <div className="cd-bp-strip visible">
                <div className="status-dot online" style={{ width:5, height:5 }} />
                <span style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--accent)', fontFamily:'var(--font-mono)', flexShrink:0 }}>Base Prompt</span>
                <span style={{ fontSize:11, color:'var(--text-mid)', fontFamily:'var(--font-mono)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{basePrompt}</span>
                <button onClick={() => { setTempBasePrompt(basePrompt); setBpModalOpen(true); }} style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:10, fontFamily:'var(--font-mono)' }}>edit</button>
                <button onClick={() => setBasePrompt('')} style={{ background:'none', border:'none', color:'var(--red)', cursor:'pointer', fontSize:10, fontFamily:'var(--font-mono)' }}>clear</button>
              </div>
            )}

            <div className="cd-toolbar">
              <span className="cd-toolbar-label">
                {isTyping ? 'Models thinking…' : responses.length > 0 ? `${responses.length} responses` : 'Waiting for prompt'}
              </span>
              <div className="cd-view-toggle">
                <button className={`cd-view-btn ${viewMode === 'stack' ? 'active' : ''}`} onClick={() => setViewMode('stack')}>Stack</button>
                <button
                  className={`cd-view-btn ${discussionOpen ? 'active' : ''}`}
                  onClick={() => discussionEnabled && setDiscussionOpen(v => !v)}
                  style={{ opacity: discussionEnabled ? 1 : .4, cursor: discussionEnabled ? 'pointer' : 'not-allowed' }}
                >
                  {clusterDiscussionEnabled ? `Discussion${discussions.length > 0 ? ` (${discussions.length})` : ''}` : 'Discussion (off)'}
                </button>
              </div>
            </div>

            <div className="cd-arena-body">
              {isTyping && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0' }}>
                  <div className="nd-typing">
                    <div className="nd-typing-dot"/><div className="nd-typing-dot"/><div className="nd-typing-dot"/>
                  </div>
                  <span style={{ fontSize:12, color:'var(--text-dim)' }}>{statusMsg || 'Models are generating answers…'}</span>
                </div>
              )}
              {!isTyping && statusMsg && (
                <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12, color:'var(--accent)', fontFamily:'var(--font-mono)' }}>
                  <div className="status-dot online" style={{ width:5, height:5 }} />{statusMsg}
                </div>
              )}
              {!isTyping && responses.length === 0 && (
                <div className="nd-empty" style={{ flex:1 }}>
                  <div className="nd-empty-icon">⬡</div>
                  <div className="nd-empty-title">No responses yet</div>
                  <div className="nd-empty-sub">{models.filter(m=>m.status==='online').length === 0 ? 'Load at least one model, then send a prompt.' : 'Type a prompt and send it to all models.'}</div>
                </div>
              )}

              {responses.map(r => (
                <div key={r.id} className={`cd-rcard ${r.expanded ? 'expanded' : ''} ${r.isWinner ? 'winner' : ''}`}>
                  <div className="cd-rcard-head" onClick={() => toggleResponse(r.id)}>
                    <div className="cd-rcard-left">
                      <div className="cd-model-dot" style={{ background:r.color, boxShadow:`0 0 5px ${r.color}44` }} />
                      <span className="cd-rcard-name">{r.name}</span>
                      <span className="cd-rcard-score">{r.score}/5 · {r.votes_count} votes</span>
                      {r.isWinner && <span className="winner-tag">✦ Best</span>}
                    </div>
                    <div className="cd-rcard-right">
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-dim)' }}>{r.time}</span>
                      <svg className="cd-expand-icon" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </div>
                  <div className="cd-rcard-preview">{r.preview}</div>
                  <div className="cd-rcard-body">
                    <div style={{ marginBottom:12, whiteSpace:'pre-wrap' }}>{r.body}</div>
                    <div style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
                      <div className="label-caps" style={{ marginBottom:6 }}>Consensus Votes</div>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {r.scores.map((s, i) => (
                          <div key={i} className="cd-vote-chip" style={{
                            background: s >= 4 ? 'var(--accent-dim)' : s <= 2 ? 'var(--red-dim)' : 'var(--bg4)',
                            color: s >= 4 ? 'var(--accent)' : s <= 2 ? 'var(--red)' : 'var(--text-mid)',
                            borderColor: s >= 4 ? 'var(--accent-border)' : s <= 2 ? 'rgba(239,68,68,.25)' : 'var(--border)',
                          }} title={`Model ${i+1} vote`}>{s}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discussion panel */}
          <div className="cd-disc" style={{ display: discussionOpen ? 'flex' : 'none' }}>
            <div className="cd-disc-header">
              <span className="cd-disc-title">Discussion</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {isHost && clusterDiscussionEnabled && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setTempDiscussionPrompt(liveDiscussionPrompt); setDiscussionPromptModalOpen(true); }}>prompt</button>
                    <button className="btn btn-ghost btn-sm" onClick={fetchModelNotes}>notes</button>
                  </>
                )}
                <button style={{ background:'none', border:'none', color:'var(--text-dim)', cursor:'pointer', fontSize:16, lineHeight:1, padding:'2px 4px' }} onClick={() => setDiscussionOpen(false)}>×</button>
              </div>
            </div>
            <div className="cd-disc-body">
              {discussions.length === 0 ? (
                <div className="nd-empty">
                  <div style={{ fontSize:24, opacity:.3 }}>💬</div>
                  <div style={{ fontSize:12, color:'var(--text-dim)' }}>Send a prompt to start</div>
                </div>
              ) : discussions.map((msg, idx) => {
                const prevMsg = discussions[idx - 1];
                const showRound = msg.round && (!prevMsg || prevMsg.round !== msg.round);
                return (
                  <React.Fragment key={idx}>
                    {showRound && <div className="cd-disc-round"><span>Round {msg.round}</span></div>}
                    <div className="cd-disc-msg">
                      <div className="cd-disc-dot" style={{ background: msg.color }} />
                      <div>
                        <div style={{ display:'flex', alignItems:'baseline', gap:7 }}>
                          <span className="cd-disc-name" style={{ color: msg.color }}>{msg.name}</span>
                          <span className="cd-disc-time">{msg.time}</span>
                          {msg.updatedNotes && <span style={{ fontSize:9, color:'var(--accent)', fontFamily:'var(--font-mono)' }}>· updated notes</span>}
                        </div>
                        <div className="cd-disc-text">{msg.text}</div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── SYSTEMS DRAWER ── */}
      <div className={`cd-scrim ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <div className={`cd-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="cd-drawer-head">
          <div>
            <h2 style={{ fontSize:14, fontWeight:600 }}>Cluster Systems</h2>
            <p style={{ fontSize:11, color:'var(--text-dim)', marginTop:3, fontFamily:'var(--font-mono)' }}>{cluster ? `cla_${cluster.id}` : '—'} · {systems.length} nodes</p>
          </div>
          <button className="nd-modal-close" onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <div className="cd-drawer-sum">
          {[
            { label:'Online', val: systems.filter(s=>s.status==='online').length, color:'var(--accent)' },
            { label:'Offline', val: systems.filter(s=>s.status==='offline').length, color:'var(--text-dim)' },
            { label:'Avg Score', val: systems.length > 0 ? Math.round(systems.reduce((a,s)=>a+(s.score||0),0)/systems.length) : 0, color:'var(--text)' },
            { label:'Total Wins', val: systems.reduce((a,s)=>a+(s.wins||0),0), color:'var(--text)' },
          ].map(s => (
            <div key={s.label} className="cd-drawer-sum-item">
              <label>{s.label}</label>
              <value style={{ color:s.color }}>{s.val}</value>
            </div>
          ))}
        </div>
        <div className="cd-drawer-body">
          {systems.map(sys => (
            <div key={sys.id} className={`cd-snode ${sys.isHost ? 'host' : ''}`} onContextMenu={e => handleCtxMenu(e, sys)}>
              <div className="cd-snode-top">
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <div className={`status-dot ${sys.status === 'online' ? 'online' : 'offline'}`} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{sys.name}</div>
                    <div style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{sys.hostname}</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  {sys.isHost && <span className="badge badge-accent">Host</span>}
                  <span className={`badge ${sys.status === 'online' ? 'badge-accent' : 'badge-neutral'}`}>{sys.status}</span>
                </div>
              </div>
              <div className="cd-snode-foot">
                <span>{sys.wins||0}W / {sys.losses||0}L</span>
                <span style={{ 
                  color: sys.resourcePermissionGranted === false ? 'var(--yellow)' : 'var(--accent)', 
                  fontFamily: 'var(--font-mono)', fontSize: 10 
                }}>
                  {sys.resourcePermissionGranted === false ? '⏸ paused' : '● sharing'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="cd-drawer-foot">
          <span style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>Right-click a node for options</span>
          <div style={{ display:'flex', gap:8 }}>
            {!isHost && <button className="btn btn-danger btn-sm" onClick={handleLeaveCluster}>Leave Cluster</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => fetchActiveModels()}>Refresh</button>
          </div>
        </div>
      </div>

      {/* ── CTX MENU ── */}
      {ctxMenu.visible && (
        <div className="nd-ctx-menu" style={{ left:ctxMenu.x, top:ctxMenu.y }}>
          <div className="nd-ctx-label">{ctxMenu.system?.name}</div>
          {isHost && <button className="nd-ctx-item" onClick={() => ctxAction('models')}>Manage Models</button>}
          <button className="nd-ctx-item" onClick={() => ctxAction('resources')}>View Resources</button>
          <div className="nd-ctx-divider"/>
          <button className="nd-ctx-item" onClick={() => ctxAction('restart')}>Restart Node</button>
          <button className="nd-ctx-item" onClick={() => ctxAction('disconnect')}>Disconnect</button>
          <div className="nd-ctx-divider"/>
          <button className="nd-ctx-item danger" onClick={() => ctxAction('terminate')}>Terminate</button>
        </div>
      )}

      {/* ── MODEL MANAGER ── */}
      <div className={`cd-overlay ${modelManagerOpen ? 'open' : ''}`} onClick={e => e.target.classList.contains('cd-overlay') && setModelManagerOpen(false)}>
        <div className="cd-modal">
          <div className="cd-modal-head">
            <div>
              <div className="cd-modal-title">Model Manager</div>
              <div className="cd-modal-sub">Scanning <code style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>/models</code> for .gguf files</div>
            </div>
            <button className="nd-modal-close" onClick={() => { setModelManagerOpen(false); setSelectedSystemForModels(null); }}>×</button>
          </div>

          {scanError && (
            <div style={{ padding:'8px 22px', fontSize:11, fontFamily:'var(--font-mono)', background: scanError.startsWith('✓') ? 'var(--accent-dim)' : 'var(--red-dim)', borderBottom:`1px solid ${scanError.startsWith('✓') ? 'var(--accent-border)' : 'rgba(239,68,68,.2)'}`, color: scanError.startsWith('✓') ? 'var(--accent)' : 'var(--red)' }}>
              {scanError}
            </div>
          )}

          <div className="cd-modal-body">
            <div style={{ padding:'9px 22px 6px', fontSize:9, textTransform:'uppercase', letterSpacing:'.12em', color:'var(--text-dim)', fontFamily:'var(--font-mono)', borderBottom:'1px solid var(--border)' }}>
              Available in /models
            </div>
            {scanning ? (
              <div className="nd-empty"><span className="spin" style={{ fontSize:22 }}>⟳</span><div style={{ fontSize:12 }}>Scanning…</div></div>
            ) : availableModels.length === 0 ? (
              <div className="nd-empty">
                <div className="nd-empty-icon">📂</div>
                <div className="nd-empty-sub">No .gguf models found in the /models directory.</div>
              </div>
            ) : availableModels.map(m => {
              const isActive = m.loaded;
              const isLoading = loadingModel === m.name;
              return (
                <div key={m.path} className="cd-mm-row">
                  <div className="cd-mm-icon">
                    <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'var(--text-dim)' }}>GGUF</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="cd-mm-name">{m.name}</div>
                    <div className="cd-mm-meta">
                      <span>{m.size_gb} GB</span>
                      {isActive && <span className="cd-loaded-badge">Active</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
                    {isActive ? (
                      <button className="btn btn-danger btn-sm" onClick={() => unloadModel(m.name, selectedSystemForModels?.id || currentUserSystem?.id)} disabled={unloadingModel === m.name}>
                        {unloadingModel === m.name ? <span className="spin">⟳</span> : 'Unload'}
                      </button>
                    ) : (
                      <div style={{ display:'flex', gap:5 }}>
                        <button className="btn btn-accent-ghost btn-sm" onClick={() => loadModel(m)} disabled={isLoading || autoAssigning} title="Load on selected node">
                          {isLoading ? <><span className="spin">⟳</span> Loading…</> : 'Load'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => autoAssignAndLoad(m)} disabled={isLoading || autoAssigning} title="Auto-select node with most free VRAM">
                          {autoAssigning ? <span className="spin">⟳</span> : '⚡ Auto'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cd-modal-foot">
            <span style={{ fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>{availableModels.length} models found</span>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={scanModels} disabled={scanning}>Refresh</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setModelManagerOpen(false); setSelectedSystemForModels(null); }}>Done</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── BASE PROMPT MODAL ── */}
      <div className={`cd-overlay ${bpModalOpen ? 'open' : ''}`} onClick={e => e.target.classList.contains('cd-overlay') && setBpModalOpen(false)}>
        <div className="cd-modal cd-modal-sm">
          <div className="cd-modal-head">
            <div>
              <div className="cd-modal-title">Base Cluster Prompt</div>
              <div className="cd-modal-sub">Prepended to every question sent to all models.</div>
            </div>
            <button className="nd-modal-close" onClick={() => setBpModalOpen(false)}>×</button>
          </div>
          <div style={{ padding:'18px 22px' }}>
            <textarea className="nd-textarea" style={{ minHeight:120 }} value={tempBasePrompt} onChange={e => setTempBasePrompt(e.target.value)} placeholder="e.g. You are a concise technical assistant…"/>
          </div>
          <div className="cd-modal-foot">
            <button style={{ background:'none', border:'none', color:'var(--text-dim)', fontSize:11, fontFamily:'var(--font-mono)', cursor:'pointer' }} onClick={() => setTempBasePrompt('')}>Clear</button>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setBpModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setBasePrompt(tempBasePrompt); setBpModalOpen(false); }}>Save</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── INVITE MODAL ── */}
      {inviteOpen && (
        <div className="cd-overlay open" onClick={e => e.target.classList.contains('cd-overlay') && setInviteOpen(false)}>
          <div className="cd-modal cd-modal-sm">
            <div className="cd-modal-head">
              <div>
                <div className="cd-modal-title">Invite to Cluster</div>
                <div className="cd-modal-sub">Share these with anyone joining <strong>{cluster?.name}</strong>.</div>
              </div>
              <button className="nd-modal-close" onClick={() => setInviteOpen(false)}>×</button>
            </div>
            <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { label:'Step 1 · Cluster ID', val: `cla_${cluster?.id}`, key:'id', color:'var(--accent)' },
                { label:'Step 2 · Password', val: cluster?.password || sessionStorage.getItem(`cluster_pw_${cluster?.id}`) || '(none set)', key:'pw', color:'var(--text)' },
                { label:'Step 3 · Host URL (ngrok — optional)', val: cluster?.hostTunnelUrl || 'No active tunnel', key:'url', color: cluster?.hostTunnelUrl ? 'var(--text-mid)' : 'var(--text-dim)' },
              ].map(f => (
                <div key={f.key}>
                  <div className="label-caps" style={{ marginBottom:7 }}>{f.label}</div>
                  <div className="cd-invite-field">
                    <span className="cd-invite-val" style={{ color: f.color }}>{f.val}</span>
                    <button className={`btn btn-ghost btn-sm ${inviteCopied === f.key ? 'text-accent' : ''}`} onClick={() => copyInviteField(f.key, f.val)} disabled={!f.val || f.val === 'No active tunnel'}>
                      {inviteCopied === f.key ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
              <button className="btn btn-accent-ghost" style={{ width:'100%' }} onClick={() => {
                const text = `NeuralDocker Cluster Invite\n\nCluster ID: cla_${cluster?.id}\nPassword: ${cluster?.password || '(none set)'}\nHost URL: ${cluster?.hostTunnelUrl || 'No active tunnel'}`;
                navigator.clipboard.writeText(text).then(() => { setInviteCopied('all'); setTimeout(() => setInviteCopied(''), 2000); });
              }}>
                {inviteCopied === 'all' ? '✓ Copied to clipboard' : 'Copy All'}
              </button>
            </div>
            <div style={{ padding:'10px 22px', borderTop:'1px solid var(--border)', background:'var(--bg3)', fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>
              ⚠ The host URL changes if ngrok restarts. Workers should re-join if they lose connection.
            </div>
          </div>
        </div>
      )}

      {/* ── NOTES MODAL ── */}
      <div className={`cd-overlay ${notesModalOpen ? 'open' : ''}`} onClick={e => e.target.classList.contains('cd-overlay') && setNotesModalOpen(false)}>
        <div className="cd-modal">
          <div className="cd-modal-head">
            <div>
              <div className="cd-modal-title">Model Notes</div>
              <div className="cd-modal-sub">Cache memory written by each model · persists while loaded</div>
            </div>
            <button className="nd-modal-close" onClick={() => setNotesModalOpen(false)}>×</button>
          </div>
          <div className="cd-modal-body">
            {modelNotes.length === 0 ? (
              <div className="nd-empty"><div className="nd-empty-sub">No notes written yet.</div></div>
            ) : modelNotes.map(note => (
              <div key={note.modelId} style={{ padding:'13px 22px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div className="status-dot online" style={{ width:5, height:5 }} />
                    <span style={{ fontSize:13, fontWeight:500 }}>{note.modelName}</span>
                  </div>
                  <div style={{ display:'flex', gap:14 }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)' }}>{note.wordCount}/200 words</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)' }}>score {Math.round(note.score || 0)}</span>
                  </div>
                </div>
                {note.cacheMemory?.trim() ? (
                  <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', padding:'10px 13px', fontSize:12, color:'var(--text-mid)', fontFamily:'var(--font-mono)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                    {note.cacheMemory}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'var(--text-dim)', fontStyle:'italic' }}>No notes written yet.</div>
                )}
              </div>
            ))}
          </div>
          <div className="cd-modal-foot">
            <span style={{ fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>Read-only · Updated during discussion rounds</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNotesModalOpen(false)}>Close</button>
          </div>
        </div>
      </div>

      {/* ── SESSION HISTORY MODAL ── */}
      <div className={`cd-overlay ${historyOpen ? 'open' : ''}`} onClick={e => e.target.classList.contains('cd-overlay') && setHistoryOpen(false)}>
        <div className="cd-modal cd-modal-history">
          <div className="cd-modal-head">
            <div>
              <div className="cd-modal-title">History</div>
              <div className="cd-modal-sub">
                {durableHistoryEntries !== null
                  ? "Every prompt asked in this cluster, each model's answer, its score, and the individual votes it received. Synced from the server — persists across sessions and devices."
                  : historyLoading
                    ? 'Loading history from the server…'
                    : historyLoadError
                      ? `Couldn't load full history (${historyLoadError}) — showing this session only.`
                      : "Every prompt sent this session, each model's answer, its score, and the individual votes it received."}
              </div>
            </div>
            <button className="nd-modal-close" onClick={() => setHistoryOpen(false)}>×</button>
          </div>

          <div className="cd-modal-body">
            {historyEntries.length === 0 ? (
              <div className="nd-empty" style={{ padding:'40px 16px' }}>
                <div className="nd-empty-icon">🕘</div>
                <div className="nd-empty-sub">No questions asked yet this session.</div>
              </div>
            ) : historyEntries.map((entry, qi) => {
              const isEntryOpen = !!historyExpanded[entry.id];
              return (
                <div key={entry.id} className="cd-hist-entry">
                  <div className="cd-hist-q" onClick={() => toggleHistoryEntry(entry.id)}>
                    <div className="cd-hist-q-left">
                      <span className="cd-hist-q-idx">Q{historyEntries.length - qi}</span>
                      <span className="cd-hist-q-text">{entry.prompt}</span>
                    </div>
                    <div className="cd-hist-q-right">
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)' }}>{entry.responses.length} model{entry.responses.length !== 1 ? 's' : ''}</span>
                      <span className="cd-hist-q-time">{entry.time}</span>
                      <svg className="cd-expand-icon" style={{ transform: isEntryOpen ? 'rotate(180deg)' : 'none' }} viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </div>

                  {isEntryOpen && (
                    <div className="cd-hist-answers">
                      {entry.responses.map((r, ri) => {
                        const m = models.find(mo => mo.name === r.model);
                        const isWinner = r.model === entry.winnerModel;
                        const key = `${entry.id}-${ri}`;
                        const isAnsOpen = !!historyRespExpanded[key];
                        return (
                          <div key={key} className={`cd-hist-ans ${isWinner ? 'winner' : ''}`}>
                            <div className="cd-hist-ans-head" onClick={() => toggleHistoryAnswer(key)}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                                <div className="cd-model-dot" style={{ background: m?.color || colorFromName(r.model), flexShrink:0 }} />
                                <span style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.model}</span>
                                {isWinner && <span className="winner-tag">✦ Best</span>}
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                                <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-dim)' }}>{(r.avg_score || 0).toFixed(1)}/5 · {r.scores?.length || 0} votes</span>
                                <svg className="cd-expand-icon" style={{ transform: isAnsOpen ? 'rotate(180deg)' : 'none' }} viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </div>
                            </div>
                            {isAnsOpen && (
                              <div className="cd-hist-ans-body">
                                <div style={{ whiteSpace:'pre-wrap', marginBottom:10 }}>{r.answer}</div>
                                <div className="label-caps" style={{ marginBottom:6 }}>Votes received</div>
                                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                                  {(r.scores || []).map((s, i) => (
                                    <div key={i} className="cd-vote-chip" style={{
                                      background: s >= 4 ? 'var(--accent-dim)' : s <= 2 ? 'var(--red-dim)' : 'var(--bg4)',
                                      color: s >= 4 ? 'var(--accent)' : s <= 2 ? 'var(--red)' : 'var(--text-mid)',
                                      borderColor: s >= 4 ? 'var(--accent-border)' : s <= 2 ? 'rgba(239,68,68,.25)' : 'var(--border)',
                                    }}>{s}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="cd-modal-foot">
            <span style={{ fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)' }}>
              {historyEntries.length} question{historyEntries.length !== 1 ? 's' : ''} this session
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(false)}>Close</button>
          </div>
        </div>
      </div>

      {/* ── SESSION END WARNING MODAL ── */}
      {sessionEndModal && (
        <div className="cd-overlay open" onClick={e => e.target.classList.contains('cd-overlay') && (() => {
          setSessionEndModal(false);
          if (sessionEndResolver) sessionEndResolver(false);
        })()}>
          <div className="cd-modal cd-modal-sm" style={{ maxWidth:400 }}>
            <div className="cd-modal-head">
              <div>
                <div className="cd-modal-title">Session Ending</div>
                <div className="cd-modal-sub">
                  This is the last question of the session. After the answer,{' '}
                  {cluster?.enableDiscussion && cluster?.autoRotate ? 'discussion and model rotation'
                    : cluster?.enableDiscussion ? 'model discussion'
                    : 'model rotation'} will run automatically.
                </div>
              </div>
            </div>
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                width:64, height:64, borderRadius:'50%',
                background:'var(--accent-dim)', border:'2px solid var(--accent-border)',
                margin:'0 auto', fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700,
                color:'var(--accent)'
              }}>
                {sessionEndCountdown}
              </div>
              <p style={{ fontSize:12, color:'var(--text-mid)', textAlign:'center', lineHeight:1.6 }}>
                Proceeding automatically in <strong>{sessionEndCountdown}s</strong>.
                Click <strong>Skip</strong> to get the answer without post-session processing.
              </p>
            </div>
            <div className="cd-modal-foot">
              <button className="btn btn-ghost btn-sm" onClick={() => {
                setSessionEndModal(false);
                if (sessionEndResolver) sessionEndResolver(true);
                handleSendMessage(true);
              }}>
                Skip Post-Session
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setSessionEndModal(false);
                if (sessionEndResolver) sessionEndResolver(false);
                handleSendMessage(false);
              }}>
                Continue ({sessionEndCountdown}s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DISCUSSION PROMPT MODAL ── */}
      <div className={`cd-overlay ${discussionPromptModalOpen ? 'open' : ''}`} onClick={e => e.target.classList.contains('cd-overlay') && setDiscussionPromptModalOpen(false)}>
        <div className="cd-modal cd-modal-sm">
          <div className="cd-modal-head">
            <div>
              <div className="cd-modal-title">Discussion Base Prompt</div>
              <div className="cd-modal-sub">Override the prompt used at the start of model discussion. Takes effect on the next session end.</div>
            </div>
            <button className="nd-modal-close" onClick={() => setDiscussionPromptModalOpen(false)}>×</button>
          </div>
          <div style={{ padding:'18px 22px' }}>
            <textarea className="nd-textarea" style={{ minHeight:100 }} value={tempDiscussionPrompt} onChange={e => setTempDiscussionPrompt(e.target.value)} placeholder="Leave blank to use the default (reflect on the last question)…"/>
            <div style={{ fontSize:10, color:'var(--text-dim)', fontFamily:'var(--font-mono)', marginTop:6 }}>
              {tempDiscussionPrompt.trim().split(/\s+/).filter(Boolean).length} words
            </div>
          </div>
          <div className="cd-modal-foot">
            <button style={{ background:'none', border:'none', color:'var(--text-dim)', fontSize:11, fontFamily:'var(--font-mono)', cursor:'pointer' }} onClick={() => setTempDiscussionPrompt('')}>Clear (use default)</button>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDiscussionPromptModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveDiscussionPrompt}>Save</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ClusterDashboard;
