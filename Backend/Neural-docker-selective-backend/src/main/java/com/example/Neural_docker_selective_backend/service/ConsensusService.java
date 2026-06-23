package com.example.Neural_docker_selective_backend.service;

import com.example.Neural_docker_selective_backend.model.Cluster;
import com.example.Neural_docker_selective_backend.model.ModelInstance;
import com.example.Neural_docker_selective_backend.model.User;
import com.example.Neural_docker_selective_backend.model.UserClusterMembership;
import com.example.Neural_docker_selective_backend.repository.ClusterRepository;
import com.example.Neural_docker_selective_backend.repository.ModelInstanceRepository;
import com.example.Neural_docker_selective_backend.repository.UserClusterMembershipRepository;
import com.example.Neural_docker_selective_backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

@Service
public class ConsensusService {

    private final ClusterRepository clusterRepository;
    private final UserRepository userRepository;
    private final ModelInstanceRepository modelInstanceRepository;
    private final RestTemplate restTemplate;
    private final UserClusterMembershipRepository membershipRepository;

    @Value("${microservice.gateway.host:ai-service}")
    private String gatewayHost;

    @Value("${microservice.gateway.port:8000}")
    private int gatewayPort;

    public ConsensusService(ClusterRepository clusterRepository, UserRepository userRepository, ModelInstanceRepository modelInstanceRepository, RestTemplate restTemplate, UserClusterMembershipRepository membershipRepository) {
        this.clusterRepository = clusterRepository;
        this.userRepository = userRepository;
        this.modelInstanceRepository = modelInstanceRepository;
        this.restTemplate = restTemplate;
        this.membershipRepository = membershipRepository;
    }

    // In-memory live discussion feed — keyed by clusterId
    private static final Map<Integer, List<Map<String, Object>>> liveDiscussionFeed =
            new java.util.concurrent.ConcurrentHashMap<>();

    // In-memory post-processing flag — true while discussion/rotation is running
    // Keyed by clusterId. Checked by the pipeline status endpoint.
    private static final java.util.concurrent.ConcurrentHashMap<Integer, Boolean> postProcessingActive = new java.util.concurrent.ConcurrentHashMap<>();

    public static boolean isPostProcessing(Integer clusterId) {
        return Boolean.TRUE.equals(postProcessingActive.get(clusterId));
    }

    public static void pushDiscussionMessage(Integer clusterId, Map<String, Object> msg) {
        liveDiscussionFeed.computeIfAbsent(clusterId, k ->
                new java.util.concurrent.CopyOnWriteArrayList<>()).add(msg);
    }

    public static List<Map<String, Object>> pollDiscussionMessages(Integer clusterId, int since) {
        List<Map<String, Object>> all = liveDiscussionFeed.getOrDefault(clusterId, List.of());
        return since < all.size() ? all.subList(since, all.size()) : List.of();
    }

    public static void clearDiscussionFeed(Integer clusterId) {
        liveDiscussionFeed.remove(clusterId);
    }

    public Map<String, Object> runConsensus(String userEmail, String prompt, String systemPrompt, Integer clusterId, Boolean skipPostSession) {
        User currentUser = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Find cluster by id if provided, else find first host cluster
        final Cluster cluster;
        if (clusterId != null) {
            cluster = clusterRepository.findById(clusterId)
                    .orElseThrow(() -> new RuntimeException("Cluster not found"));
            // Verify user is host of this cluster
            boolean isHost = membershipRepository.findByUserIdAndClusterId(currentUser.getId(), clusterId)
                    .map(UserClusterMembership::getIsHost)
                    .orElse(false);
            // Fallback: check legacy hostId field on cluster directly
            if (!isHost) {
                isHost = cluster.getHostId() != null && cluster.getHostId().equals(currentUser.getId());
            }
            if (!isHost) {
                throw new RuntimeException("User is not a host of this cluster");
            }
            // Auto-repair: if user IS the host by hostId but membership is missing, recreate it
            if (isHost && membershipRepository.findByUserIdAndClusterId(currentUser.getId(), clusterId).isEmpty()) {
                System.out.println("Auto-repairing missing host membership for user "
                        + currentUser.getId() + " cluster " + clusterId);
                UserClusterMembership repair = new UserClusterMembership(currentUser.getId(), clusterId, true);
                membershipRepository.save(repair);
            }
        } else {
            // Fallback: find first host cluster (for legacy requests without clusterId)
            var hostMembership = membershipRepository.findByUserId(currentUser.getId()).stream()
                    .filter(UserClusterMembership::getIsHost)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("User is not a host of any cluster"));
            cluster = clusterRepository.findById(hostMembership.getClusterId())
                    .orElseThrow(() -> new RuntimeException("Cluster not found"));
        }

        List<Integer> memberIds = membershipRepository.findByClusterId(cluster.getId())
                .stream().map(m -> m.getUserId()).collect(Collectors.toList());
        List<User> systems = userRepository.findAllById(memberIds);

        // Reset consecutive timeout counters before each run
        // This prevents accumulated timeouts from a slow previous question
        // from permanently flagging a node that is actually still alive
        for (User sys : systems) {
            if (Boolean.TRUE.equals(sys.getIsOnline()) &&
                    sys.getConsecutiveTimeouts() != null && sys.getConsecutiveTimeouts() > 0) {
                sys.setConsecutiveTimeouts(0);
                userRepository.save(sys);
            }
        }

        // 1. Generate Answers from all nodes with per-node timeout 
        List<Map<String, String>> allAnswers = new ArrayList<>(); 
        // Minimum 3 minutes per node — a 1B model generate+rate cycle takes 30-120s 
        // The cluster setting can only increase this, never decrease below the floor 
        final int timeoutSeconds = Math.max(cluster.getNodeTimeoutSeconds(), 180); 
        final int maxTimeouts = Math.max(cluster.getMaxNodeTimeouts(), 10); // don't offline a node until 10 consecutive failures
        
        List<CompletableFuture<Void>> generationTasks = new ArrayList<>(); 
        
