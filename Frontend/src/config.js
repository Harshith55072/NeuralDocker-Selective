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
 * The clusterBackendUrl is saved to localStorage on join and cleared on leave. 
 */ 
 
export const getClusterAPI = () => 
    localStorage.getItem('clusterBackendUrl') 
    || import.meta.env.VITE_API_URL 
    || 'http://localhost:8081'; 
 
export const getLocalAPI = () => 
    import.meta.env.VITE_API_URL || 'http://localhost:8081'; 
 
export const getAiAPI = () => 
    import.meta.env.VITE_AI_API_URL || 'http://localhost:8000'; 
 
export const clearClusterSession = () => { 
    localStorage.removeItem('clusterBackendUrl'); 
    console.log('Cluster session cleared — reverted to local backend.'); 
}; 
