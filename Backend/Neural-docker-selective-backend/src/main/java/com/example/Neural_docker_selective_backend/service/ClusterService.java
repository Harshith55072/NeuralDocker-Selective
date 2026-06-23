package com.example.Neural_docker_selective_backend.service;

import com.example.Neural_docker_selective_backend.model.Cluster;
import com.example.Neural_docker_selective_backend.model.ModelInstance;
import com.example.Neural_docker_selective_backend.model.User;
import com.example.Neural_docker_selective_backend.model.Role;
import com.example.Neural_docker_selective_backend.model.UserClusterMembership;
import com.example.Neural_docker_selective_backend.repository.ClusterRepository;
import com.example.Neural_docker_selective_backend.repository.ModelInstanceRepository;
import com.example.Neural_docker_selective_backend.repository.UserRepository;
import com.example.Neural_docker_selective_backend.repository.UserClusterMembershipRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ClusterService {

    private final ClusterRepository clusterRepository;
    private final UserRepository userRepository;
    private final ModelInstanceRepository modelInstanceRepository;
    private final UserClusterMembershipRepository membershipRepository;
    private final RestTemplate restTemplate;
    private final RestTemplate modelLoadRestTemplate;

    @Value("${microservice.gateway.host:ai-service}")
    private String gatewayHost;

    @Value("${microservice.gateway.port:8000}")
    private int gatewayPort;

    public ClusterService(ClusterRepository clusterRepository, UserRepository userRepository,
            ModelInstanceRepository modelInstanceRepository,
            UserClusterMembershipRepository membershipRepository,
            RestTemplate restTemplate,
            @org.springframework.beans.factory.annotation.Qualifier("modelLoadRestTemplate") RestTemplate modelLoadRestTemplate) {
        this.clusterRepository = clusterRepository;
        this.userRepository = userRepository;
        this.modelInstanceRepository = modelInstanceRepository;
        this.membershipRepository = membershipRepository;
        this.restTemplate = restTemplate;
        this.modelLoadRestTemplate = modelLoadRestTemplate;
    }

    // ── Helper: get membership or throw ──────────────────────────────────────
    private UserClusterMembership getMembership(Integer userId, Integer clusterId) {
        return membershipRepository.findByUserIdAndClusterId(userId, clusterId)
                .orElseThrow(() -> new RuntimeException("User is not a member of this cluster"));
    }

    private boolean isHostOfCluster(Integer userId, Integer clusterId) {
        // Primary: check membership table
        boolean viaTable = membershipRepository.findByUserIdAndClusterId(userId, clusterId)
                .map(UserClusterMembership::getIsHost)
                .orElse(false);
        if (viaTable) return true;
        // Fallback: check cluster.hostId directly (handles missing membership rows)
        return clusterRepository.findById(clusterId)
                .map(c -> userId.equals(c.getHostId()))
                .orElse(false);
    }

    // ── updateClusterSettings ─────────────────────────────────────────────────
    @Transactional
    public Cluster updateClusterSettings(String userEmail, Integer clusterId,
            Boolean autoRotate, Boolean weightedVoting,
            Integer sessionLimit, Integer sessionAnswers, Integer maxNodeTimeouts,
            Integer recoveryPingInterval, Integer nodeTimeoutSeconds, Integer discussionRounds,
            Integer maxTokens, Double temperature, String scoringMode, Boolean autoQueue,
            Boolean enableDiscussion, Boolean anonymousDiscussion, String discussionBasePrompt) {

        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(user.getId(), clusterId)) {
            throw new RuntimeException("Only the host can update cluster settings");
        }

        Cluster cluster = clusterRepository.findById(clusterId)
                .orElseThrow(() -> new RuntimeException("Cluster not found"));

        if (autoRotate != null) cluster.setAutoRotate(autoRotate);
        if (weightedVoting != null) cluster.setWeightedVoting(weightedVoting);
        if (sessionLimit != null) cluster.setSessionLimit(sessionLimit);
        if (sessionAnswers != null) cluster.setSessionAnswers(sessionAnswers);
        if (maxNodeTimeouts != null) cluster.setMaxNodeTimeouts(maxNodeTimeouts);
        if (recoveryPingInterval != null) cluster.setRecoveryPingInterval(recoveryPingInterval);
        if (nodeTimeoutSeconds != null) cluster.setNodeTimeoutSeconds(nodeTimeoutSeconds);
        if (discussionRounds != null) cluster.setDiscussionRounds(discussionRounds);
        if (maxTokens != null) cluster.setMaxTokens(maxTokens);
        if (temperature != null) cluster.setTemperature(temperature);
        if (scoringMode != null) cluster.setScoringMode(scoringMode);
        if (autoQueue != null) cluster.setAutoQueue(autoQueue);
        if (enableDiscussion != null) cluster.setEnableDiscussion(enableDiscussion);
        if (anonymousDiscussion != null) cluster.setAnonymousDiscussion(anonymousDiscussion);
        if (discussionBasePrompt != null) cluster.setDiscussionBasePrompt(discussionBasePrompt);

        return clusterRepository.save(cluster);
    }

    // ── updateUserModelFolder ─────────────────────────────────────────────────
    @Transactional
    public void updateUserModelFolder(String userEmail, String folder) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setModelFolder(folder);
        userRepository.save(user);
    }

    // ── leaveCluster ─────────────────────────────────────────────────────────
    @Transactional
    public void leaveCluster(String userEmail, Integer clusterId) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        UserClusterMembership membership = getMembership(user.getId(), clusterId);

        if (membership.getIsHost()) {
            long memberCount = membershipRepository.findByClusterId(clusterId).size();
            if (memberCount > 1) {
                throw new RuntimeException("Host cannot leave cluster while other members exist.");
            }
            // Dissolve cluster
            List<ModelInstance> clusterModels = modelInstanceRepository.findByClusterId(clusterId);
            modelInstanceRepository.deleteAll(clusterModels);
            membershipRepository.deleteByUserIdAndClusterId(user.getId(), clusterId);
            clusterRepository.deleteById(clusterId);
        } else {
            // Worker leaves — clean up their model instances in this cluster
            List<ModelInstance> userModels = modelInstanceRepository.findByClusterId(clusterId)
                    .stream()
                    .filter(m -> user.getId().equals(m.getSystemId()))
                    .collect(Collectors.toList());
            modelInstanceRepository.deleteAll(userModels);
            membershipRepository.deleteByUserIdAndClusterId(user.getId(), clusterId);
        }

        // Keep legacy field in sync: if user has no memberships left, clear it
        List<UserClusterMembership> remaining = membershipRepository.findByUserId(user.getId());
        if (remaining.isEmpty()) {
            user.setClusterId(null);
            user.setIsHost(false);
            userRepository.save(user);
        } else {
            // Point legacy field at first remaining membership
            UserClusterMembership first = remaining.get(0);
            user.setClusterId(first.getClusterId());
            user.setIsHost(first.getIsHost());
            userRepository.save(user);
        }
    }

    // ── getClusterModels ──────────────────────────────────────────────────────
    public List<ModelInstance> getClusterModels(String userEmail, Integer clusterId) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!membershipRepository.existsByUserIdAndClusterId(user.getId(), clusterId)) {
            return Collections.emptyList();
        }
        return modelInstanceRepository.findByClusterId(clusterId);
    }

    // ── syncRuntimeModels ─────────────────────────────────────────────────────
    @Transactional
    public void syncRuntimeModels(String userEmail, List<String> activeModelNames) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Sync across ALL clusters this user is a member of
        List<Integer> clusterIds = membershipRepository.findByUserId(user.getId())
                .stream()
                .map(UserClusterMembership::getClusterId)
                .collect(Collectors.toList());

        if (clusterIds.isEmpty()) return;

        for (Integer cId : clusterIds) {
            List<ModelInstance> dbModels = modelInstanceRepository.findByClusterId(cId)
                    .stream()
                    .filter(m -> !Boolean.TRUE.equals(m.getIsEmpty()) && user.getId().equals(m.getSystemId()))
                    .collect(Collectors.toList());

            for (ModelInstance m : dbModels) {
                boolean actuallyRunning = activeModelNames != null && activeModelNames.contains(m.getName());
                if (!actuallyRunning) {
                    if (m.getLoadedAt() != null &&
                            m.getLoadedAt().isAfter(java.time.LocalDateTime.now().minusMinutes(10))) {
                        System.out.println("Sync: skipping recently-loaded model " + m.getName());
                        continue;
                    }
                    m.setIsEmpty(true);
                    m.setSlotLabel("Empty Slot · was " + m.getName().replaceAll("\\.gguf$", ""));
                    modelInstanceRepository.save(m);
                    System.out.println("Sync: marked " + m.getName() + " as empty in cluster " + cId);
                }
            }
        }
    }

    // ── proxyModelRequest ─────────────────────────────────────────────────────
    @Transactional
    public Object proxyModelRequest(String userEmail, Integer clusterId, Integer targetSystemId,
            String endpoint, String method, Object body) {

        User currentUser = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(currentUser.getId(), clusterId)) {
            throw new RuntimeException("Only the cluster host can manage models");
        }

        User targetUser = userRepository.findById(targetSystemId)
                .orElseThrow(() -> new RuntimeException("Target system not found"));

        // Verify target is a member of the same cluster
        if (!membershipRepository.existsByUserIdAndClusterId(targetUser.getId(), clusterId)) {
            throw new RuntimeException("Target system is not in your cluster");
        }

        // Check resource permission for this specific cluster membership
        if (endpoint.contains("/api/models/load")) {
            UserClusterMembership targetMembership = getMembership(targetUser.getId(), clusterId);
            if (!Boolean.TRUE.equals(targetMembership.getResourcePermissionGranted())) {
                throw new RuntimeException("Node '" + targetUser.getAccountName()
                        + "' has paused resource sharing for this cluster.");
            }
        }

        String baseUrl;
        String tunnelUrl = targetUser.getTunnelUrl();

        if (tunnelUrl != null && !tunnelUrl.isBlank()) {
            baseUrl = tunnelUrl.endsWith("/") ? tunnelUrl.substring(0, tunnelUrl.length() - 1) : tunnelUrl;
            System.out.println("Routing via ngrok tunnel: " + baseUrl);
        } else {
            String targetIp = targetUser.getSystemIp();
            boolean isLocal = (targetIp == null || targetIp.isEmpty()
                    || targetIp.equals("0:0:0:0:0:0:0:1")
                    || targetIp.equals("127.0.0.1")
                    || targetIp.equals("::1")
                    || targetIp.startsWith("172."));
            baseUrl = isLocal
                    ? "http://" + gatewayHost + ":" + gatewayPort
                    : "http://" + targetIp + ":" + gatewayPort;
            System.out.println("Routing via direct IP: " + baseUrl);
        }

        String url = baseUrl + endpoint;
        System.out.println("Full proxy URL: " + url);

        try {
            if ("GET".equalsIgnoreCase(method)) {
                return restTemplate.getForObject(url, Object.class);
            } else if ("POST".equalsIgnoreCase(method)) {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Object> entity = new HttpEntity<>(body, headers);

                Object response;
                try {
                    RestTemplate templateToUse = (endpoint.contains("/api/models/load")
                            || endpoint.contains("/api/consensus/generate"))
                                    ? modelLoadRestTemplate : restTemplate;
                    response = templateToUse.postForObject(url, entity, Object.class);
                } catch (org.springframework.web.client.HttpStatusCodeException e) {
                    System.err.println("HTTP Error from target: " + e.getRawStatusCode()
                            + " - " + e.getResponseBodyAsString());

                    if (endpoint.contains("/api/models/load") && e.getRawStatusCode() == 503) {
                        throw new RuntimeException("NODE_BUSY:" + e.getResponseBodyAsString());
                    }
                    if (endpoint.contains("/api/models/unload")
                            && (e.getRawStatusCode() == 404 || e.getRawStatusCode() == 400)) {
                        response = Map.of("status", "not_found_but_cleaned");
                    } else {
                        throw new RuntimeException("Target system error: " + e.getResponseBodyAsString());
                    }
                } catch (Exception e) {
                    System.err.println("Communication error: " + e.getMessage());
                    if (endpoint.contains("/api/models/unload")) {
                        response = Map.of("status", "system_unreachable_cleaned");
                    } else {
                        throw new RuntimeException("Communication failed: " + e.getMessage());
                    }
                }

                System.out.println("Response from target: " + response);

                if (endpoint.contains("/api/models/load")) {
                    Cluster cluster = clusterRepository.findById(clusterId)
                            .orElseThrow(() -> new RuntimeException("Cluster not found"));

                    Map<String, Object> bodyMap = (Map<String, Object>) body;
                    Map<String, Object> respMap = (Map<String, Object>) response;
                    String modelName = (String) bodyMap.get("name");
                    String modelPath = (String) bodyMap.get("path");
                    Integer gpuLayers = respMap.get("gpu_layers") instanceof Number
                            ? ((Number) respMap.get("gpu_layers")).intValue() : 0;

                    boolean alreadyLoaded = modelInstanceRepository
                            .findBySystemIdAndName(targetUser.getId(), modelName)
                            .filter(m -> !Boolean.TRUE.equals(m.getIsEmpty()))
                            .isPresent();

                    if (!alreadyLoaded) {
                        List<ModelInstance> currentModels = modelInstanceRepository.findByClusterId(clusterId);
                        long activeSlots = currentModels.stream()
                                .filter(m -> !Boolean.TRUE.equals(m.getIsEmpty())).count();

                        if (activeSlots >= cluster.getMaxModels()) {
                            // The model was already loaded into ai-service's runtime memory above
                            // (the POST to /api/models/load already succeeded). If we just throw here
                            // without unloading, it stays resident in VRAM/RAM with no DB record —
                            // orphaned. Roll it back before rejecting.
                            try {
                                String unloadUrl = baseUrl + "/api/models/unload?name="
                                        + URLEncoder.encode(modelName, StandardCharsets.UTF_8);
                                restTemplate.postForObject(unloadUrl, null, Object.class);
                                System.out.println("Rolled back orphaned load: " + modelName + " (capacity reached)");
                            } catch (Exception rollbackEx) {
                                System.err.println("Failed to roll back orphaned load for " +  modelName
                                        + ": " + rollbackEx.getMessage());
                            }
                            throw new RuntimeException("Cluster model capacity reached ("
                                    + cluster.getMaxModels() + "). Please unload a model first.");
                        }
                        fillModelSlot(clusterId, targetUser.getId(), modelName, modelPath, gpuLayers);
                    }
                } else if (endpoint.contains("/api/models/unload")) {
                    String name = null;
                    if (endpoint.contains("name=")) {
                        try {
                            String query = endpoint.substring(endpoint.indexOf("?") + 1);
                            for (String param : query.split("&")) {
                                String[] pair = param.split("=");
                                if (pair.length > 1 && "name".equals(pair[0])) {
                                    name = URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
                                    break;
                                }
                            }
                        } catch (Exception e) {
                            System.err.println("Failed to parse model name: " + e.getMessage());
                        }
                    }
                    if (name == null && body instanceof Map) {
                        name = (String) ((Map<?, ?>) body).get("name");
                    }
                    if (name != null) {
                        final String finalName = name;
                        List<ModelInstance> models = modelInstanceRepository
                                .findAllBySystemIdAndName(targetUser.getId(), finalName);
                        for (ModelInstance m : models) {
                            m.setIsEmpty(true);
                            m.setSlotLabel("Empty Slot · was " + finalName.replaceAll("\\.gguf$", ""));
                            modelInstanceRepository.save(m);
                        }
                        System.out.println("Marked " + models.size() + " slot(s) empty for: " + finalName);
                    }
                }

                return response != null ? response : Map.of("status", "success");
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to communicate with target system: " + e.getMessage());
        }
        return Map.of("status", "error", "message", "Unsupported method");
    }

    // ── createCluster ─────────────────────────────────────────────────────────
    @Transactional
    public Cluster createCluster(String name, Boolean isPublic, String password,
            String userEmail, String systemIp) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        try {
            Cluster cluster = Cluster.builder()
                    .name(name)
                    .isPublic(isPublic != null ? isPublic : false)
                    .hostId(user.getId())
                    .password(password)
                    .maxModels(6)
                    .autoRotate(false)
                    .sessionAnswers(0)
                    .sessionLimit(10)
                    .build();

            cluster = clusterRepository.save(cluster);

            String hostTunnel = user.getTunnelUrl();
            if (hostTunnel != null && !hostTunnel.isBlank()) {
                cluster.setHostTunnelUrl(hostTunnel);
                clusterRepository.save(cluster);
            }

            // Create membership row
            UserClusterMembership membership = new UserClusterMembership(
                    user.getId(), cluster.getId(), true);
            membershipRepository.save(membership);

            // Keep legacy field in sync for backward compat
            user.setClusterId(cluster.getId());
            user.setIsHost(true);
            user.setSystemIp(systemIp);
            userRepository.save(user);

            System.out.println("Cluster created: " + cluster.getId() + " by " + userEmail);
            return cluster;
        } catch (Exception e) {
            System.err.println("Error creating cluster: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("Failed to save cluster to database: " + e.getMessage());
        }
    }

    // ── joinCluster ───────────────────────────────────────────────────────────
    @Transactional
    public String joinCluster(Integer clusterId, String password,
            String userEmail, String systemIp, String accountName, String workerTunnelUrl) {
        User user = userRepository.findByEmail(userEmail)
                .orElseGet(() -> {
                    // No local record — this is a genuine remote member authenticating
                    // with a validly signed JWT (proves identity once JWT_SECRET is
                    // actually private per-deployment, see Audit Findings #18). Provision
                    // a stub record so cross-machine joins can succeed at all.
                    User remote = User.builder()
                            .email(userEmail)
                            .accountName(accountName != null && !accountName.isBlank() ? accountName : userEmail)
                            .password("") // never used for login on this instance — auth is JWT-only
                            .role(Role.USER)
                            .build();
                    return userRepository.save(remote);
                });

        // Already a member of this specific cluster?
        if (membershipRepository.existsByUserIdAndClusterId(user.getId(), clusterId)) {
            throw new RuntimeException("You are already a member of this cluster");
        }

        Cluster cluster = clusterRepository.findById(clusterId)
                .orElseThrow(() -> new RuntimeException("Cluster not found"));

        if (Boolean.TRUE.equals(cluster.getIsPublic())) {
            if (cluster.getPassword() == null || cluster.getPassword().isBlank()) {
                throw new RuntimeException("Public cluster has no password configured");
            }
            if (!cluster.getPassword().equals(password)) {
                throw new RuntimeException("Incorrect cluster password");
            }
        } else {
            // Private cluster — invite-style join. Only require a password if the
            // cluster actually has one configured; createCluster never enforces a
            // password for private clusters, so an invite link alone must be
            // sufficient when none was set.
            if (cluster.getPassword() != null && !cluster.getPassword().isBlank()) {
                if (password == null || !cluster.getPassword().equals(password)) {
                    throw new RuntimeException("Incorrect cluster password");
                }
            }
        }

        // Create membership row
        UserClusterMembership membership = new UserClusterMembership(
                user.getId(), clusterId, false);
        membershipRepository.save(membership);

        // Keep legacy field in sync (points to most recently joined)
        user.setClusterId(clusterId);
        user.setIsHost(false);
        user.setSystemIp(systemIp);
        if (workerTunnelUrl != null && !workerTunnelUrl.isBlank()) {
            user.setTunnelUrl(workerTunnelUrl);
        }
        userRepository.save(user);

        return cluster.getHostTunnelUrl();
    }

    // ── getCluster ────────────────────────────────────────────────────────────
    public Optional<Cluster> getCluster(Integer id) {
        return clusterRepository.findById(id);
    }

    // ── getCluster (membership-checked) — used by the generic /{id} endpoint.
    // The plain getCluster(id) above stays untouched for the public preview
    // endpoint; this one is for any caller who needs the full Cluster object
    // (including password, used by the invite-modal feature), gated to members
    // only — host or worker — so outsiders can no longer pull any cluster's
    // password just by knowing/guessing its ID.
    public Optional<Cluster> getCluster(String requesterEmail, Integer id) {
        User requester = userRepository.findByEmail(requesterEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!membershipRepository.existsByUserIdAndClusterId(requester.getId(), id)) {
            throw new RuntimeException("You are not a member of this cluster");
        }
        return clusterRepository.findById(id);
    }

    public List<Cluster> getAllClusters() {
        return clusterRepository.findAll();
    }

    // ── getClustersByUserEmail — returns ALL clusters user belongs to ──────────
    public List<Cluster> getClustersByUserEmail(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        List<Integer> clusterIds = membershipRepository.findByUserId(user.getId())
                .stream()
                .map(UserClusterMembership::getClusterId)
                .collect(Collectors.toList());
        return clusterRepository.findAllById(clusterIds);
    }

    // ── Legacy single-cluster lookup (still used by some controllers) ─────────
    public Optional<Cluster> getClusterByUserEmail(String email) {
        return userRepository.findByEmail(email)
                .filter(u -> u.getClusterId() != null)
                .flatMap(u -> clusterRepository.findById(u.getClusterId()));
    }

    // ── getSystemsInMyCluster ─────────────────────────────────────────────────
    public List<User> getSystemsInMyCluster(String email, Integer clusterId) {
        User requester = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!membershipRepository.existsByUserIdAndClusterId(requester.getId(), clusterId)) {
            return List.of();
        }
        List<Integer> memberUserIds = membershipRepository.findByClusterId(clusterId)
                .stream()
                .map(UserClusterMembership::getUserId)
                .collect(Collectors.toList());
        return userRepository.findAllById(memberUserIds);
    }

    // ── getMyTunnelUrl ────────────────────────────────────────────────────────
    public String getMyTunnelUrl(String userEmail) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        return user.getTunnelUrl() != null ? user.getTunnelUrl() : "";
    }

    // ── registerTunnel ────────────────────────────────────────────────────────
    @Transactional
    public void registerTunnel(String userEmail, String tunnelUrl) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setTunnelUrl(tunnelUrl);
        userRepository.save(user);
        System.out.println("Tunnel URL registered for " + userEmail + ": " + tunnelUrl);
    }

    @Transactional
    public void registerTunnelForAllHosts(String aiTunnelUrl, String backendTunnelUrl) {
        // Get ALL host memberships — update every host user and every cluster
        List<UserClusterMembership> allHostMemberships = membershipRepository.findByIsHost(true);

        if (allHostMemberships.isEmpty()) {
            // Fallback: legacy isHost flag on User table
            userRepository.findAll().stream()
                    .filter(u -> Boolean.TRUE.equals(u.getIsHost()))
                    .forEach(u -> {
                        if (aiTunnelUrl != null && !aiTunnelUrl.isBlank()) {
                            u.setTunnelUrl(aiTunnelUrl);
                            userRepository.save(u);
                        }
                        // Update clusters via legacy hostId
                        clusterRepository.findAll().stream()
                                .filter(c -> u.getId().equals(c.getHostId()))
                                .forEach(c -> {
                                    if (backendTunnelUrl != null && !backendTunnelUrl.isBlank()) {
                                        c.setHostTunnelUrl(backendTunnelUrl);
                                        clusterRepository.save(c);
                                        System.out.println("Cluster " + c.getId() + " hostTunnelUrl set: " + backendTunnelUrl);
                                    }
                                });
                        System.out.println("Tunnel saved for legacy host: " + u.getEmail());
                    });
            return;
        }

        // Collect unique user IDs who are hosts
        Set<Integer> hostUserIds = allHostMemberships.stream()
                .map(UserClusterMembership::getUserId)
                .collect(java.util.stream.Collectors.toSet());

        // Update every host user's tunnelUrl
        for (Integer hostUserId : hostUserIds) {
            userRepository.findById(hostUserId).ifPresent(u -> {
                if (aiTunnelUrl != null && !aiTunnelUrl.isBlank()) {
                    u.setTunnelUrl(aiTunnelUrl);
                    userRepository.save(u);
                    System.out.println("AI tunnel saved for host: " + u.getEmail() + " → " + aiTunnelUrl);
                }
            });
        }

        // Update every cluster's hostTunnelUrl
        Set<Integer> clusterIdsToUpdate = new HashSet<>();
        allHostMemberships.forEach(m -> clusterIdsToUpdate.add(m.getClusterId()));
        // Also catch clusters via legacy hostId field
        clusterRepository.findAll().stream()
                .filter(c -> hostUserIds.contains(c.getHostId()))
                .forEach(c -> clusterIdsToUpdate.add(c.getId()));

        for (Integer cId : clusterIdsToUpdate) {
            clusterRepository.findById(cId).ifPresent(c -> {
                if (backendTunnelUrl != null && !backendTunnelUrl.isBlank()) {
                    c.setHostTunnelUrl(backendTunnelUrl);
                    clusterRepository.save(c);
                    System.out.println("Cluster " + c.getId() + " hostTunnelUrl set: " + backendTunnelUrl);
                }
            });
        }

        System.out.println("Tunnel registration complete for " + hostUserIds.size()
                + " host(s), " + clusterIdsToUpdate.size() + " cluster(s)"
                + " | ai=" + aiTunnelUrl + " | backend=" + backendTunnelUrl);
    }



    // ── updateDiscussionPrompt ────────────────────────────────────────────────
    @Transactional
    public void updateDiscussionPrompt(String userEmail, Integer clusterId, String prompt) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(user.getId(), clusterId)) {
            throw new RuntimeException("Only the cluster host can update the discussion prompt");
        }

        Cluster cluster = clusterRepository.findById(clusterId)
                .orElseThrow(() -> new RuntimeException("Cluster not found"));

        cluster.setDiscussionBasePrompt(prompt);
        clusterRepository.save(cluster);
        System.out.println("Discussion base prompt updated by " + userEmail);
    }

    // ── resetClusterScores ────────────────────────────────────────────────────
    @Transactional
    public int resetClusterScores(String userEmail, Integer clusterId) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(user.getId(), clusterId)) {
            throw new RuntimeException("Only the host can reset cluster scores");
        }

        List<ModelInstance> clusterModels = modelInstanceRepository.findByClusterId(clusterId);
        for (ModelInstance m : clusterModels) {
            m.setScore(0.0);
            m.setWins(0);
            m.setLosses(0);
            m.setVotes(0);
        }
        modelInstanceRepository.saveAll(clusterModels);

        System.out.println("Scores reset for cluster " + clusterId + " by " + userEmail
                + " (" + clusterModels.size() + " model instance(s))");
        return clusterModels.size();
    }

    // ── deleteClusterSkeletons ────────────────────────────────────────────────
    @Transactional
    public int deleteClusterSkeletons(String userEmail, Integer clusterId) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(user.getId(), clusterId)) {
            throw new RuntimeException("Only the host can delete skeleton slots");
        }

        List<ModelInstance> skeletons = modelInstanceRepository.findByClusterId(clusterId).stream()
                .filter(m -> Boolean.TRUE.equals(m.getIsEmpty()))
                .collect(Collectors.toList());

        modelInstanceRepository.deleteAll(skeletons);

        System.out.println("Deleted " + skeletons.size() + " skeleton slot(s) for cluster "
                + clusterId + " by " + userEmail);
        return skeletons.size();
    }

    // ── markModelSlotEmpty ────────────────────────────────────────────────────
    @Transactional
    public void markModelSlotEmpty(String userEmail, String modelName) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        List<ModelInstance> matches = modelInstanceRepository
                .findAllBySystemIdAndName(user.getId(), modelName);

        for (ModelInstance m : matches) {
            m.setIsEmpty(true);
            m.setSlotLabel("Empty Slot · was " + m.getName().replaceAll("\\.gguf$", ""));
            modelInstanceRepository.save(m);
        }
    }

    // ── fillModelSlot ─────────────────────────────────────────────────────────
    @Transactional
    public void fillModelSlot(Integer clusterId, Integer systemId, String newModelName,
            String newModelPath, Integer gpuLayers) {
        List<ModelInstance> clusterModels = modelInstanceRepository.findByClusterId(clusterId);

        ModelInstance slot = clusterModels.stream()
                .filter(m -> Boolean.TRUE.equals(m.getIsEmpty()) && systemId.equals(m.getSystemId()))
                .findFirst()
                .orElse(null);

        if (slot != null) {
            System.out.println("Filling slot " + slot.getSlotLabel() + " with " + newModelName);
            slot.setName(newModelName);
            slot.setPath(newModelPath);
            slot.setGpuLayers(gpuLayers != null ? gpuLayers : 0);
            slot.setIsEmpty(false);
            slot.setSlotLabel(null);
            slot.setLoadedAt(java.time.LocalDateTime.now());
            modelInstanceRepository.save(slot);
        } else {
            ModelInstance newModel = new ModelInstance();
            newModel.setName(newModelName);
            newModel.setPath(newModelPath);
            newModel.setSystemId(systemId);
            newModel.setClusterId(clusterId);
            newModel.setGpuLayers(gpuLayers != null ? gpuLayers : 0);
            newModel.setScore(0.0);
            newModel.setVotes(0);
            newModel.setWins(0);
            newModel.setLosses(0);
            newModel.setIsEmpty(false);
            newModel.setLoadedAt(java.time.LocalDateTime.now());
            modelInstanceRepository.save(newModel);
        }
    }

    // ── setResourcePermission — now per cluster ───────────────────────────────
    @Transactional
    public void setResourcePermission(String userEmail, Integer clusterId, boolean granted) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        UserClusterMembership membership = getMembership(user.getId(), clusterId);
        if (membership.getIsHost()) {
            throw new RuntimeException("Host cannot toggle resource permission");
        }
        membership.setResourcePermissionGranted(granted);
        membershipRepository.save(membership);
    }

    // ── getNodePermissions ────────────────────────────────────────────────────
    public List<Map<String, Object>> getNodePermissions(String requesterEmail, Integer clusterId) {
        User requester = userRepository.findByEmail(requesterEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(requester.getId(), clusterId)) {
            throw new RuntimeException("Only host can view node permissions");
        }

        return membershipRepository.findByClusterId(clusterId).stream()
                .filter(m -> !m.getIsHost())
                .map(m -> {
                    User u = userRepository.findById(m.getUserId()).orElse(null);
                    if (u == null) return null;
                    Map<String, Object> map = new java.util.HashMap<>();
                    map.put("id", u.getId());
                    map.put("accountName", u.getAccountName());
                    map.put("email", u.getEmail());
                    map.put("resourcePermissionGranted", m.getResourcePermissionGranted());
                    map.put("isOnline", u.getIsOnline());
                    return map;
                })
                .filter(m -> m != null)
                .collect(Collectors.toList());
    }

    // ── findBestAvailableNode ─────────────────────────────────────────────────
    public Map<String, Object> findBestAvailableNode(String hostEmail, Integer clusterId) {
        User host = userRepository.findByEmail(hostEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!isHostOfCluster(host.getId(), clusterId)) {
            throw new RuntimeException("Only host can auto-assign");
        }

        return membershipRepository.findByClusterId(clusterId).stream()
                .filter(m -> !m.getIsHost() && Boolean.TRUE.equals(m.getResourcePermissionGranted()))
                .map(m -> {
                    User u = userRepository.findById(m.getUserId()).orElse(null);
                    if (u == null || !Boolean.TRUE.equals(u.getIsOnline())) return null;

                    double freeVram = 0;
                    try {
                        String baseUrl = (u.getTunnelUrl() != null && !u.getTunnelUrl().isBlank())
                                ? u.getTunnelUrl().replaceAll("/$", "")
                                : "http://" + (u.getSystemIp() != null ? u.getSystemIp() : "127.0.0.1")
                                        + ":" + gatewayPort;
                        Object stats = restTemplate.getForObject(baseUrl + "/api/system-stats", Object.class);
                        if (stats instanceof Map<?, ?> sm) {
                            Object gpu = ((Map<?, ?>) sm).get("gpu");
                            if (gpu instanceof List<?> gl && !gl.isEmpty()
                                    && gl.get(0) instanceof Map<?, ?> g0) {
                                Object memFree = g0.get("memory_free");
                                if (memFree instanceof Number) freeVram = ((Number) memFree).doubleValue();
                            }
                            if (freeVram == 0) {
                                Object mem = ((Map<?, ?>) sm).get("memory");
                                if (mem instanceof Map<?, ?> mm) {
                                    Object avail = mm.get("available");
                                    if (avail instanceof Number)
                                        freeVram = ((Number) avail).doubleValue() * 1024;
                                }
                            }
                        }
                    } catch (Exception e) {
                        System.out.println("Could not reach node " + u.getEmail() + ": " + e.getMessage());
                    }

                    Map<String, Object> result = new java.util.HashMap<>();
                    result.put("id", u.getId());
                    result.put("accountName", u.getAccountName());
                    result.put("freeVram", freeVram);
                    return result;
                })
                .filter(r -> r != null)
                .max(java.util.Comparator.comparingDouble(r -> ((Number) r.get("freeVram")).doubleValue()))
                .orElseThrow(() -> new RuntimeException("No available worker nodes with resource sharing enabled."));
    }

    // ── getUserMemberships — for dashboard ────────────────────────────────────
    public List<Map<String, Object>> getUserMemberships(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        return membershipRepository.findByUserId(user.getId()).stream()
                .map(m -> {
                    Cluster c = clusterRepository.findById(m.getClusterId()).orElse(null);
                    if (c == null) return null;
                    Map<String, Object> map = new java.util.HashMap<>();
                    map.put("clusterId", c.getId());
                    map.put("clusterName", c.getName());
                    map.put("isHost", m.getIsHost());
                    map.put("isPublic", c.getIsPublic());
                    map.put("resourcePermissionGranted", m.getResourcePermissionGranted());
                    return map;
                })
                .filter(m -> m != null)
                .collect(Collectors.toList());
    }
}