// FILE: Frontend/src/config.js

/** 
 * Central API URL resolver for NeuralDocker Selective. 
 * 
 * CLUSTER operations (consensus, models, cluster settings): 
 *   → Use host's backend tunnel URL if this node has joined a cluster. 
 *   → Falls back to own localhost if host (or not in a cluster). 
 * 
 * PERSONAL operations (system stats, own account, own models): 
 *   → Always use own localhost backend. Never route through host. 
 * 
 * Host URL storage is now PER-CLUSTER (a node can be a member of more than
 * one cluster, each with a different host/tunnel — a single global key was
 * silently sharing one URL across all of them). Each entry also carries a
 * `savedAt` timestamp so a URL that hasn't worked in a long time (default 24h)
 * is treated as stale rather than retried forever — see HOST_URL_TTL_MS.
 */

const HOST_URL_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const hostUrlKey = (clusterId) => `hostUrl:${clusterId}`;

/** Persist the last-known-good host URL for a specific cluster, with a fresh timestamp. */
export const saveClusterHostUrl = (clusterId, url) => {
    if (!clusterId || !url) return;
    localStorage.setItem(hostUrlKey(clusterId), JSON.stringify({ url, savedAt: Date.now() }));
    // Legacy global key kept in sync as a last-resort fallback for any code path
    // that reads it before a clusterId is known (e.g. right after redirect).
    localStorage.setItem('clusterBackendUrl', url);
};

/** Read the stored host URL for a cluster, or null if missing/expired. */
export const getClusterHostUrl = (clusterId) => {
    if (!clusterId) return null;
    try {
        const raw = localStorage.getItem(hostUrlKey(clusterId));
        if (!raw) return null;
        const { url, savedAt } = JSON.parse(raw);
        if (!url) return null;
        if (Date.now() - savedAt > HOST_URL_TTL_MS) return null; // stale — don't auto-trust
        return url;
    } catch {
        return null;
    }
};

/** True if a cluster has a stored URL that hasn't expired. Lets callers tell
 *  "never had one" / "expired" apart from "have one, just currently failing". */
export const hasFreshClusterHostUrl = (clusterId) => getClusterHostUrl(clusterId) !== null;

export const clearClusterHostUrl = (clusterId) => {
    if (clusterId) localStorage.removeItem(hostUrlKey(clusterId));
};

export const getClusterAPI = (clusterId) => {
    const cId = clusterId || sessionStorage.getItem('clusterId');
    const stored = cId ? getClusterHostUrl(cId) : null;
    return stored
        || localStorage.getItem('clusterBackendUrl')
        || import.meta.env.VITE_API_URL
        || 'http://localhost:8081';
};

export const getLocalAPI = () => 
    import.meta.env.VITE_API_URL || 'http://localhost:8081'; 
 
export const getAiAPI = () => 
    import.meta.env.VITE_AI_API_URL || 'http://localhost:8000'; 
 
export const clearClusterSession = () => { 
    localStorage.removeItem('clusterBackendUrl'); 
    console.log('Cluster session cleared — reverted to local backend.'); 
}; 

/**
 * Global 401 handling. A 401 means the JWT was missing/invalid/expired (the
 * backend's SecurityConfiguration returns 401 specifically for that, distinct
 * from a legitimate 403 access-denied — see its authenticationEntryPoint).
 * `ProtectedRoute` in App.jsx only checks that a token is PRESENT in
 * localStorage, not that it's still valid, so a stale token (e.g. left over
 * from weeks ago) otherwise leaves the user stuck on a page where every
 * backend call silently 401/403s forever with no explanation. This patches
 * window.fetch once, at startup, to catch that specific case and bounce back
 * to /login with a message — without touching legitimate 403s (host-only
 * actions, etc.) or 401s from calls that never had a token to begin with
 * (e.g. a failed login attempt itself).
 */
let authFetchPatched = false;
export const installAuthFetchInterceptor = () => {
    if (authFetchPatched) return;
    authFetchPatched = true;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const response = await realFetch(...args);
        if (response.status === 401) {
            const init = args[1] || {};
            const h = init.headers;
            const authHeader = h instanceof Headers
                ? (h.get('Authorization') || h.get('authorization'))
                : (h?.Authorization || h?.authorization);
            if (authHeader && localStorage.getItem('token')) {
                localStorage.removeItem('token');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('accountName');
                localStorage.removeItem('userId');
                sessionStorage.setItem('sessionExpired', '1');
                const p = window.location.pathname;
                if (!['/login', '/register', '/', '/license'].includes(p)) {
                    window.location.href = '/login';
                }
            }
        }
        return response;
    };
};
