import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLocalAPI, clearClusterSession, saveClusterHostUrl } from '../config';

const CLUSTER_API = getLocalAPI();

const JoinCluster = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('browse');

  // Browse tab state
  const [publicClusters, setPublicClusters] = useState([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [browsePassword, setBrowsePassword] = useState('');
  const [joiningId, setJoiningId] = useState(null);

  // Manual tab state
  const [clusterId, setClusterId] = useState('');
  const [password, setPassword] = useState('');
  const [manualError, setManualError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Invite tab state
  const [hostUrl, setHostUrl] = useState('');
  const [inviteClusterId, setInviteClusterId] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Fetch public clusters on mount
  useEffect(() => {
    fetchPublicClusters();
  }, []);

  const fetchPublicClusters = async () => {
    setBrowsing(true);
    setBrowseError('');
    try {
      const res = await fetch(`${CLUSTER_API}/api/v1/clusters/public`);
      if (res.ok) {
        const data = await res.json();
        setPublicClusters(Array.isArray(data) ? data : []);
      } else {
        setBrowseError('Failed to load public clusters.');
      }
    } catch (e) {
      setBrowseError('Cannot reach server.');
    } finally {
      setBrowsing(false);
    }
  };

  const filteredClusters = publicClusters.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `cla_${c.id}`.includes(searchQuery.toLowerCase())
  );

  // Join from browse tab
  const handleBrowseJoin = async (cluster) => {
    setJoiningId(cluster.id);
    setBrowseError('');
    try {
      const token = localStorage.getItem('token');
      const accountName = localStorage.getItem('accountName');
      const myTunnel = await fetch(`${getLocalAPI()}/api/v1/clusters/my-tunnel`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.ok ? r.json() : { tunnelUrl: '' }).catch(() => ({ tunnelUrl: '' }));
      const res = await fetch(`${CLUSTER_API}/api/v1/clusters/join-by-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          clusterId: String(cluster.id),
          password: browsePassword,
          accountName,
          workerTunnelUrl: myTunnel.tunnelUrl
        })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.hostTunnelUrl) {
          saveClusterHostUrl(cluster.id, data.hostTunnelUrl);
          console.log('Cluster backend URL saved:', data.hostTunnelUrl);
        }
        navigate(`/cluster?id=${cluster.id}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setBrowseError(data.error || data.message || 'Failed to join cluster. Check the password.');
        setSelectedCluster(cluster); // Keep modal open on error
      }
    } catch (e) {
      setBrowseError('Failed to connect to server.');
    } finally {
      setJoiningId(null);
    }
  };

  // Join from manual tab
  const handleManualJoin = async () => {
    if (!clusterId.trim()) return setManualError('Please enter a cluster ID.');
    setIsLoading(true);
    setManualError('');

    // Accept both "cla_1" and "1" formats
    const cleanId = clusterId.trim().replace(/^cla_/i, '');
    if (isNaN(cleanId)) return (setManualError('Invalid cluster ID format.'), setIsLoading(false));

    try {
      const token = localStorage.getItem('token');
      const accountName = localStorage.getItem('accountName');
      const myTunnel = await fetch(`${getLocalAPI()}/api/v1/clusters/my-tunnel`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.ok ? r.json() : { tunnelUrl: '' }).catch(() => ({ tunnelUrl: '' }));
      const res = await fetch(`${CLUSTER_API}/api/v1/clusters/join-by-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ clusterId: cleanId, password, accountName, workerTunnelUrl: myTunnel.tunnelUrl })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.hostTunnelUrl) {
          saveClusterHostUrl(cleanId, data.hostTunnelUrl);
          console.log('Cluster backend URL saved:', data.hostTunnelUrl);
        }
        navigate(`/cluster?id=${cleanId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setManualError(data.error || data.message || 'Failed to join cluster.');
      }
    } catch (e) {
      setManualError('Failed to connect to server.');
    } finally {
      setIsLoading(false);
    }
  };

  // Join from invite tab
  const handleInviteJoin = async () => {
    if (!hostUrl.trim()) return setInviteError('Please enter the host backend URL.');
    if (!inviteClusterId.trim()) return setInviteError('Please enter the cluster ID.');
    setInviteLoading(true);
    setInviteError('');

    // Accept both "cla_1" and "1" formats
    const cleanId = inviteClusterId.trim().replace(/^cla_/i, '');
    if (isNaN(cleanId)) return (setInviteError('Invalid cluster ID format.'), setInviteLoading(false));

    try {
      const token = localStorage.getItem('token');
      const accountName = localStorage.getItem('accountName');
      const myTunnel = await fetch(`${getLocalAPI()}/api/v1/clusters/my-tunnel`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.ok ? r.json() : { tunnelUrl: '' }).catch(() => ({ tunnelUrl: '' }));
      const res = await fetch(`${hostUrl}/api/v1/clusters/join-by-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ clusterId: cleanId, password: invitePassword, accountName, workerTunnelUrl: myTunnel.tunnelUrl })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // Set the stored host URL for this specific cluster
        saveClusterHostUrl(cleanId, hostUrl.trim());
        console.log('Cluster backend URL saved:', hostUrl.trim());
        navigate(`/cluster?id=${cleanId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setInviteError(data.error || data.message || 'Failed to join cluster.');
      }
    } catch (e) {
      setInviteError('Failed to connect to host server.');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', fontFamily:'var(--font-sans)' }}>
      <style>{`
        .jc-nav { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:var(--nav-height); border-bottom:1px solid var(--border); background:var(--bg); }
        .jc-page { max-width:680px; margin:0 auto; padding:40px 24px 80px; }
        .jc-tabs { display:flex; gap:0; border:1px solid var(--border-mid); border-radius:var(--radius-lg); overflow:hidden; margin-bottom:24px; }
        .jc-tab { flex:1; padding:10px 0; background:none; border:none; border-right:1px solid var(--border-mid); font-size:12px; font-weight:500; color:var(--text-mid); cursor:pointer; transition:all var(--transition); font-family:var(--font-sans); }
        .jc-tab:last-child { border-right:none; }
        .jc-tab.active { background:var(--bg3); color:var(--text); }
        .jc-tab:hover:not(.active) { color:var(--text-mid); background:var(--bg4); }

        .jc-info-box { background:var(--accent-dim); border:1px solid var(--accent-border); border-radius:var(--radius-md); padding:11px 14px; font-size:11px; color:var(--text-mid); line-height:1.6; margin-bottom:20px; font-family:var(--font-mono); }
        .jc-error { background:var(--red-dim); border:1px solid rgba(239,68,68,.2); border-radius:var(--radius-md); padding:9px 13px; font-size:12px; color:var(--red); font-family:var(--font-mono); margin-bottom:16px; }

        .jc-search { display:flex; gap:8px; margin-bottom:16px; }
        .jc-search-input { flex:1; background:var(--bg3); border:1px solid var(--border-mid); border-radius:var(--radius-md); padding:10px 14px; color:var(--text); font-family:var(--font-sans); font-size:13px; outline:none; transition:border-color var(--transition); }
        .jc-search-input:focus { border-color:var(--accent-border); }
        .jc-search-input::placeholder { color:var(--text-dim); }
        .jc-refresh-btn { padding:10px 14px; background:none; border:1px solid var(--border-mid); color:var(--text-dim); border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition); font-size:13px; }
        .jc-refresh-btn:hover { border-color:var(--border-bright); color:var(--text); }

        .jc-cluster-list { display:flex; flex-direction:column; gap:10px; }
        .jc-cluster-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px 18px; cursor:pointer; transition:all var(--transition); display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .jc-cluster-card:hover { border-color:var(--border-bright); background:var(--bg3); }
        .jc-cluster-card.selected { border-color:var(--accent-border); background:var(--accent-dim); }
        .jc-cluster-name { font-size:14px; font-weight:500; margin-bottom:3px; }
        .jc-cluster-id { font-family:var(--font-mono); font-size:10px; color:var(--text-dim); }
        .jc-cluster-meta { display:flex; gap:14px; margin-top:7px; }
        .jc-cluster-meta span { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); }
        .jc-lock { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); display:flex; align-items:center; gap:4px; white-space:nowrap; flex-shrink:0; border:1px solid var(--border-mid); padding:2px 8px; border-radius:3px; }
        .jc-join-btn { padding:7px 16px; border-radius:var(--radius-md); background:var(--accent-dim); border:1px solid var(--accent-border); color:var(--accent); font-size:12px; font-weight:600; cursor:pointer; transition:all var(--transition); white-space:nowrap; flex-shrink:0; font-family:var(--font-sans); }
        .jc-join-btn:hover { background:var(--accent-glow); }
        .jc-join-btn:disabled { opacity:.4; cursor:not-allowed; }

        .jc-pw-modal { background:var(--bg3); border:1px solid var(--border-bright); border-radius:var(--radius-lg); padding:18px; margin-top:8px; }
        .jc-pw-modal-title { font-size:13px; font-weight:600; margin-bottom:3px; }
        .jc-pw-modal-sub { font-size:11px; color:var(--text-mid); margin-bottom:14px; font-family:var(--font-mono); }
        .jc-pw-input { width:100%; background:var(--bg4); border:1px solid var(--border-mid); border-radius:var(--radius-md); padding:10px 14px; color:var(--text); font-family:var(--font-sans); font-size:13px; outline:none; transition:border-color var(--transition); margin-bottom:12px; }
        .jc-pw-input:focus { border-color:var(--accent-border); }
        .jc-pw-actions { display:flex; gap:8px; justify-content:flex-end; }

        .jc-empty { padding:48px 20px; text-align:center; color:var(--text-dim); background:var(--bg2); border:1px dashed var(--border-mid); border-radius:var(--radius-lg); }
        .jc-empty-icon { font-size:28px; opacity:.25; margin-bottom:12px; }
        .jc-empty-title { font-size:14px; color:var(--text-mid); margin-bottom:6px; }
        .jc-empty-sub { font-size:12px; line-height:1.6; max-width:300px; margin:0 auto; }

        .jc-field { display:flex; flex-direction:column; gap:7px; }
        .jc-field label { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--text-mid); font-family:var(--font-mono); font-weight:600; }
        .jc-hint { font-size:10px; color:var(--text-mid); font-family:var(--font-mono); }
        .jc-manual { display:flex; flex-direction:column; gap:18px; }
        .jc-manual-actions { display:flex; gap:10px; margin-top:4px; }

        .spin { display:inline-block; animation:spin .7s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>

      {/* Nav */}
      <nav className="jc-nav">
        <div className="nd-logo">
          <div className="nd-logo-mark"><span/><span/><span/><span/></div>
          <div className="nd-logo-text">
            <span className="nd-logo-sub">NeuralDocker</span>
            <span className="nd-logo-name">Selective</span>
          </div>
        </div>
        <button className="nd-back-btn" onClick={() => navigate(-1)}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width:12,height:12}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </button>
      </nav>

      <div className="jc-page">
        <div style={{marginBottom:28}}>
          <h1 style={{fontSize:20, fontWeight:700, letterSpacing:'-0.02em', marginBottom:6}}>Join a Cluster</h1>
          <p style={{fontSize:13, color:'var(--text-mid)'}}>Browse public clusters or enter a cluster ID directly to join.</p>
        </div>

        {/* Tabs */}
        <div className="jc-tabs">
          {[['browse','Browse Public'],['manual','Join by ID'],['invite','Invite URL']].map(([val, label]) => (
            <button key={val} className={`jc-tab ${activeTab === val ? 'active' : ''}`} onClick={() => setActiveTab(val)}>{label}</button>
          ))}
        </div>

        {/* ── BROWSE TAB ── */}
        {activeTab === 'browse' && (
          <>
            <div className="jc-info-box">Public clusters are open to join with a password set by the host. Private clusters are invite-only.</div>
            {browseError && <div className="jc-error">{browseError}</div>}
            <div className="jc-search">
              <input className="jc-search-input" type="text" placeholder="Search by name or ID…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <button className="jc-refresh-btn" onClick={fetchPublicClusters}>{browsing ? <span className="spin">⟳</span> : '⟳'}</button>
            </div>
            {browsing ? (
              <div style={{textAlign:'center', padding:'48px 0', color:'var(--text-dim)'}}>
                <span className="spin" style={{fontSize:22, display:'block', marginBottom:12}}>⟳</span>
                Loading public clusters…
              </div>
            ) : filteredClusters.length === 0 ? (
              <div className="jc-empty">
                <div className="jc-empty-icon">
                  <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24" style={{opacity:0.25}}>
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <div className="jc-empty-title">{searchQuery ? 'No clusters match your search' : 'No public clusters available'}</div>
                <div className="jc-empty-sub">{searchQuery ? 'Try a different search term.' : 'Public clusters will appear here. Use Join by ID for private clusters.'}</div>
              </div>
            ) : (
              <div className="jc-cluster-list">
                {filteredClusters.map(cluster => (
                  <div key={cluster.id}>
                    <div className={`jc-cluster-card ${selectedCluster?.id === cluster.id ? 'selected' : ''}`}
                      onClick={() => { setSelectedCluster(selectedCluster?.id === cluster.id ? null : cluster); setBrowsePassword(''); setBrowseError(''); }}>
                      <div style={{flex:1, minWidth:0}}>
                        <div className="jc-cluster-name">{cluster.name}</div>
                        <div className="jc-cluster-id">{cluster.displayId}</div>
                        <div className="jc-cluster-meta">
                          <span>max {cluster.maxModels} models</span>
                          <span>session limit {cluster.sessionLimit}</span>
                        </div>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:10, flexShrink:0}}>
                        {cluster.hasPassword && <span className="jc-lock">Password required</span>}
                        <button className="jc-join-btn" disabled={joiningId === cluster.id}
                          onClick={e => { e.stopPropagation(); if (cluster.hasPassword) { setSelectedCluster(cluster); setBrowsePassword(''); } else { handleBrowseJoin(cluster); } }}>
                          {joiningId === cluster.id ? <span className="spin">⟳</span> : 'Join'}
                        </button>
                      </div>
                    </div>
                    {selectedCluster?.id === cluster.id && cluster.hasPassword && (
                      <div className="jc-pw-modal">
                        <div className="jc-pw-modal-title">Password required — "{cluster.name}"</div>
                        <div className="jc-pw-modal-sub">Enter the password set by the host.</div>
                        {browseError && <div className="jc-error" style={{marginBottom:10}}>{browseError}</div>}
                        <input className="jc-pw-input nd-input" type="password" placeholder="Cluster password…" value={browsePassword}
                          onChange={e => setBrowsePassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleBrowseJoin(cluster)} autoFocus />
                        <div className="jc-pw-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCluster(null); setBrowsePassword(''); setBrowseError(''); }}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={() => handleBrowseJoin(cluster)} disabled={joiningId === cluster.id || !browsePassword.trim()}>
                            {joiningId === cluster.id ? <span className="spin">⟳</span> : 'Join Cluster'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── MANUAL TAB ── */}
        {activeTab === 'manual' && (
          <div className="jc-manual">
            <div className="jc-info-box">Use this to join a private cluster using its ID. The host needs to share the cluster ID with you directly.</div>
            {manualError && <div className="jc-error">{manualError}</div>}
            <div className="jc-field">
              <label>Cluster ID</label>
              <input className="nd-input" type="text" placeholder="e.g. cla_42 or just 42" value={clusterId} onChange={e => setClusterId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualJoin()} />
              <div className="jc-hint">Both "cla_42" and "42" formats are accepted.</div>
            </div>
            <div className="jc-field">
              <label>Password</label>
              <input className="nd-input" type="password" placeholder="Enter cluster password if required…" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualJoin()} />
            </div>
            <div className="jc-manual-actions">
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => navigate(-1)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={handleManualJoin} disabled={isLoading || !clusterId.trim()}>
                {isLoading ? <><span className="spin">⟳</span> Joining…</> : 'Join Cluster'}
              </button>
            </div>
          </div>
        )}

        {/* ── INVITE TAB ── */}
        {activeTab === 'invite' && (
          <div className="jc-manual">
            <div className="jc-info-box">Use this to join via a host invite. You'll need the host's backend URL, cluster ID, and password.</div>
            {inviteError && <div className="jc-error">{inviteError}</div>}
            <div className="jc-field">
              <label>Host Backend URL</label>
              <input className="nd-input" type="text" placeholder="e.g. https://abc123.ngrok-free.app" value={hostUrl} onChange={e => setHostUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInviteJoin()} />
              <div className="jc-hint">The URL provided by the cluster host.</div>
            </div>
            <div className="jc-field">
              <label>Cluster ID</label>
              <input className="nd-input" type="text" placeholder="e.g. cla_42 or just 42" value={inviteClusterId} onChange={e => setInviteClusterId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInviteJoin()} />
            </div>
            <div className="jc-field">
              <label>Password</label>
              <input className="nd-input" type="password" placeholder="Leave blank if none" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInviteJoin()} />
            </div>
            <div className="jc-manual-actions">
              <button className="btn btn-ghost" style={{flex:1}} onClick={() => navigate(-1)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={handleInviteJoin} disabled={inviteLoading || !hostUrl.trim() || !inviteClusterId.trim()}>
                {inviteLoading ? <><span className="spin">⟳</span> Joining…</> : 'Join Cluster'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinCluster;