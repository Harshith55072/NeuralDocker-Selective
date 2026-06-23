import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_AI_API_URL || 'http://localhost:8000';

const FloatingRecorder = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveMsgType, setSaveMsgType] = useState('');

  const dragStart = useRef(null);
  const hasMoved = useRef(false);
  const posRef = useRef({ x: 20, y: 20 });
  const folderInputRef = useRef(null);

  const hideOnPaths = ['/', '/login', '/register'];
  const isHidden = hideOnPaths.includes(location.pathname);

  // ── Sync recording state from backend ─────────────────────────────────────
  useEffect(() => {
    if (isHidden) return;
    const syncStatus = async () => {
      try {
        const res = await fetch(`${API}/api/recording/status`);
        if (!res.ok) return;
        const data = await res.json();
        setIsRecording(data.is_recording);
        setSampleCount(data.sample_count ?? 0);
        if (!data.is_recording) setDuration(0);
      } catch (err) {}
    };
    syncStatus();
    const id = setInterval(syncStatus, 5000);
    return () => clearInterval(id);
  }, [isHidden]);

  // ── Local duration counter ─────────────────────────────────────────────────
  useEffect(() => {
    let id;
    if (isRecording) {
      id = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      setDuration(0);
    }
    return () => { if (id) clearInterval(id); };
  }, [isRecording]);

  // ── Auto-focus folder input when shown ────────────────────────────────────
  useEffect(() => {
    if (showFolderInput && folderInputRef.current) {
      folderInputRef.current.focus();
    }
  }, [showFolderInput]);

  // ── Show save message briefly then clear ──────────────────────────────────
  const showSaveMsg = (msg, type = 'success') => {
    setSaveMsg(msg);
    setSaveMsgType(type);
    setTimeout(() => { setSaveMsg(''); setSaveMsgType(''); }, 3000);
  };

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    const folder = folderInput.trim() || 'system';
    const url = `${API}/api/recording/start?folder=${encodeURIComponent(folder)}`;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        showSaveMsg(`Backend error ${res.status}`, 'error');
        return;
      }
      const data = await res.json();
      if (data.status === 'started') {
        setIsRecording(true);
        setDuration(0);
        setSampleCount(0);
        setShowFolderInput(false);
        setFolderInput('');
        showSaveMsg(`Recording started · ${folder}`, 'success');
      } else if (data.status === 'already_recording') {
        showSaveMsg('Already recording', 'error');
      }
    } catch (err) {
      showSaveMsg('Cannot reach ai-service', 'error');
    }
  };

  // ── Stop recording ─────────────────────────────────────────────────────────
  const stopRecording = async () => {
    try {
      const res = await fetch(`${API}/api/recording/stop`, { method: 'POST' });
      if (!res.ok) {
        showSaveMsg(`Backend error ${res.status}`, 'error');
        return;
      }
      const data = await res.json();
      if (data.status === 'stopped') {
        setIsRecording(false);
        setDuration(0);
        showSaveMsg(`Saved · ${data.filename}`, 'success');
      } else if (data.status === 'not_recording') {
        showSaveMsg('Not currently recording', 'error');
        setIsRecording(false);
      }
    } catch (err) {
      showSaveMsg('Cannot reach ai-service', 'error');
    }
  };

  const handleRecBtn = (e) => {
    e.stopPropagation();
    if (isRecording) {
      stopRecording();
    } else {
      setShowFolderInput(true);
      setExpanded(true);
    }
  };

  const handleStartConfirm = (e) => {
    e.stopPropagation();
    startRecording();
  };

  const handleCancelFolder = (e) => {
    e.stopPropagation();
    setShowFolderInput(false);
    setFolderInput('');
  };

  // ── Drag handling ──────────────────────────────────────────────────────────
  const onContainerMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: posRef.current.x,
      posY: posRef.current.y,
    };
    hasMoved.current = false;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mouseX;
      const dy = e.clientY - dragStart.current.mouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true;
      const newX = Math.max(0, dragStart.current.posX - dx);
      const newY = Math.max(0, dragStart.current.posY - dy);
      posRef.current = { x: newX, y: newY };
      setPosition({ x: newX, y: newY });
    };
    const onUp = () => { setIsDragging(false); dragStart.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  if (isHidden) return null;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div
      onMouseDown={onContainerMouseDown}
      style={{
        position: 'fixed',
        bottom: position.y,
        right: position.x,
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      <style>{`
        .fr-pill {
          background: rgba(12,12,12,0.88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 50px;
          padding: 7px 12px 7px 10px;
          display: flex;
          align-items: center;
          gap: 9px;
          color: #fff;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          transition: border-color 0.2s, background 0.2s;
          min-width: 120px;
        }
        .fr-pill:hover { border-color: rgba(255,255,255,0.2); }
        .fr-pill.recording { border-color: rgba(244,63,94,0.4); }

        .fr-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #444;
          flex-shrink: 0;
          transition: background 0.3s;
        }
        .fr-dot.active {
          background: #f43f5e;
          animation: frPulse 1.4s ease-in-out infinite;
        }
        @keyframes frPulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:0.3;transform:scale(1.3)}
        }

        .fr-info { display:flex; flex-direction:column; gap:1px; flex:1; min-width:0; }
        .fr-timer { font-size:13px; font-weight:600; letter-spacing:0.04em; color:#fff; line-height:1; }
        .fr-sub { font-size:10px; color:rgba(255,255,255,0.35); line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .fr-btn {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          cursor: pointer;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.07em;
          padding: 4px 9px;
          border-radius: 20px;
          transition: all 0.15s;
          flex-shrink: 0;
          font-family: 'IBM Plex Mono', monospace;
          white-space: nowrap;
        }
        .fr-btn:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.25); }
        .fr-btn.stop { background:rgba(244,63,94,0.18); border-color:rgba(244,63,94,0.4); color:#f43f5e; }
        .fr-btn.stop:hover { background:rgba(244,63,94,0.3); }
        .fr-btn.confirm { background:rgba(57,255,122,0.15); border-color:rgba(57,255,122,0.35); color:#39ff7a; }
        .fr-btn.confirm:hover { background:rgba(57,255,122,0.25); }
        .fr-btn.cancel { background:none; border-color:rgba(255,255,255,0.1); color:rgba(255,255,255,0.4); }
        .fr-btn.cancel:hover { color:rgba(255,255,255,0.7); border-color:rgba(255,255,255,0.2); }
        .fr-btn.nav { padding:3px 8px; font-size:9px; background:none; border-color:rgba(255,255,255,0.08); color:rgba(255,255,255,0.3); }
        .fr-btn.nav:hover { color:rgba(255,255,255,0.6); border-color:rgba(255,255,255,0.18); }

        .fr-folder-panel {
          background: rgba(12,12,12,0.92);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 220px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        .fr-folder-label {
          font-size: 10px;
          color: rgba(255,255,255,0.4);
          font-family: 'IBM Plex Mono', monospace;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .fr-folder-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 7px;
          padding: 8px 10px;
          color: #fff;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          outline: none;
          width: 100%;
          transition: border-color 0.15s;
        }
        .fr-folder-input:focus { border-color: rgba(57,255,122,0.4); }
        .fr-folder-input::placeholder { color: rgba(255,255,255,0.2); }
        .fr-folder-actions { display:flex; gap:7px; }

        .fr-msg {
          background: rgba(12,12,12,0.88);
          backdrop-filter: blur(14px);
          border-radius: 10px;
          padding: 8px 14px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 260px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          animation: frSlideIn 0.2s ease;
        }
        .fr-msg.success { border:1px solid rgba(57,255,122,0.3); color:#39ff7a; }
        .fr-msg.error { border:1px solid rgba(244,63,94,0.3); color:#f43f5e; }
        @keyframes frSlideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

        .fr-quick-btns {
          display: flex;
          gap: 5px;
          justify-content: flex-end;
        }
      `}</style>

      {/* Save/error message toast */}
      {saveMsg && (
        <div className={`fr-msg ${saveMsgType}`}>
          {saveMsgType === 'success' ? '✓ ' : '⚠ '}{saveMsg}
        </div>
      )}

      {/* Folder input panel — shows before starting */}
      {showFolderInput && (
        <div className="fr-folder-panel" onMouseDown={e => e.stopPropagation()}>
          <div className="fr-folder-label">Save to folder</div>
          <input
            ref={folderInputRef}
            className="fr-folder-input"
            type="text"
            placeholder="system (default)"
            value={folderInput}
            onChange={e => setFolderInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleStartConfirm(e);
              if (e.key === 'Escape') handleCancelFolder(e);
            }}
            onMouseDown={e => e.stopPropagation()}
          />
          <div className="fr-folder-actions">
            <button className="fr-btn cancel" onClick={handleCancelFolder}>Cancel</button>
            <button className="fr-btn confirm" onClick={handleStartConfirm}>● Start</button>
          </div>
        </div>
      )}

      {/* Main pill */}
      <div className={`fr-pill ${isRecording ? 'recording' : ''}`}>
        <div className={`fr-dot ${isRecording ? 'active' : ''}`}/>

        <div className="fr-info">
          <div className="fr-timer">
            {isRecording ? fmt(duration) : 'Ready'}
          </div>
          {isRecording && (
            <div className="fr-sub">{sampleCount} samples</div>
          )}
          {!isRecording && (
            <div className="fr-sub">drag to move</div>
          )}
        </div>

        <button
          className={`fr-btn ${isRecording ? 'stop' : ''}`}
          onClick={handleRecBtn}
          onMouseDown={e => e.stopPropagation()}
        >
          {isRecording ? '■ STOP' : '● REC'}
        </button>
      </div>

      {/* Quick nav buttons — always visible */}
      <div className="fr-quick-btns">
        <button
          className="fr-btn nav"
          onClick={e => { e.stopPropagation(); navigate('/system-resources'); }}
          onMouseDown={e => e.stopPropagation()}
          title="View recordings"
        >
          recordings
        </button>
        <button
          className="fr-btn nav"
          onClick={e => { e.stopPropagation(); navigate('/dashboard'); }}
          onMouseDown={e => e.stopPropagation()}
          title="System dashboard"
        >
          dashboard
        </button>
      </div>
    </div>
  );
};

export default FloatingRecorder;