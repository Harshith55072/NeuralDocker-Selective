package com.example.Neural_docker_selective_backend.service; 
 
import com.example.Neural_docker_selective_backend.model.Cluster; 
import com.example.Neural_docker_selective_backend.model.User; 
import com.example.Neural_docker_selective_backend.repository.ClusterRepository; 
import com.example.Neural_docker_selective_backend.repository.UserRepository; 
import org.springframework.scheduling.annotation.Scheduled; 
import org.springframework.stereotype.Service; 
import org.springframework.transaction.annotation.Transactional; 
import org.springframework.web.client.RestTemplate; 
 
import java.util.List; 
 
@Service 
public class NodeRecoveryService { 
 
    private final UserRepository userRepository; 
    private final ClusterRepository clusterRepository; 
    private final RestTemplate restTemplate; 
 
    public NodeRecoveryService(UserRepository userRepository, ClusterRepository clusterRepository, RestTemplate restTemplate) { 
        this.userRepository = userRepository; 
        this.clusterRepository = clusterRepository; 
        this.restTemplate = restTemplate; 
    } 
 
    // Runs every 40 seconds — matches default recoveryPingInterval 
    // Spring's @Scheduled fixedDelay means it waits 40s AFTER the last run finishes 
    // so overlapping pings can't stack up if a round takes longer than expected 
    @Scheduled(fixedDelay = 40000) 
    @Transactional 
    public void pingOfflineNodes() { 
        // Find all offline nodes across all clusters 
        List<User> offlineNodes = userRepository.findAll().stream() 
                .filter(u -> u.getClusterId() != null && Boolean.FALSE.equals(u.getIsOnline())) 
                .toList(); 
 
        if (offlineNodes.isEmpty()) { 
            return; 
        } 
 
        System.out.println("Recovery check: found " + offlineNodes.size() + " offline node(s)."); 
 
        for (User node : offlineNodes) { 
            // Get the cluster's configured ping interval 
            Cluster cluster = clusterRepository.findById(node.getClusterId()).orElse(null); 
            if (cluster == null) continue; 
 
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
