package com.example.Neural_docker_selective_backend.controller;

import com.example.Neural_docker_selective_backend.model.Cluster;
import com.example.Neural_docker_selective_backend.model.ModelInstance;
import com.example.Neural_docker_selective_backend.model.User;
import com.example.Neural_docker_selective_backend.model.UserClusterMembership;
import com.example.Neural_docker_selective_backend.repository.ClusterRepository;
import com.example.Neural_docker_selective_backend.repository.ModelInstanceRepository;
import com.example.Neural_docker_selective_backend.repository.UserClusterMembershipRepository;
import com.example.Neural_docker_selective_backend.repository.UserRepository;
import com.example.Neural_docker_selective_backend.service.ClusterService;
import com.example.Neural_docker_selective_backend.service.ConsensusService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/clusters")
public class ClusterController {

    private final ClusterService clusterService;
    private final ConsensusService consensusService;
    private final UserRepository userRepository;
    private final ModelInstanceRepository modelInstanceRepository;
    private final ClusterRepository clusterRepository;
    private final UserClusterMembershipRepository membershipRepository;

    public ClusterController(ClusterService clusterService, ConsensusService consensusService,
            UserRepository userRepository,
            ModelInstanceRepository modelInstanceRepository,
            ClusterRepository clusterRepository,
            UserClusterMembershipRepository membershipRepository) {
        this.clusterService = clusterService;
        this.consensusService = consensusService;
        this.userRepository = userRepository;
        this.modelInstanceRepository = modelInstanceRepository;
        this.clusterRepository = clusterRepository;
        this.membershipRepository = membershipRepository;
    }

    // ── Helper ────────────────────────────────────────────────────────────────
    private Integer requireClusterId(Map<String, Object> payload, String key) {
        Object val = payload.get(key);
        if (val == null) throw new RuntimeException("clusterId is required");
        return val instanceof Number ? ((Number) val).intValue() : Integer.parseInt(val.toString());
    }

