package com.example.Neural_docker_selective_backend.service; 
 
import com.example.Neural_docker_selective_backend.model.Cluster; 
import com.example.Neural_docker_selective_backend.model.User; 
import com.example.Neural_docker_selective_backend.repository.ClusterRepository; 
import com.example.Neural_docker_selective_backend.repository.UserRepository; 
import org.springframework.scheduling.annotation.Scheduled; 
import org.springframework.stereotype.Service; 
import org.springframework.transaction.annotation.Transactional; 
import org.springframework.web.client.RestTemplate; 
 
import java.time.Instant; 
import java.util.List; 
import java.util.Map; 
import java.util.concurrent.ConcurrentHashMap; 
 
@Service 
public class NodeRecoveryService { 
 
    private final UserRepository userRepository; 
    private final ClusterRepository clusterRepository; 
    private final RestTemplate restTemplate; 
 
    // Tracks the last recovery-ping attempt per user id so each cluster's
    // configured recoveryPingInterval can actually be honored even though the
    // scheduler itself ticks on a fixed, finer-grained cadence (see below).
    private final Map<Integer, Instant> lastAttempt = new ConcurrentHashMap<>();
 
    public NodeRecoveryService(UserRepository userRepository, ClusterRepository clusterRepository, RestTemplate restTemplate) { 
        this.userRepository = userRepository; 
        this.clusterRepository = clusterRepository; 
        this.restTemplate = restTemplate; 
    } 
 
    // Ticks every 5 seconds so we can honor recoveryPingInterval values as low
    // as the UI's configured minimum (10s) with reasonable precision. This used
    // to be a flat 40s tick that ignored the per-cluster setting entirely —
    // recoveryPingInterval was saved and displayed in ClusterSettings but had
    // no effect on actual ping behavior. Now each node is only actually pinged
    // once at least cluster.getRecoveryPingInterval() seconds have passed
    // since its last attempt; the 5s tick is just the scheduler's granularity.
    @Scheduled(fixedDelay = 5000) 
    @Transactional 
    public void pingOfflineNodes() { 
        // Find all offline nodes across all clusters 
        List<User> offlineNodes = userRepository.findAll().stream() 
                .filter(u -> u.getClusterId() != null && Boolean.FALSE.equals(u.getIsOnline())) 
                .toList(); 
 
        if (offlineNodes.isEmpty()) { 
            return; 
        } 
 
        for (User node : offlineNodes) { 
            // Get the cluster's configured ping interval 
            Cluster cluster = clusterRepository.findById(node.getClusterId()).orElse(null); 
            if (cluster == null) continue; 

            int intervalSeconds = cluster.getRecoveryPingInterval();
            Instant last = lastAttempt.get(node.getId());
            if (last != null && Instant.now().isBefore(last.plusSeconds(intervalSeconds))) {
                continue; // not due yet for this node's cluster interval
            }

            lastAttempt.put(node.getId(), Instant.now());
            tryRecoverNode(node); 
        } 
    } 
 
    private void tryRecoverNode(User node) { 
        String pingUrl = getSystemUrl(node) + "/api/system-stats"; 
 
        try { 
            restTemplate.getForObject(pingUrl, Object.class); 
 
            // Ping succeeded — bring node back online 
            node.setIsOnline(true); 
            node.setConsecutiveTimeouts(0); 
            userRepository.save(node); 
            System.out.println("Auto-recovered node: " + node.getEmail() + 
                " is back online."); 
 
        } catch (Exception e) { 
            // Still offline — log but don't change anything 
            System.out.println("Recovery ping failed for " + node.getEmail() + 
                ": still unreachable. (" + e.getMessage() + ")"); 
        } 
    } 
 
    private String getSystemUrl(User sys) { 
        String tunnelUrl = sys.getTunnelUrl(); 
        if (tunnelUrl != null && !tunnelUrl.isBlank()) { 
            return tunnelUrl.endsWith("/") 
                ? tunnelUrl.substring(0, tunnelUrl.length() - 1) 
                : tunnelUrl; 
        } 
        String ip = sys.getSystemIp(); 
        if (ip == null || ip.isEmpty() || ip.equals("0:0:0:0:0:0:0:1")) { 
            ip = "127.0.0.1"; 
        } 
        return "http://" + ip + ":8000"; 
    } 
} 