        for (User sys : systems) { 
            // Skip nodes already marked offline 
            if (!sys.getIsOnline()) { 
                System.out.println("Skipping offline node: " + sys.getEmail()); 
                continue; 
            } 
        
            CompletableFuture<Void> task = CompletableFuture.runAsync(() -> { 
                String url = getSystemUrl(sys) + "/api/consensus/generate"; 
                try { 
                    Map<String, String> body = Map.of("prompt", prompt, "system_prompt", systemPrompt); 
                    List<Map<String, Object>> responses = restTemplate.postForObject(url, body, List.class); 
                    if (responses != null) { 
                        synchronized (allAnswers) { 
                            for (Map<String, Object> resp : responses) { 
                                String modelName = (String) resp.get("model"); 
                                String answer = (String) resp.get("answer"); 
                                if (modelName == null || answer == null) { 
                                    System.err.println("Skipping response with null model or answer from " + sys.getEmail()); 
                                    continue; 
                                } 
                                Map<String, String> entry = new HashMap<>(); 
                                entry.put("model", modelName); 
                                entry.put("answer", answer); 
                                entry.put("path", (String) resp.getOrDefault("path", "")); 
                                entry.put("systemId", sys.getId().toString()); 
                                allAnswers.add(entry); 
                            } 
                        } 
                    } 
                    // Success — reset consecutive timeout counter 
                    resetNodeTimeouts(sys); 
                } catch (Exception e) { 
                    System.err.println("Failed to get answers from " + sys.getEmail() + ": " + e.getMessage()); 
                    handleNodeFailure(sys, maxTimeouts); 
                } 
            }); 
        
            // Wrap with timeout — if node doesn't respond in time, cancel and record failure 
            CompletableFuture<Void> timedTask = task.orTimeout(timeoutSeconds, TimeUnit.SECONDS) 
                .exceptionally(ex -> { 
                    if (ex instanceof TimeoutException || ex.getCause() instanceof TimeoutException) { 
                        System.err.println("Node timed out during generation: " + sys.getEmail() + 
                            " (>" + timeoutSeconds + "s)"); 
                        handleNodeFailure(sys, maxTimeouts); 
                    } 
                    return null; 
                }); 
        
            generationTasks.add(timedTask); 
        } 
        
        // Wait for all — but since each task has its own timeout, this won't hang forever 
        CompletableFuture.allOf(generationTasks.toArray(new CompletableFuture[0])).join(); 
        
        if (allAnswers.isEmpty()) { 
            throw new RuntimeException("No models responded to the prompt. All nodes may be offline or timed out."); 
        }

        // 2. Rate Answers (all models rate all answers) with per-node timeout 
        List<Map<String, Object>> allRatings = new ArrayList<>(); 
        List<CompletableFuture<Void>> ratingTasks = new ArrayList<>(); 
        
        for (User sys : systems) { 
            // Skip offline nodes for rating too 
            if (!sys.getIsOnline()) { 
                System.out.println("Skipping offline node for rating: " + sys.getEmail()); 
                continue; 
            } 
        
            CompletableFuture<Void> task = CompletableFuture.runAsync(() -> { 
                String url = getSystemUrl(sys) + "/api/consensus/rate"; 
                try { 
                    Map<String, Object> body = Map.of( 
                        "prompt", prompt, 
                        "answers", allAnswers, 
                        "system_prompt", "You are an expert evaluator." 
                    ); 
                    List<Map<String, Object>> ratings = restTemplate.postForObject(url, body, List.class); 
                    if (ratings != null) { 
                        synchronized (allRatings) { 
                            allRatings.addAll(ratings); 
                        } 
                    } 
                    // Success — reset consecutive timeout counter 
                    resetNodeTimeouts(sys); 
                } catch (Exception e) { 
                    System.err.println("Failed to get ratings from " + sys.getEmail() + ": " + e.getMessage()); 
                    handleNodeFailure(sys, maxTimeouts); 
                } 
            }); 
        
            CompletableFuture<Void> timedTask = task.orTimeout(timeoutSeconds, TimeUnit.SECONDS) 
                .exceptionally(ex -> { 
                    if (ex instanceof TimeoutException || ex.getCause() instanceof TimeoutException) { 
                        System.err.println("Node timed out during rating: " + sys.getEmail() + 
                            " (>" + timeoutSeconds + "s)"); 
                        handleNodeFailure(sys, maxTimeouts); 
                    } 
                    return null; 
                }); 
        
            ratingTasks.add(timedTask); 
        } 
        
        CompletableFuture.allOf(ratingTasks.toArray(new CompletableFuture[0])).join(); 

        // Build evaluator weight map — models with higher scores get more voting influence 
        // Weight is normalized so a new model (score=0) starts neutral 
        Map<String, Double> evaluatorWeights = new HashMap<>(); 
        if (cluster.getWeightedVoting()) { 
            List<ModelInstance> clusterModels = modelInstanceRepository.findByClusterId(cluster.getId()); 
            double minScore = clusterModels.stream() 
                    .mapToDouble(m -> m.getScore() != null ? m.getScore() : 0.0) 
                    .min().orElse(0.0); 
            double maxScore = clusterModels.stream() 
                    .mapToDouble(m -> m.getScore() != null ? m.getScore() : 0.0) 
                    .max().orElse(0.0); 
            double scoreRange = maxScore - minScore; 
        
            for (ModelInstance m : clusterModels) { 
                double score = m.getScore() != null ? m.getScore() : 0.0; 
                // Normalize to 0.5–1.5 range so worst model still has half weight 
                // If all scores equal (scoreRange = 0), everyone gets weight 1.0 
                double weight = scoreRange > 0 ? 0.5 + ((score - minScore) / scoreRange) : 1.0; 
                evaluatorWeights.put(m.getName(), weight); 
            } 
        } 
        
        // Collect weighted scores per model 
        Map<String, List<Integer>> modelToScores = new HashMap<>(); 
        Map<String, Double> modelToWeightedSum = new HashMap<>(); 
        Map<String, Double> modelToTotalWeight = new HashMap<>(); 
        
        for (Map<String, Object> ratingEntry : allRatings) { 
            String evaluatorName = (String) ratingEntry.get("evaluator"); 
            double evaluatorWeight = evaluatorWeights.getOrDefault(evaluatorName, 1.0); 
            List<Map<String, Object>> ratings = (List<Map<String, Object>>) ratingEntry.get("ratings"); 
            if (ratings != null) {
                for (Map<String, Object> r : ratings) { 
                    String modelName = (String) r.get("model"); 
                    Integer score = (Integer) r.get("score"); 
                    if (modelName != null && score != null) {
                        modelToScores.computeIfAbsent(modelName, k -> new ArrayList<>()).add(score); 
                        modelToWeightedSum.merge(modelName, score * evaluatorWeight, Double::sum); 
                        modelToTotalWeight.merge(modelName, evaluatorWeight, Double::sum); 
                    }
                } 
            }
        } 
        