    // ── Consensus — now requires clusterId in body ────────────────────────────────
    @PostMapping("/consensus/ask")
    public ResponseEntity<?> askConsensus(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            String prompt = (String) payload.get("prompt");
            String systemPrompt = (String) payload.getOrDefault("system_prompt", "You are a helpful AI assistant.");
            Boolean skipPostSession = Boolean.TRUE.equals(payload.get("skipPostSession"));
            return ResponseEntity.ok(consensusService.runConsensus(
                    authentication.getName(), prompt, systemPrompt, clusterId, skipPostSession));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/pipeline/consensus/ask")
    public ResponseEntity<?> pipelineConsensusAsk(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            String prompt = (String) payload.get("prompt");
            String systemPrompt = (String) payload.getOrDefault("system_prompt", "You are a helpful AI assistant.");
            return ResponseEntity.ok(consensusService.runPipelineConsensus(
                    authentication.getName(), prompt, systemPrompt, clusterId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Ask single model — now requires clusterId ─────────────────────────────
    @PostMapping("/models/{modelId}/ask")
    public ResponseEntity<?> askSingleModel(
            @PathVariable Integer modelId,
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        String userEmail = authentication.getName();
        String prompt = (String) payload.get("prompt");
        String systemPrompt = (String) payload.getOrDefault("system_prompt", "You are a helpful AI assistant.");
        Object cIdRaw = payload.get("clusterId");
        if (cIdRaw == null) return ResponseEntity.badRequest().body(Map.of("error", "clusterId required"));
        Integer clusterId = cIdRaw instanceof Number ? ((Number) cIdRaw).intValue()
                : Integer.parseInt(cIdRaw.toString());
        try {
            User requestingUser = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            boolean isHost = membershipRepository
                    .findByUserIdAndClusterId(requestingUser.getId(), clusterId)
                    .map(UserClusterMembership::getIsHost).orElse(false);
            if (!isHost) return ResponseEntity.status(403)
                    .body(Map.of("error", "Only the cluster host can query models"));

            ModelInstance model = modelInstanceRepository.findById(modelId)
                    .orElseThrow(() -> new RuntimeException("Model not found"));
            User targetNode = userRepository.findById(model.getSystemId())
                    .orElseThrow(() -> new RuntimeException("Node not found"));

            if (!Boolean.TRUE.equals(targetNode.getIsOnline()))
                return ResponseEntity.status(503).body(Map.of("error", "Node is offline"));

            Map<String, String> body = Map.of("prompt", prompt, "system_prompt", systemPrompt);
            Object response = clusterService.proxyModelRequest(
                    userEmail, clusterId, targetNode.getId(), "/api/consensus/generate", "POST", body);

            if (response instanceof List) {
                List<Map<String, Object>> responses = (List<Map<String, Object>>) response;
                Map<String, Object> modelResponse = responses.stream()
                        .filter(r -> model.getName().equals(r.get("model")))
                        .findFirst()
                        .orElse(responses.isEmpty() ? null : responses.get(0));
                if (modelResponse != null) return ResponseEntity.ok(Map.of(
                        "answer", modelResponse.getOrDefault("answer", ""),
                        "model", modelResponse.getOrDefault("model", model.getName())));
            }
            return ResponseEntity.status(502).body(Map.of("error", "No response from model"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Settings — now requires clusterId in body ─────────────────────────────
    @PostMapping("/update-settings")
    public ResponseEntity<?> updateSettings(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            Double temperature = payload.get("temperature") != null
                    ? ((Number) payload.get("temperature")).doubleValue() : null;
            return ResponseEntity.ok(clusterService.updateClusterSettings(
                    authentication.getName(), clusterId,
                    (Boolean) payload.get("autoRotate"),
                    (Boolean) payload.get("weightedVoting"),
                    payload.get("sessionLimit") != null ? ((Number) payload.get("sessionLimit")).intValue() : null,
                    payload.get("sessionAnswers") != null ? ((Number) payload.get("sessionAnswers")).intValue() : null,
                    payload.get("maxNodeTimeouts") != null ? ((Number) payload.get("maxNodeTimeouts")).intValue() : null,
                    payload.get("recoveryPingInterval") != null ? ((Number) payload.get("recoveryPingInterval")).intValue() : null,
                    payload.get("nodeTimeoutSeconds") != null ? ((Number) payload.get("nodeTimeoutSeconds")).intValue() : null,
                    payload.get("discussionRounds") != null ? ((Number) payload.get("discussionRounds")).intValue() : null,
                    payload.get("maxTokens") != null ? ((Number) payload.get("maxTokens")).intValue() : null,
                    temperature,
                    (String) payload.get("scoringMode"),
                    (Boolean) payload.get("autoQueue"),
                    (Boolean) payload.get("sessionHistory"),
                    (Boolean) payload.get("enableDiscussion"),
                    (Boolean) payload.get("anonymousDiscussion"),
                    (String) payload.get("discussionBasePrompt")));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Reset cluster scores ───────────────────────────────────────────────────
    @PostMapping("/reset-scores")
    public ResponseEntity<?> resetScores(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            int count = clusterService.resetClusterScores(authentication.getName(), clusterId);
            return ResponseEntity.ok(Map.of("status", "reset", "modelsReset", count));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Delete skeleton slots ───────────────────────────────────────────────────
    @DeleteMapping("/skeletons")
    public ResponseEntity<?> deleteSkeletons(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            int count = clusterService.deleteClusterSkeletons(authentication.getName(), clusterId);
            return ResponseEntity.ok(Map.of("deleted", count));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/update-model-folder")
    public ResponseEntity<Void> updateModelFolder(
            @RequestBody Map<String, String> payload,
            Authentication authentication) {
        clusterService.updateUserModelFolder(authentication.getName(), payload.get("folder"));
        return ResponseEntity.ok().build();
    }

    // ── Create ────────────────────────────────────────────────────────────────
    @PostMapping("/create")
    public ResponseEntity<?> createCluster(
            @RequestBody Map<String, Object> payload,
            Authentication authentication,
            HttpServletRequest request) {
        try {
            return ResponseEntity.ok(clusterService.createCluster(
                    (String) payload.get("name"),
                    (Boolean) payload.get("isPublic"),
                    (String) payload.get("password"),
                    authentication.getName(),
                    request.getRemoteAddr()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Get my tunnel URL ─────────────────────────────────────────────────────
    @GetMapping("/my-tunnel")
    public ResponseEntity<?> getMyTunnel(Authentication authentication) {
        return ResponseEntity.ok(Map.of("tunnelUrl", clusterService.getMyTunnelUrl(authentication.getName())));
    }

    // ── Join ──────────────────────────────────────────────────────────────────
    @PostMapping("/join/{id}")
    public ResponseEntity<?> joinCluster(
            @PathVariable Integer id,
            @RequestBody(required = false) Map<String, Object> payload,
            Authentication authentication,
            HttpServletRequest request) {
        try {
            String password = payload != null ? (String) payload.get("password") : null;
            String accountName = payload != null ? (String) payload.get("accountName") : null;
            String workerTunnelUrl = payload != null ? (String) payload.get("workerTunnelUrl") : null;
            String hostTunnelUrl = clusterService.joinCluster(
                    id, password, authentication.getName(), request.getRemoteAddr(), accountName, workerTunnelUrl);
            return ResponseEntity.ok(Map.of(
                    "status", "joined",
                    "hostTunnelUrl", hostTunnelUrl != null ? hostTunnelUrl : ""));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/join-by-id")
    public ResponseEntity<?> joinClusterById(
            @RequestBody Map<String, Object> payload,
            Authentication authentication,
            HttpServletRequest request) {
        try {
            String clusterIdStr = (String) payload.get("clusterId");
            Integer clusterId = Integer.parseInt(clusterIdStr.replace("cla_", ""));
            String password = (String) payload.get("password");
            String accountName = (String) payload.get("accountName");
            String workerTunnelUrl = (String) payload.get("workerTunnelUrl");
            String hostTunnelUrl = clusterService.joinCluster(
                    clusterId, password,
                    authentication.getName(), request.getRemoteAddr(), accountName, workerTunnelUrl);
            return ResponseEntity.ok(Map.of(
                    "status", "joined",
                    "hostTunnelUrl", hostTunnelUrl != null ? hostTunnelUrl : ""));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Leave — now requires clusterId in body ────────────────────────────────
    @PostMapping("/leave")
    public ResponseEntity<?> leaveCluster(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            clusterService.leaveCluster(authentication.getName(), clusterId);
            return ResponseEntity.ok(Map.of("status", "left"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Tunnel registration (unchanged) ───────────────────────────────────────
    @PostMapping("/register-tunnel")
    public ResponseEntity<?> registerTunnel(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal UserDetails userDetails,
            HttpServletRequest request) {
        try {
            String aiTunnelUrl = body.get("tunnelUrl");
            String backendTunnelUrl = body.get("backendTunnelUrl");
            if (aiTunnelUrl == null || aiTunnelUrl.isBlank())
                return ResponseEntity.badRequest().body(Map.of("error", "tunnelUrl is required"));

            // Check if this is a real user (JWT) vs a service call (service token)
            boolean isRealUser = userDetails != null
                    && userRepository.findByEmail(userDetails.getUsername()).isPresent();

            if (isRealUser) {
                // A logged-in user is registering their own tunnel URL
                clusterService.registerTunnel(userDetails.getUsername(), aiTunnelUrl);
                return ResponseEntity.ok(Map.of("status", "registered", "tunnelUrl", aiTunnelUrl));
            }

            // Registers for every cluster this machine hosts. IP-based per-host
            // matching was removed here: the registering container's address
            // (Docker bridge network) and User.systemIp (captured from the
            // browser's address through the host-mapped port) live in disjoint
            // address spaces and could never match in this compose topology —
            // it was dead code that always fell through to this call anyway.
            // A single docker-compose stack only ever runs one ngrok + one
            // backend, so "every cluster this machine hosts" is the correct scope.
            clusterService.registerTunnelForAllHosts(aiTunnelUrl, backendTunnelUrl);
            return ResponseEntity.ok(Map.of("status", "registered"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Cluster lookups ───────────────────────────────────────────────────────
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAllClusters() {
        // Sanitized DTO, matching the /public pattern — nothing in the frontend
        // calls this endpoint today, but it had no auth and returned every
        // cluster's raw password, so it's fixed the same way regardless.
        List<Map<String, Object>> clusters = clusterService.getAllClusters().stream()
                .map(c -> {
                    Map<String, Object> info = new HashMap<>();
                    info.put("id", c.getId());
                    info.put("name", c.getName());
                    info.put("isPublic", c.getIsPublic());
                    info.put("hostId", c.getHostId());
                    info.put("hasPassword", c.getPassword() != null && !c.getPassword().isBlank());
                    info.put("maxModels", c.getMaxModels());
                    info.put("sessionLimit", c.getSessionLimit());
                    return info;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(clusters);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getCluster(@PathVariable Integer id, Authentication authentication) {
        try {
            Optional<Cluster> cluster = clusterService.getCluster(authentication.getName(), id);
            if (cluster.isPresent()) return ResponseEntity.ok(cluster.get());
            return ResponseEntity.notFound().build();
        } catch (RuntimeException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        }
    }

    // Returns ALL clusters the user belongs to
    @GetMapping("/my-clusters")
    public ResponseEntity<?> getMyClusters(Authentication authentication) {
        try {
            return ResponseEntity.ok(clusterService.getUserMemberships(authentication.getName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // Legacy single-cluster endpoint — kept for backward compat
    @GetMapping("/my-cluster")
    public ResponseEntity<Cluster> getMyCluster(Authentication authentication) {
        return clusterService.getClusterByUserEmail(authentication.getName())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    // ── Systems — now requires clusterId param ────────────────────────────────
    @GetMapping("/systems")
    public ResponseEntity<?> getClusterSystems(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User requestingUser = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));
            if (!membershipRepository.existsByUserIdAndClusterId(requestingUser.getId(), clusterId)) {
                return ResponseEntity.ok(List.of());
            }
            List<Map<String, Object>> result = membershipRepository.findByClusterId(clusterId).stream()
                    .map(m -> {
                        User u = userRepository.findById(m.getUserId()).orElse(null);
                        if (u == null) return null;
                        Map<String, Object> entry = new HashMap<>();
                        entry.put("id", u.getId());
                        entry.put("accountName", u.getAccountName());
                        entry.put("email", u.getEmail());
                        entry.put("isHost", m.getIsHost());
                        entry.put("score", u.getScore());
                        entry.put("wins", u.getWins());
                        entry.put("losses", u.getLosses());
                        entry.put("votes", u.getVotes());
                        entry.put("isOnline", u.getIsOnline());
                        entry.put("resourcePermissionGranted", m.getResourcePermissionGranted());
                        return entry;
                    })
                    .filter(e -> e != null)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Proxy — now requires clusterId param ──────────────────────────────────
    @GetMapping("/proxy/models/scan")
    public ResponseEntity<?> proxyScan(
            @RequestParam Integer clusterId,
            @RequestParam Integer targetId,
            @RequestParam(required = false) String path,
            Authentication authentication) {
        try {
            String endpoint = "/api/models/scan" + (path != null && !path.isEmpty() ? "?path=" + path : "");
            return ResponseEntity.ok(clusterService.proxyModelRequest(
                    authentication.getName(), clusterId, targetId, endpoint, "GET", null));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/proxy/models/load")
    public ResponseEntity<?> proxyLoad(
            @RequestParam Integer clusterId,
            @RequestParam Integer targetId,
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(clusterService.proxyModelRequest(
                    authentication.getName(), clusterId, targetId, "/api/models/load", "POST", body));
        } catch (RuntimeException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("NODE_BUSY:")) {
                return ResponseEntity.status(503).body(Map.of(
                        "status", "busy",
                        "message", "Node is currently loading another model. Retry shortly.",
                        "raw", e.getMessage().substring("NODE_BUSY:".length())));
            }
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/proxy/models/unload")
    public ResponseEntity<?> proxyUnload(
            @RequestParam Integer clusterId,
            @RequestParam Integer targetId,
            @RequestParam String name,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(clusterService.proxyModelRequest(
                    authentication.getName(), clusterId, targetId,
                    "/api/models/unload?name=" + name, "POST", null));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/proxy/models/active")
    public ResponseEntity<?> proxyActive(
            @RequestParam Integer clusterId,
            @RequestParam Integer targetId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(clusterService.proxyModelRequest(
                    authentication.getName(), clusterId, targetId, "/api/models/active", "GET", null));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/proxy/system-stats")
    public ResponseEntity<?> proxySystemStats(
            @RequestParam Integer clusterId,
            @RequestParam Integer targetId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(clusterService.proxyModelRequest(
                    authentication.getName(), clusterId, targetId, "/api/system-stats", "GET", null));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Cluster models — now requires clusterId param ─────────────────────────
    @GetMapping("/proxy/models/active-cluster")
    public ResponseEntity<?> getClusterModels(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(clusterService.getClusterModels(authentication.getName(), clusterId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Sync runtime models ───────────────────────────────────────────────────
    @PostMapping("/sync-runtime-models")
    public ResponseEntity<?> syncRuntimeModels(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            List<String> activeNames = (List<String>) payload.get("activeModelNames");
            clusterService.syncRuntimeModels(authentication.getName(), activeNames);
            return ResponseEntity.ok(Map.of("status", "synced"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Node recovery — now uses membership table ─────────────────────────────
    @PostMapping("/nodes/{nodeId}/recover")
    public ResponseEntity<?> recoverNode(
            @PathVariable Integer nodeId,
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            consensusService.manuallyRecoverNode(authentication.getName(), clusterId, nodeId);
            return ResponseEntity.ok(Map.of("status", "recovered", "nodeId", nodeId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/nodes/recover-all")
    public ResponseEntity<?> recoverAllNodes(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            String userEmail = authentication.getName();
            User requestingUser = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            boolean isHost = membershipRepository
                    .findByUserIdAndClusterId(requestingUser.getId(), clusterId)
                    .map(UserClusterMembership::getIsHost).orElse(false);
            if (!isHost) return ResponseEntity.status(403)
                    .body(Map.of("error", "Only the host can recover nodes"));

            List<Integer> memberIds = membershipRepository.findByClusterId(clusterId)
                    .stream().map(UserClusterMembership::getUserId).collect(Collectors.toList());

            List<User> offlineNodes = userRepository.findAllById(memberIds).stream()
                    .filter(u -> Boolean.FALSE.equals(u.getIsOnline()))
                    .collect(Collectors.toList());

            for (User node : offlineNodes) {
                node.setIsOnline(true);
                node.setConsecutiveTimeouts(0);
                userRepository.save(node);
            }

            return ResponseEntity.ok(Map.of(
                    "recovered", offlineNodes.size(),
                    "nodes", offlineNodes.stream().map(User::getEmail).collect(Collectors.toList())));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Node/model status ─────────────────────────────────────────────────────
    @GetMapping("/nodes/status")
    public ResponseEntity<?> getNodeStatuses(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(consensusService.getNodeStatuses(authentication.getName(), clusterId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/models/notes")
    public ResponseEntity<?> getModelNotes(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(consensusService.getModelNotes(authentication.getName(), clusterId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Live discussion feed — polled by the frontend during post-session
    // discussion so messages appear as models respond, instead of waiting for
    // the whole round to finish. Backed by ConsensusService's in-memory feed
    // (pushDiscussionMessage/pollDiscussionMessages), which was written and
    // used internally by runDiscussion() but never had an HTTP route wired to
    // it — every poll from ClusterDashboard.jsx was 404ing silently (caught
    // and swallowed client-side), so the live discussion panel never actually
    // updated in real time. ─────────────────────────────────────────────────
    @GetMapping("/discussion/live")
    public ResponseEntity<?> getLiveDiscussion(
            @RequestParam Integer clusterId,
            @RequestParam(defaultValue = "0") Integer since,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User requestingUser = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));
            if (!membershipRepository.existsByUserIdAndClusterId(requestingUser.getId(), clusterId)) {
                return ResponseEntity.status(403).body(Map.of("error", "Not a member of this cluster"));
            }
            List<Map<String, Object>> messages = ConsensusService.pollDiscussionMessages(clusterId, since);
            return ResponseEntity.ok(Map.of("messages", messages));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Durable consensus history — backs the History panel across sessions/devices ──
    @GetMapping("/consensus/history")
    public ResponseEntity<?> getConsensusHistory(
            @RequestParam Integer clusterId,
            @RequestParam(required = false, defaultValue = "100") Integer limit,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(
                    consensusService.getConsensusHistory(authentication.getName(), clusterId, limit));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Discussion prompt — now requires clusterId ────────────────────────────
    @PostMapping("/discussion-prompt")
    public ResponseEntity<?> updateDiscussionPrompt(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            clusterService.updateDiscussionPrompt(
                    authentication.getName(), clusterId, (String) payload.get("discussionBasePrompt"));
            return ResponseEntity.ok(Map.of("status", "updated"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Public clusters ───────────────────────────────────────────────────────
    @GetMapping("/public")
    public ResponseEntity<List<Map<String, Object>>> getPublicClusters() {
        List<Map<String, Object>> publicClusters = clusterService.getAllClusters().stream()
                .filter(c -> Boolean.TRUE.equals(c.getIsPublic()))
                .map(c -> {
                    Map<String, Object> info = new HashMap<>();
                    info.put("id", c.getId());
                    info.put("displayId", "cla_" + c.getId());
                    info.put("name", c.getName());
                    info.put("isPublic", c.getIsPublic());
                    info.put("hasPassword", c.getPassword() != null && !c.getPassword().isBlank());
                    info.put("maxModels", c.getMaxModels());
                    info.put("sessionLimit", c.getSessionLimit());
                    return info;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(publicClusters);
    }

    @GetMapping("/public/{id}")
    public ResponseEntity<?> getPublicClusterById(@PathVariable Integer id) {
        return clusterService.getCluster(id).map(c -> {
            if (!Boolean.TRUE.equals(c.getIsPublic()))
                return ResponseEntity.status(403).body((Object) Map.of("error", "This cluster is private"));
            Map<String, Object> info = new HashMap<>();
            info.put("id", c.getId());
            info.put("displayId", "cla_" + c.getId());
            info.put("name", c.getName());
            info.put("isPublic", c.getIsPublic());
            info.put("hasPassword", c.getPassword() != null && !c.getPassword().isBlank());
            info.put("maxModels", c.getMaxModels());
            info.put("sessionLimit", c.getSessionLimit());
            return ResponseEntity.ok((Object) info);
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── API endpoints ─────────────────────────────────────────────────────────
    @GetMapping("/api-endpoints")
    public ResponseEntity<?> getApiEndpoints(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User requestingUser = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            boolean isHost = membershipRepository
                    .findByUserIdAndClusterId(requestingUser.getId(), clusterId)
                    .map(UserClusterMembership::getIsHost).orElse(false);
            if (!isHost) return ResponseEntity.status(403)
                    .body(Map.of("error", "Only the cluster host can access API endpoints"));

            Cluster cluster = clusterRepository.findById(clusterId)
                    .orElseThrow(() -> new RuntimeException("Cluster not found"));

            List<Map<String, Object>> endpoints = modelInstanceRepository
                    .findByClusterId(clusterId).stream().map(m -> {
                        Map<String, Object> entry = new HashMap<>();
                        entry.put("modelId", m.getId());
                        entry.put("modelName", m.getName());
                        entry.put("systemId", m.getSystemId());
                        entry.put("gpuLayers", m.getGpuLayers());
                        entry.put("score", m.getScore());
                        entry.put("votes", m.getVotes());
                        userRepository.findById(m.getSystemId()).ifPresent(node -> {
                            entry.put("nodeName", node.getAccountName());
                            entry.put("nodeEmail", node.getEmail());
                            entry.put("isOnline", node.getIsOnline());
                            entry.put("tunnelUrl", node.getTunnelUrl());
                            entry.put("systemIp", node.getSystemIp());
                        });
                        return entry;
                    }).collect(Collectors.toList());

            Map<String, Object> result = new HashMap<>();
            result.put("clusterId", cluster.getId());
            result.put("clusterName", cluster.getName());
            result.put("models", endpoints);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Resource permissions — now per cluster ────────────────────────────────
    @PostMapping("/my-permission")
    public ResponseEntity<?> setMyPermission(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            Integer clusterId = requireClusterId(payload, "clusterId");
            boolean granted = Boolean.TRUE.equals(payload.get("granted"));
            clusterService.setResourcePermission(authentication.getName(), clusterId, granted);
            return ResponseEntity.ok(Map.of("status", "updated"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/node-permissions")
    public ResponseEntity<?> getNodePermissions(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(
                    clusterService.getNodePermissions(authentication.getName(), clusterId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Auto-assign best node ─────────────────────────────────────────────────
    @GetMapping("/best-node")
    public ResponseEntity<?> getBestNode(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(
                    clusterService.findBestAvailableNode(authentication.getName(), clusterId));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}