        List<Map<String, Object>> finalResponses = new ArrayList<>(); 
        for (Map<String, String> ans : allAnswers) { 
            String modelName = ans.get("model"); 
            List<Integer> scores = modelToScores.getOrDefault(modelName, List.of(3)); 
            
            double avgScore; 
            if (cluster.getWeightedVoting() && modelToTotalWeight.containsKey(modelName)) { 
                // Weighted average — better models' opinions count more 
                avgScore = modelToWeightedSum.get(modelName) / modelToTotalWeight.get(modelName); 
            } else { 
                // Plain average fallback 
                avgScore = scores.stream().mapToInt(Integer::intValue).average().orElse(3.0); 
            } 
        
            Map<String, Object> finalResp = new HashMap<>(ans); 
            finalResp.put("avg_score", avgScore); 
            finalResp.put("scores", scores); 
            finalResponses.add(finalResp); 
        }

        Map<String, Object> winner = finalResponses.stream()
                .max(Comparator.comparingDouble(r -> (Double) r.get("avg_score")))
                .orElse(finalResponses.get(0));

        // Update stats in background — never let a stats failure kill the answer
        final List<Map<String, Object>> responsesForStats = new ArrayList<>(finalResponses);
        final Map<String, Object> winnerForStats = winner;
        final Integer clusterIdForStats = cluster.getId();
        CompletableFuture.runAsync(() -> {
            for (Map<String, Object> resp : responsesForStats) {
                try {
                    String modelName = (String) resp.get("model");
                    String modelPath = (String) resp.get("path");
                    String systemIdStr = (String) resp.get("systemId");
                    if (systemIdStr == null) continue;
                    Integer systemId = Integer.parseInt(systemIdStr);
                    double avgScore = (Double) resp.get("avg_score");
                    boolean isWinner = resp == winnerForStats;
                    updateModelStats(systemId, modelName, modelPath, clusterIdForStats, avgScore, isWinner);
                } catch (Exception e) {
                    System.err.println("Stats update failed (non-fatal): " + e.getMessage());
                }
            }
        });

        // Update Cluster session info 
        // Re-fetch cluster fresh from DB to get the actual current count 
        // This prevents stale reads when multiple requests overlap 
        Cluster freshCluster;
        try {
            freshCluster = clusterRepository.findById(cluster.getId()).orElse(cluster);
        } catch (Exception e) {
            System.err.println("Failed to re-fetch cluster for session update: " + e.getMessage());
            freshCluster = cluster;
        }
        freshCluster.setSessionAnswers(freshCluster.getSessionAnswers() + 1); 
        int progressSnapshot = freshCluster.getSessionAnswers(); 
        
        boolean sessionEnded = false;
        
        if (progressSnapshot >= freshCluster.getSessionLimit()) { 
            sessionEnded = true; 
            freshCluster.setSessionAnswers(0); 
            clusterRepository.save(freshCluster);  // Save reset immediately 
 
            // Check skipPostSession flag 
            boolean skipPost = Boolean.TRUE.equals(skipPostSession); 
 
            if (!skipPost) { 
                // Run post-session work in background — don't block the answer 
                final Cluster clusterForPost = clusterRepository.findById(freshCluster.getId()).orElse(freshCluster); 
                final List<User> systemsForPost = new ArrayList<>(systems); 
                final String lastPrompt = prompt; 
 
                CompletableFuture.runAsync(() -> {
                    postProcessingActive.put(clusterForPost.getId(), true);
                    try {
                        System.out.println("Post-session work starting in background for cluster " + clusterForPost.getId());

                        if (Boolean.TRUE.equals(clusterForPost.getEnableDiscussion())) {
                            boolean aiServiceHealthy = false;
                            for (User sys : systemsForPost) {
                                if (!Boolean.TRUE.equals(sys.getIsOnline())) continue;
                                try {
                                    String healthUrl = getSystemUrl(sys) + "/api/health";
                                    Map<String, Object> health = restTemplate.getForObject(healthUrl, Map.class);
                                    if (health != null) {
                                        Object modelsLoaded = health.get("models_loaded");
                                        if (modelsLoaded instanceof Number && ((Number) modelsLoaded).intValue() > 0) {
                                            aiServiceHealthy = true;
                                            break;
                                        }
                                    }
                                } catch (Exception e) {
                                    System.err.println("Health check failed for " + sys.getEmail() + ": " + e.getMessage());
                                }
                            }
                            if (aiServiceHealthy) {
                                runDiscussion(clusterForPost, systemsForPost, lastPrompt);
                            } else {
                                System.out.println("Background discussion skipped: no healthy nodes.");
                            }
                        }

                        normalizeScores(clusterForPost);

                        if (Boolean.TRUE.equals(clusterForPost.getAutoRotate())) {
                            performModelRotation(clusterForPost);
                        }

                        System.out.println("Post-session work complete for cluster " + clusterForPost.getId());
                    } catch (Exception e) {
                        System.err.println("Background post-session error for cluster " + clusterForPost.getId() + ": " + e.getMessage());
                    } finally {
                        // Always clear the flag — even if something threw
                        postProcessingActive.put(clusterForPost.getId(), false);
                    }
                }); 
            } else { 
                System.out.println("Post-session work skipped by user for cluster " + freshCluster.getId()); 
            } 
        } else { 
            clusterRepository.save(freshCluster); 
        }

        Map<String, Object> result = new HashMap<>();
        result.put("winner", winner);
        result.put("all_responses", finalResponses);
        result.put("session_ended", sessionEnded);
        // Use snapshot so frontend gets the real final count, not 0 after reset 
        result.put("session_progress", sessionEnded ? freshCluster.getSessionLimit() : progressSnapshot);
        result.put("session_limit", freshCluster.getSessionLimit());
        result.put("discussion_messages", new ArrayList<>()); // always empty now — use /discussion/live
        result.put("discussion_enabled", freshCluster.getEnableDiscussion());
        result.put("post_session_skipped", Boolean.TRUE.equals(skipPostSession));
        
        return result;
    }

    @Transactional 
    public void saveClusterState(Cluster cluster) { 
        clusterRepository.save(cluster); 
    } 

    private String getSystemUrl(User sys) {
        // Use ngrok tunnel if available (for cross-machine nodes)
        String tunnelUrl = sys.getTunnelUrl();
        if (tunnelUrl != null && !tunnelUrl.isBlank()) {
            return tunnelUrl.endsWith("/") ? tunnelUrl.substring(0, tunnelUrl.length() - 1) : tunnelUrl;
        }
        // For the local host node: use Docker service hostname, not 127.0.0.1
        // 127.0.0.1 inside the backend container points to itself, not the ai-service container
        String ip = sys.getSystemIp();
        boolean isLocalNode = (ip == null || ip.isEmpty()
                || ip.equals("0:0:0:0:0:0:0:1")
                || ip.equals("127.0.0.1")
                || ip.startsWith("172.")   // Docker bridge network range
                || ip.equals("::1"));

        if (isLocalNode) {
            // Route through Docker service name — reliable inside the Docker network
            return "http://" + gatewayHost + ":" + gatewayPort;
        }
        // Remote node with a real IP (worker on another machine without ngrok)
        return "http://" + ip + ":" + gatewayPort;
    }

    @Transactional 
    public void updateModelStats(Integer systemId, String modelName, String modelPath, 
            Integer clusterId, double avgScore, boolean isWinner) { 
        // Use findAllBySystemIdAndName and pick the active (non-empty) one
        List<ModelInstance> matches = modelInstanceRepository.findAllBySystemIdAndName(systemId, modelName);
        Optional<ModelInstance> optModel = matches.stream()
                .filter(m -> !Boolean.TRUE.equals(m.getIsEmpty()))
                .findFirst()
                .or(() -> matches.stream().findFirst()); // fallback to any match
        if (optModel.isEmpty()) { 
            System.out.println("Warning: model " + modelName + " on system " + systemId + 
                " answered but has no DB record. Stats skipped."); 
            return; 
        } 

        ModelInstance model = optModel.get(); 
        if (modelPath != null && !modelPath.isEmpty()) model.setPath(modelPath); 

        // Update counters 
        model.setVotes((model.getVotes() != null ? model.getVotes() : 0) + 1); 
        if (isWinner) { 
            model.setWins((model.getWins() != null ? model.getWins() : 0) + 1); 
        } else { 
            model.setLosses((model.getLosses() != null ? model.getLosses() : 0) + 1); 
        } 

        int totalVotes = model.getVotes(); 
        int wins = model.getWins() != null ? model.getWins() : 0; 

        // ── Bounded score formula (inspired by weighted benchmark script) ────── 
        // Win rate component: how often this model wins (0.0–1.0) 
        double winRate = totalVotes > 0 ? (double) wins / totalVotes : 0.5; 

        // Vote quality component: how good peers rate this model's answers (0.0–1.0) 
        // avgScore is 1–5, normalize to 0–1 
        double voteQuality = (avgScore - 1.0) / 4.0; 

        // Blend: 60% win rate + 40% vote quality (mirrors benchmark's weighted tally) 
        // Both components are naturally bounded so score can never go below 0 or above 1000 
        double blended = (winRate * 0.6) + (voteQuality * 0.4); 

        // Apply confidence factor — new models (few votes) stay closer to neutral (500) 
        // As votes accumulate, confidence increases and score reflects true performance 
        // confidence = 1.0 after 10+ votes, 0.1 after 1 vote 
        double confidence = Math.min(1.0, totalVotes / 10.0); 
        double finalScore = 500.0 + (blended - 0.5) * 1000.0 * confidence; 

        // Hard clamp 50–1000: floor at 50 so no model is permanently dead weight 
        model.setScore(Math.max(50.0, Math.min(1000.0, finalScore))); 

        modelInstanceRepository.save(model); 
    } 

    @Transactional 
    public void saveModelNotes(Integer modelId, String notes) { 
        modelInstanceRepository.findById(modelId).ifPresent(m -> { 
            m.setCacheMemory(notes); 
            modelInstanceRepository.save(m); 
        }); 
    } 

    private List<Map<String, Object>> runDiscussion(Cluster cluster, List<User> systems, String lastPrompt) { 
        System.out.println("Starting post-session discussion for cluster: " + cluster.getName()); 
    
        int rounds = cluster.getDiscussionRounds(); 
        boolean anonymous = Boolean.TRUE.equals(cluster.getAnonymousDiscussion()); 
        int timeoutSeconds = cluster.getNodeTimeoutSeconds(); 
    
        // Build discussion base prompt 
        String basePromptRaw = cluster.getDiscussionBasePrompt(); 
        if (basePromptRaw == null || basePromptRaw.isBlank()) { 
            basePromptRaw = "Reflect on the session that just ended. The last question asked was: \"" + lastPrompt + "\". " + 
                "Discuss what patterns you noticed, what worked well, and what could be improved. " + 
                "Be concise and constructive."; 
        } 
        final String basePrompt = basePromptRaw;
    
        // Collect all active models across all online nodes 
        List<ModelInstance> activeModels = modelInstanceRepository.findByClusterId(cluster.getId()); 
        if (activeModels.isEmpty()) { 
            System.out.println("Discussion skipped: no active models."); 
            return new ArrayList<>(); 
        } 
    
        // Map model name -> system for routing 
        Map<String, User> modelToSystem = new HashMap<>(); 
        Map<String, ModelInstance> modelToInstance = new HashMap<>(); 
        for (ModelInstance m : activeModels) { 
            userRepository.findById(m.getSystemId()).ifPresent(u -> { 
                if (Boolean.TRUE.equals(u.getIsOnline())) { 
                    modelToSystem.put(m.getName(), u); 
                    modelToInstance.put(m.getName(), m); 
                } 
            }); 
        } 
    
        if (modelToSystem.isEmpty()) { 
            System.out.println("Discussion skipped: no online nodes."); 
            return new ArrayList<>(); 
        } 
    
        // Discussion history visible to all models (rolling window) 
        List<Map<String, String>> discussionHistory = new ArrayList<>(); 
        List<Map<String, Object>> allDiscussionMessages = new ArrayList<>(); 
    
        for (int round = 0; round < rounds; round++) {  
            System.out.println("Discussion round " + (round + 1) + "/" + rounds);  
            
            // Capture round as effectively final for lambda use 
            final int currentRound = round; 
        
            List<Map<String, Object>> roundMessages = new ArrayList<>();  
            List<CompletableFuture<Void>> roundTasks = new ArrayList<>();  
        
            for (Map.Entry<String, User> entry : modelToSystem.entrySet()) {  
                String modelName = entry.getKey();  
                User sys = entry.getValue();  
                ModelInstance instance = modelToInstance.get(modelName);  
        
                roundTasks.add(CompletableFuture.runAsync(() -> { 
                    try { 
                        // Build the discussion prompt for this model 
                        StringBuilder prompt = new StringBuilder(); 
                        prompt.append(basePrompt).append("\n\n"); 
    
                        // Include rolling discussion history (anonymous if enabled) 
                        if (!discussionHistory.isEmpty()) { 
                            prompt.append("Previous discussion messages:\n"); 
                            for (Map<String, String> msg : discussionHistory) { 
                                String speaker = anonymous ? "Model [ANON]" : msg.get("model"); 
                                prompt.append("- ").append(speaker).append(": ") 
                                      .append(msg.get("message")).append("\n"); 
                            } 
                            prompt.append("\n"); 
                        } 
    
                        // Only include notes if they exist and are short — long notes confuse small models 
                        String currentNotes = instance.getCacheMemory(); 
                        if (currentNotes != null && !currentNotes.isBlank()) { 
                            String trimmedNotes = currentNotes.length() > 150 
                                    ? currentNotes.substring(0, 150) + "..." 
                                    : currentNotes; 
                            prompt.append("Your previous notes: ").append(trimmedNotes).append("\n\n"); 
                        } 
    
                        // Keep prompt short — small models get confused by long instructions 
                        // The ai-service _discuss_on_cpu will further simplify this 
                        prompt.append("Share your thoughts on the last question in 2-3 sentences. ") 
                              .append("What worked, what was hard, what would you do differently?"); 
    
                        // Use dedicated discussion endpoint — shorter tokens, prompt truncation built in 
                        String url = getSystemUrl(sys) + "/api/consensus/discuss"; 
                        Map<String, String> body = Map.of( 
                            "prompt", prompt.toString(), 
                            "system_prompt", "You are participating in a post-session model discussion. Be concise and insightful." 
                        ); 
    
                        List<Map<String, Object>> responses = restTemplate.postForObject(url, body, List.class); 
                        if (responses == null || responses.isEmpty()) return; 
    
                        // Find this model's response 
                        String rawResponse = responses.stream() 
                            .filter(r -> modelName.equals(r.get("model"))) 
                            .map(r -> (String) r.get("answer")) 
                            .findFirst() 
                            .orElse(null); 
    
                        if (rawResponse == null || rawResponse.isBlank()) return; 
    
                        // Parse out <notes> block if present 
                        String visibleMessage = rawResponse; 
                        String updatedNotes = null; 
    
                        int notesStart = rawResponse.indexOf("<notes>"); 
                        int notesEnd = rawResponse.indexOf("</notes>"); 
                        if (notesStart >= 0 && notesEnd > notesStart) { 
                            updatedNotes = rawResponse.substring(notesStart + 7, notesEnd).trim(); 
                            // Strip notes block from visible message 
                            visibleMessage = (rawResponse.substring(0, notesStart) + 
                                rawResponse.substring(notesEnd + 8)).trim(); 
                        } 
    
                        // Enforce 200 word limit on notes 
                        if (updatedNotes != null) { 
                            String[] words = updatedNotes.split("\\s+"); 
                            if (words.length > 200) { 
                                updatedNotes = String.join(" ", 
                                    java.util.Arrays.copyOf(words, 200)) + "..."; 
                            } 
                            // Save updated notes via a separate transaction 
                            // Direct repository save from async thread causes transaction corruption 
                            final String finalNotes = updatedNotes; 
                            final Integer instanceId = instance.getId(); 
                            try { 
                                // Call repository directly to ensure it happens in this thread's context 
                                // since @Transactional on saveModelNotes is ignored when called internally
                                modelInstanceRepository.findById(instanceId).ifPresent(m -> { 
                                    m.setCacheMemory(finalNotes); 
                                    modelInstanceRepository.save(m); 
                                });
                                System.out.println(modelName + " updated their notes."); 
                            } catch (Exception e) { 
                                System.err.println("Failed to save notes for " + modelName + ": " + e.getMessage()); 
                            } 
                        } 
    
                        // Push live — frontend polls this 
                        Map<String, Object> liveMsg = Map.of( 
                                "model", anonymous ? "Model [ANON-" + Math.abs(modelName.hashCode() % 100) + "]" : modelName, 
                                "message", visibleMessage, 
                                "round", currentRound + 1, 
                                "updatedNotes", updatedNotes != null 
                        ); 
                        pushDiscussionMessage(cluster.getId(), liveMsg); 
                        
                        // Store message for this round 
                        synchronized (roundMessages) { 
                            roundMessages.add(liveMsg); 
                        } 
    
                    } catch (Exception e) { 
                        System.err.println("Discussion error for " + modelName + ": " + e.getMessage()); 
                    } 
                }).orTimeout(timeoutSeconds, TimeUnit.SECONDS) 
                  .exceptionally(ex -> { 
                      System.err.println("Discussion timeout for " + modelName); 
                      return null; 
                  })); 
            } 
    
            // Wait for all models in this round 
            CompletableFuture.allOf(roundTasks.toArray(new CompletableFuture[0])).join(); 
    
            // Add round messages to history and full log 
            for (Map<String, Object> msg : roundMessages) { 
                discussionHistory.add(Map.of( 
                    "model", (String) msg.get("model"), 
                    "message", (String) msg.get("message") 
                )); 
                allDiscussionMessages.add(msg); 
            } 
    
            System.out.println("Round " + (round + 1) + " complete. " + roundMessages.size() + " models responded."); 
        } 
    
        System.out.println("Discussion complete. " + allDiscussionMessages.size() + " total messages."); 
        return allDiscussionMessages; 
    } 

    @Transactional 
    public void normalizeScores(Cluster cluster) { 
        // Score formula is now self-normalizing (bounded 50–1000). 
        // No external normalization needed — scores always reflect true win rate. 
        System.out.println("Score normalization skipped — scores are self-bounded (50–1000)."); 
    } 

    @Transactional 
    public void performModelRotation(Cluster cluster) { 
        List<ModelInstance> clusterModels = modelInstanceRepository.findByClusterId(cluster.getId()); 
        if (clusterModels.isEmpty()) { 
            System.out.println("Rotation skipped: no models in cluster."); 
            return; 
        } 
    
        // Only rotate if there are at least 2 models — no point rotating the only model 
        if (clusterModels.size() < 2) { 
            System.out.println("Rotation skipped: only one model loaded, need at least 2 for rotation."); 
            return; 
        } 
    
        // Find the worst performing model by score 
        ModelInstance worstModel = clusterModels.stream() 
                .min(Comparator.comparingDouble(m -> m.getScore() != null ? m.getScore() : 0.0)) 
                .orElse(null); 
    
        if (worstModel == null) return; 
    
        double worstScore = worstModel.getScore() != null ? worstModel.getScore() : 0.0;  
        // Require minimum 3 votes before rotating — prevents rotating a new model 
        // that just had one bad round 
        // Also only rotate if the model is actually underperforming (negative score) 
        if (worstModel.getVotes() < 3) {  
            System.out.println("Rotation skipped: worst model (" + worstModel.getName() +  
                ") hasn't had enough votes yet (" + worstModel.getVotes() + "/3 minimum).");  
            return;  
        } 
        // Rotation threshold: below 350 = consistently underperforming (below 35% effective win rate) 
        // 500 = neutral, 1000 = perfect, 50 = floor 
        if (worstScore >= 350.0) { 
            System.out.println("Rotation skipped: worst model (" + worstModel.getName() + 
                ") score is " + (int)worstScore + " which is above rotation threshold (350). All models performing acceptably."); 
            return; 
        } 
    
        User systemOfWorstModel = userRepository.findById(worstModel.getSystemId()).orElse(null); 
        if (systemOfWorstModel == null) { 
            System.out.println("Rotation skipped: could not find system for worst model."); 
            return; 
        } 
    
        String scanUrl = getSystemUrl(systemOfWorstModel) + "/api/models/scan"; 
        try { 
            List<Map<String, Object>> availableModels = restTemplate.getForObject(scanUrl, List.class); 
            if (availableModels == null) { 
                System.out.println("Rotation skipped: scan returned null from " + systemOfWorstModel.getEmail()); 
                return; 
            } 
    
            // Get names of currently loaded models to exclude them 
            List<String> loadedNames = clusterModels.stream() 
                    .map(ModelInstance::getName) 
                    .collect(Collectors.toList()); 
    
            // Filter to unloaded models not already in the cluster 
            List<Map<String, Object>> candidates = availableModels.stream() 
                    .filter(m -> { 
                        Boolean loaded = (Boolean) m.get("loaded"); 
                        String name = (String) m.get("name"); 
                        return (loaded == null || !loaded) && !loadedNames.contains(name); 
                    }) 
                    .collect(Collectors.toList()); 
    
            if (candidates.isEmpty()) { 
                System.out.println("Rotation skipped: no new candidate models available on " + 
                    systemOfWorstModel.getEmail()); 
                return; 
            } 
    
            // Pick the largest unloaded model as replacement 
            Map<String, Object> replacement = candidates.stream() 
                    .max(Comparator.comparingDouble(m -> { 
                        Object sizeObj = m.get("size_gb"); 
                        if (sizeObj instanceof Number) return ((Number) sizeObj).doubleValue(); 
                        return 0.0; 
                    })) 
                    .orElse(candidates.get(0)); 
    
            String replacementName = (String) replacement.get("name"); 
            String replacementPath = (String) replacement.get("path"); 
    
            System.out.println("Rotating: " + worstModel.getName() + 
                " (score=" + worstScore + ") -> " + replacementName + 
                " on " + systemOfWorstModel.getEmail()); 
    
            // Step 1: Unload worst model from runtime 
            try { 
                String unloadUrl = getSystemUrl(systemOfWorstModel) + 
                    "/api/models/unload?name=" + worstModel.getName(); 
                restTemplate.postForObject(unloadUrl, null, Map.class); 
                System.out.println("Unloaded: " + worstModel.getName()); 
            } catch (Exception e) { 
                System.err.println("Warning: could not unload " + worstModel.getName() + 
                    " from runtime: " + e.getMessage() + ". Proceeding with DB cleanup."); 
            } 
    
            // Mark as empty slot instead of hard delete — preserves score history 
            worstModel.setIsEmpty(true); 
            worstModel.setSlotLabel("Empty Slot · was " + worstModel.getName().replaceAll("\\.gguf$", "")); 
            modelInstanceRepository.save(worstModel); 
            System.out.println("Marked slot empty for: " + worstModel.getName()); 
    
            // Step 2: Load replacement 
            try { 
                String loadUrl = getSystemUrl(systemOfWorstModel) + "/api/models/load"; 
                Map<String, String> loadBody = Map.of("name", replacementName, "path", replacementPath); 
                Map<String, Object> loadResponse = restTemplate.postForObject(loadUrl, loadBody, Map.class); 
    
                // Fill the empty slot we just created — inherits the slot's score history 
                // Re-fetch to get the updated empty slot record 
                ModelInstance slot = modelInstanceRepository.findById(worstModel.getId()).orElse(null); 
                if (slot != null) { 
                    slot.setName(replacementName); 
                    slot.setPath(replacementPath); 
                    slot.setIsEmpty(false); 
                    slot.setSlotLabel(null); 
                    slot.setScore(0.0); // New model starts fresh 
                    slot.setVotes(0); 
                    slot.setWins(0); 
                    slot.setLosses(0); 
                
                    if (loadResponse != null) { 
                        Object gpuLayers = loadResponse.get("gpu_layers"); 
                        if (gpuLayers instanceof Number) { 
                            slot.setGpuLayers(((Number) gpuLayers).intValue()); 
                        } 
                    } 
                
                    modelInstanceRepository.save(slot); 
                    System.out.println("Rotation complete: " + worstModel.getName() + " -> " + replacementName); 
                } else { 
                    // Fallback — create fresh record if slot somehow disappeared 
                    ModelInstance newModel = new ModelInstance(); 
                    newModel.setName(replacementName); 
                    newModel.setPath(replacementPath); 
                    newModel.setSystemId(systemOfWorstModel.getId()); 
                    newModel.setClusterId(cluster.getId()); 
                    newModel.setScore(0.0); 
                    newModel.setVotes(0); 
                    newModel.setWins(0); 
                    newModel.setLosses(0); 
                
                    if (loadResponse != null) { 
                        Object gpuLayers = loadResponse.get("gpu_layers"); 
                        if (gpuLayers instanceof Number) { 
                            newModel.setGpuLayers(((Number) gpuLayers).intValue()); 
                        } 
                    } 
                
                    modelInstanceRepository.save(newModel); 
                    System.out.println("Rotation complete (new slot): " + worstModel.getName() + " -> " + replacementName); 
                } 
    
            } catch (Exception e) { 
                System.err.println("Rotation warning: worst model removed but failed to load " + 
                    replacementName + ": " + e.getMessage() + ". Slot is now empty."); 
            } 
    
        } catch (Exception e) { 
            System.err.println("Rotation failed during scan: " + e.getMessage()); 
        } 
    }

    @Transactional 
    public void handleNodeFailure(User sys, int maxTimeouts) { 
        // Re-fetch to avoid stale state from async thread 
        User freshUser = userRepository.findById(sys.getId()).orElse(null); 
        if (freshUser == null) return; 

        int current = freshUser.getConsecutiveTimeouts() != null ? freshUser.getConsecutiveTimeouts() : 0; 
        current++; 
        freshUser.setConsecutiveTimeouts(current); 

        if (current >= maxTimeouts) { 
            freshUser.setIsOnline(false); 
            System.err.println("Node marked OFFLINE after " + current + 
                " consecutive timeouts: " + freshUser.getEmail()); 
        } else { 
            System.err.println("Node timeout " + current + "/" + maxTimeouts + 
                " for: " + freshUser.getEmail()); 
        } 

        userRepository.save(freshUser); 
    } 

    @Transactional 
    public void resetNodeTimeouts(User sys) { 
        // Only update if there's something to reset — avoids unnecessary DB writes 
        if (sys.getConsecutiveTimeouts() != null && sys.getConsecutiveTimeouts() > 0) { 
            User freshUser = userRepository.findById(sys.getId()).orElse(null); 
            if (freshUser == null) return; 
            freshUser.setConsecutiveTimeouts(0); 
            freshUser.setIsOnline(true); 
            userRepository.save(freshUser); 
        } 
    } 

    @Transactional
    public void manuallyRecoverNode(String requestingUserEmail, Integer clusterId, Integer nodeId) {
        User requestingUser = userRepository.findByEmail(requestingUserEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        boolean isHost = membershipRepository.findByUserIdAndClusterId(requestingUser.getId(), clusterId)
                .map(UserClusterMembership::getIsHost)
                .orElse(false);
        if (!isHost) {
            throw new RuntimeException("Only the cluster host can manually recover nodes");
        }

        User targetNode = userRepository.findById(nodeId)
                .orElseThrow(() -> new RuntimeException("Node not found"));

        boolean nodeInCluster = membershipRepository
                .existsByUserIdAndClusterId(targetNode.getId(), clusterId);
        if (!nodeInCluster) {
            throw new RuntimeException("Node is not in your cluster");
        }

        String pingUrl = getSystemUrl(targetNode) + "/api/system-stats";
        try {
            restTemplate.getForObject(pingUrl, Object.class);
            targetNode.setIsOnline(true);
            targetNode.setConsecutiveTimeouts(0);
            userRepository.save(targetNode);
            System.out.println("Node manually recovered: " + targetNode.getEmail());
        } catch (Exception e) {
            throw new RuntimeException("Node is still unreachable: " + e.getMessage()
                    + ". Cannot recover a node that isn't responding.");
        }
    } 
    
    public List<Map<String, Object>> getNodeStatuses(String requestingUserEmail, Integer clusterId) {
        User requestingUser = userRepository.findByEmail(requestingUserEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!membershipRepository.existsByUserIdAndClusterId(requestingUser.getId(), clusterId)) {
            throw new RuntimeException("User is not a member of this cluster");
        }

        List<Integer> memberIds = membershipRepository.findByClusterId(clusterId)
                .stream().map(m -> m.getUserId()).collect(Collectors.toList());
        List<User> nodes = userRepository.findAllById(memberIds);

        return nodes.stream().map(u -> {
            Map<String, Object> status = new HashMap<>();
            status.put("nodeId", u.getId());
            status.put("email", u.getEmail());
            status.put("accountName", u.getAccountName());
            status.put("isOnline", u.getIsOnline());
            status.put("consecutiveTimeouts", u.getConsecutiveTimeouts());
            status.put("isHost", u.getIsHost());
            return status;
        }).collect(Collectors.toList());
    }

    public List<Map<String, Object>> getModelNotes(String requestingUserEmail, Integer clusterId) {
        User requestingUser = userRepository.findByEmail(requestingUserEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        boolean isHost = membershipRepository.findByUserIdAndClusterId(requestingUser.getId(), clusterId)
                .map(UserClusterMembership::getIsHost)
                .orElse(false);
        if (!isHost) {
            throw new RuntimeException("Only the cluster host can view model notes");
        }

        List<ModelInstance> models = modelInstanceRepository.findByClusterId(clusterId);

        return models.stream().map(m -> {
            Map<String, Object> noteEntry = new HashMap<>();
            noteEntry.put("modelId", m.getId());
            noteEntry.put("modelName", m.getName());
            noteEntry.put("systemId", m.getSystemId());
            noteEntry.put("cacheMemory", m.getCacheMemory());
            noteEntry.put("score", m.getScore());
            noteEntry.put("votes", m.getVotes());
            String notes = m.getCacheMemory();
            int wordCount = (notes == null || notes.isBlank()) ? 0 : notes.trim().split("\\s+").length;
            noteEntry.put("wordCount", wordCount);
            return noteEntry;
        }).collect(Collectors.toList());
    }

    /**
     * Pipeline consensus — same generate+vote logic as runConsensus,
     * but does NOT update session counters, trigger rotation, or run discussion.
     * This lets you run 300 questions without blowing up the session every 10.
     */
    public Map<String, Object> runPipelineConsensus(String userEmail, String prompt, String systemPrompt, Integer clusterId) {
        User currentUser = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Find cluster by id if provided, else find first host cluster
        final Cluster cluster;
        if (clusterId != null) {
            cluster = clusterRepository.findById(clusterId)
                    .orElseThrow(() -> new RuntimeException("Cluster not found"));
            // Verify user is host of this cluster
            boolean isHost = membershipRepository.findByUserIdAndClusterId(currentUser.getId(), clusterId)
                    .map(UserClusterMembership::getIsHost)
                    .orElse(false);
            // Fallback: check legacy hostId field on cluster directly
            if (!isHost) {
                isHost = cluster.getHostId() != null && cluster.getHostId().equals(currentUser.getId());
            }
            if (!isHost) {
                throw new RuntimeException("User is not a host of this cluster");
            }
            // Auto-repair: if user IS the host by hostId but membership is missing, recreate it
            if (isHost && membershipRepository.findByUserIdAndClusterId(currentUser.getId(), clusterId).isEmpty()) {
                System.out.println("Auto-repairing missing host membership for user "
                        + currentUser.getId() + " cluster " + clusterId);
                UserClusterMembership repair = new UserClusterMembership(currentUser.getId(), clusterId, true);
                membershipRepository.save(repair);
            }
        } else {
            // Fallback: find first host cluster (for legacy requests without clusterId)
            var hostMembership = membershipRepository.findByUserId(currentUser.getId()).stream()
                    .filter(UserClusterMembership::getIsHost)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("User is not a host of any cluster"));
            cluster = clusterRepository.findById(hostMembership.getClusterId())
                    .orElseThrow(() -> new RuntimeException("Cluster not found"));
        }

        List<Integer> memberIds = membershipRepository.findByClusterId(cluster.getId())
                .stream().map(m -> m.getUserId()).collect(Collectors.toList());
        List<User> systems = userRepository.findAllById(memberIds);

        // Reset timeout counters so slow previous questions don't permanently mark nodes offline
        for (User sys : systems) {
            if (Boolean.TRUE.equals(sys.getIsOnline()) &&
                    sys.getConsecutiveTimeouts() != null && sys.getConsecutiveTimeouts() > 0) {
                sys.setConsecutiveTimeouts(0);
                userRepository.save(sys);
            }
        }

        // Floor: never timeout faster than 3 minutes regardless of cluster setting
        final int timeoutSeconds = Math.max(cluster.getNodeTimeoutSeconds(), 180);
        final int maxTimeouts = Math.max(cluster.getMaxNodeTimeouts(), 10);

        // === GENERATE ===
        List<Map<String, String>> allAnswers = new ArrayList<>();
        List<CompletableFuture<Void>> genTasks = new ArrayList<>();

        for (User sys : systems) {
            if (!Boolean.TRUE.equals(sys.getIsOnline())) continue;
            CompletableFuture<Void> task = CompletableFuture.runAsync(() -> {
                try {
                    Map<String, String> body = Map.of("prompt", prompt, "system_prompt", systemPrompt);
                    List<Map<String, Object>> responses = restTemplate.postForObject(
                            getSystemUrl(sys) + "/api/consensus/generate", body, List.class);
                    if (responses != null) {
                        synchronized (allAnswers) {
                            for (Map<String, Object> resp : responses) {
                                String modelName = (String) resp.get("model");
                                String answer = (String) resp.get("answer");
                                if (modelName == null || answer == null) {
                                    System.err.println("[Pipeline] Skipping response with null model or answer from " + sys.getEmail());
                                    continue;
                                }
                                Map<String, String> entry = new HashMap<>();
                                entry.put("model", modelName);
                                entry.put("answer", answer);
                                entry.put("path", (String) resp.getOrDefault("path", ""));
                                entry.put("systemId", sys.getId().toString());
                                allAnswers.add(entry);
                            }
                        }
                    }
                    resetNodeTimeouts(sys);
                } catch (Exception e) {
                    System.err.println("[Pipeline] Generate failed from " + sys.getEmail() + ": " + e.getMessage());
                    handleNodeFailure(sys, maxTimeouts);
                }
            }).orTimeout(timeoutSeconds, TimeUnit.SECONDS).exceptionally(ex -> {
                if (ex instanceof TimeoutException || (ex.getCause() instanceof TimeoutException)) {
                    System.err.println("[Pipeline] Generate timeout: " + sys.getEmail());
                    handleNodeFailure(sys, maxTimeouts);
                }
                return null;
            });
            genTasks.add(task);
        }
        CompletableFuture.allOf(genTasks.toArray(new CompletableFuture[0])).join();

        if (allAnswers.isEmpty()) {
            throw new RuntimeException("No models responded. Check that models are loaded and the ai-service is reachable.");
        }

        // === VOTE ===
        List<Map<String, Object>> allRatings = new ArrayList<>();
        List<CompletableFuture<Void>> rateTasks = new ArrayList<>();

        for (User sys : systems) {
            if (!Boolean.TRUE.equals(sys.getIsOnline())) continue;
            CompletableFuture<Void> task = CompletableFuture.runAsync(() -> {
                try {
                    Map<String, Object> body = Map.of(
                        "prompt", prompt,
                        "answers", allAnswers,
                        "system_prompt", "You are an expert evaluator."
                    );
                    List<Map<String, Object>> ratings = restTemplate.postForObject(
                            getSystemUrl(sys) + "/api/consensus/rate", body, List.class);
                    if (ratings != null) {
                        synchronized (allRatings) { allRatings.addAll(ratings); }
                    }
                    resetNodeTimeouts(sys);
                } catch (Exception e) {
                    System.err.println("[Pipeline] Rate failed from " + sys.getEmail() + ": " + e.getMessage());
                    handleNodeFailure(sys, maxTimeouts);
                }
            }).orTimeout(timeoutSeconds, TimeUnit.SECONDS).exceptionally(ex -> {
                if (ex instanceof TimeoutException || (ex.getCause() instanceof TimeoutException)) {
                    System.err.println("[Pipeline] Rate timeout: " + sys.getEmail());
                    handleNodeFailure(sys, maxTimeouts);
                }
                return null;
            });
            rateTasks.add(task);
        }
        CompletableFuture.allOf(rateTasks.toArray(new CompletableFuture[0])).join();

        // === SCORE ===
        Map<String, List<Integer>> modelToScores = new HashMap<>();
        for (Map<String, Object> ratingEntry : allRatings) {
            List<Map<String, Object>> ratings = (List<Map<String, Object>>) ratingEntry.get("ratings");
            if (ratings != null) {
                for (Map<String, Object> r : ratings) {
                    String modelName = (String) r.get("model");
                    Integer score = (Integer) r.get("score");
                    if (modelName != null && score != null) {
                        modelToScores.computeIfAbsent(modelName, k -> new ArrayList<>()).add(score);
                    }
                }
            }
        }

        List<Map<String, Object>> finalResponses = new ArrayList<>();
        for (Map<String, String> ans : allAnswers) {
            String modelName = ans.get("model");
            List<Integer> scores = modelToScores.getOrDefault(modelName, List.of(3));
            double avg = scores.stream().mapToInt(Integer::intValue).average().orElse(3.0);
            Map<String, Object> resp = new HashMap<>(ans);
            resp.put("avg_score", avg);
            resp.put("scores", scores);
            finalResponses.add(resp);
        }

        Map<String, Object> winner = finalResponses.stream()
                .max(Comparator.comparingDouble(r -> (Double) r.get("avg_score")))
                .orElse(finalResponses.get(0));

        // NOTE: No session counter update, no rotation, no discussion.
        // The pipeline is a bulk data collection tool, not a training run.
        Map<String, Object> result = new HashMap<>();
        result.put("winner", winner);
        result.put("all_responses", finalResponses);
        return result;
    }
}
