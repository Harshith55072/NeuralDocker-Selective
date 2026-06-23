package com.example.Neural_docker_selective_backend.controller;

import com.example.Neural_docker_selective_backend.model.Cluster;
import com.example.Neural_docker_selective_backend.model.PipelineRun;
import com.example.Neural_docker_selective_backend.model.User;
import com.example.Neural_docker_selective_backend.model.UserClusterMembership;
import com.example.Neural_docker_selective_backend.repository.ClusterRepository;
import com.example.Neural_docker_selective_backend.repository.PipelineRunRepository;
import com.example.Neural_docker_selective_backend.repository.UserClusterMembershipRepository;
import com.example.Neural_docker_selective_backend.repository.UserRepository;
import com.example.Neural_docker_selective_backend.service.ConsensusService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/pipeline")
public class PipelineController {

    private final PipelineRunRepository pipelineRunRepository;
    private final UserRepository userRepository;
    private final ClusterRepository clusterRepository;
    private final UserClusterMembershipRepository membershipRepository;

    public PipelineController(
            PipelineRunRepository pipelineRunRepository,
            UserRepository userRepository,
            ClusterRepository clusterRepository,
            UserClusterMembershipRepository membershipRepository) {
        this.pipelineRunRepository = pipelineRunRepository;
        this.userRepository = userRepository;
        this.clusterRepository = clusterRepository;
        this.membershipRepository = membershipRepository;
    }

    // ── Cluster status — polled by pipeline while waiting for post-session ────

    /**
     * GET /api/v1/pipeline/cluster-status?clusterId=X
     *
     * Returns whether post-session processing (discussion + rotation) is still
     * running, plus current session counters. The pipeline frontend polls this
     * after receiving session_ended=true and waits until isPostProcessing=false
     * before sending the next question.
     */
    @GetMapping("/cluster-status")
    public ResponseEntity<?> getClusterStatus(
            @RequestParam Integer clusterId,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User user = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            boolean isMember = membershipRepository
                    .findByUserIdAndClusterId(user.getId(), clusterId)
                    .isPresent();
            if (!isMember) {
                return ResponseEntity.status(403).body(Map.of("error", "Not a member of this cluster"));
            }

            Cluster cluster = clusterRepository.findById(clusterId)
                    .orElseThrow(() -> new RuntimeException("Cluster not found"));

            Map<String, Object> result = new HashMap<>();
            result.put("clusterId", clusterId);
            result.put("isPostProcessing", ConsensusService.isPostProcessing(clusterId));
            result.put("sessionAnswers", cluster.getSessionAnswers());
            result.put("sessionLimit", cluster.getSessionLimit());
            result.put("enableDiscussion", cluster.getEnableDiscussion());
            result.put("autoRotate", cluster.getAutoRotate());
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Pipeline run CRUD ─────────────────────────────────────────────────────

    /**
     * POST /api/v1/pipeline/runs
     *
     * Create a new pipeline run. Called once when the user clicks "Run Pipeline".
     * Body: { clusterId, fileName, totalQuestions, questionsJson, systemPrompt, outputMode }
     */
    @PostMapping("/runs")
    public ResponseEntity<?> createRun(
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User user = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            Integer clusterId = ((Number) payload.get("clusterId")).intValue();

            boolean isHost = membershipRepository
                    .findByUserIdAndClusterId(user.getId(), clusterId)
                    .map(UserClusterMembership::getIsHost)
                    .orElse(false);
            if (!isHost) {
                return ResponseEntity.status(403).body(Map.of("error", "Only the cluster host can run the pipeline"));
            }

            PipelineRun run = new PipelineRun();
            run.setClusterId(clusterId);
            run.setUserId(user.getId());
            run.setStatus(PipelineRun.Status.RUNNING);
            run.setFileName((String) payload.get("fileName"));
            run.setTotalQuestions(((Number) payload.get("totalQuestions")).intValue());
            run.setQuestionsJson((String) payload.get("questionsJson"));
            run.setSystemPrompt((String) payload.getOrDefault("systemPrompt", "You are a helpful AI assistant."));

            String outputModeStr = (String) payload.getOrDefault("outputMode", "WINNER_ONLY");
            run.setOutputMode(PipelineRun.OutputMode.valueOf(outputModeStr));

            run.setAnswersJson("{}");
            run.setCheckpointIndex(-1);
            run.setErrorCount(0);
            run.setCreatedAt(LocalDateTime.now());
            run.setUpdatedAt(LocalDateTime.now());

            PipelineRun saved = pipelineRunRepository.save(run);
            return ResponseEntity.ok(toMap(saved));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * GET /api/v1/pipeline/runs
     *
     * List the 20 most recent runs for the authenticated user (summary — no JSON blobs).
     */
    @GetMapping("/runs")
    public ResponseEntity<?> listRuns(Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User user = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            List<Map<String, Object>> runs = pipelineRunRepository
                    .findByUserIdOrderByCreatedAtDesc(user.getId())
                    .stream()
                    .limit(20)
                    .map(this::toMapSummary)
                    .collect(Collectors.toList());

            return ResponseEntity.ok(runs);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * GET /api/v1/pipeline/runs/{id}
     *
     * Fetch full run state including answersJson and questionsJson.
     * Called on page load when a runId is found in localStorage (reconnect).
     */
    @GetMapping("/runs/{id}")
    public ResponseEntity<?> getRun(
            @PathVariable Integer id,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User user = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            PipelineRun run = pipelineRunRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Run not found"));

            if (!run.getUserId().equals(user.getId())) {
                return ResponseEntity.status(403).body(Map.of("error", "Not your run"));
            }

            return ResponseEntity.ok(toMap(run));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * PATCH /api/v1/pipeline/runs/{id}
     *
     * Incremental update — called after every answered question.
     * Body can contain any subset of: { answersJson, checkpointIndex, status, errorCount }
     */
    @PatchMapping("/runs/{id}")
    public ResponseEntity<?> patchRun(
            @PathVariable Integer id,
            @RequestBody Map<String, Object> payload,
            Authentication authentication) {
        try {
            String userEmail = authentication.getName();
            User user = userRepository.findByEmail(userEmail)
                    .orElseThrow(() -> new RuntimeException("User not found"));

            PipelineRun run = pipelineRunRepository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Run not found"));

            if (!run.getUserId().equals(user.getId())) {
                return ResponseEntity.status(403).body(Map.of("error", "Not your run"));
            }

            if (payload.containsKey("answersJson")) {
                run.setAnswersJson((String) payload.get("answersJson"));
            }
            if (payload.containsKey("checkpointIndex")) {
                run.setCheckpointIndex(((Number) payload.get("checkpointIndex")).intValue());
            }
            if (payload.containsKey("status")) {
                run.setStatus(PipelineRun.Status.valueOf((String) payload.get("status")));
            }
            if (payload.containsKey("errorCount")) {
                run.setErrorCount(((Number) payload.get("errorCount")).intValue());
            }

            run.setUpdatedAt(LocalDateTime.now());
            PipelineRun saved = pipelineRunRepository.save(run);

            // Return lightweight ack — not the full run (answersJson can be very large)
            return ResponseEntity.ok(Map.of(
                    "id", saved.getId(),
                    "status", saved.getStatus().name(),
                    "checkpointIndex", saved.getCheckpointIndex(),
                    "errorCount", saved.getErrorCount(),
                    "updatedAt", saved.getUpdatedAt().toString()
            ));

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Full run — includes questionsJson + answersJson (used for fetch/reconnect) */
    private Map<String, Object> toMap(PipelineRun run) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", run.getId());
        m.put("clusterId", run.getClusterId());
        m.put("userId", run.getUserId());
        m.put("status", run.getStatus().name());
        m.put("outputMode", run.getOutputMode().name());
        m.put("fileName", run.getFileName());
        m.put("totalQuestions", run.getTotalQuestions());
        m.put("checkpointIndex", run.getCheckpointIndex());
        m.put("questionsJson", run.getQuestionsJson());
        m.put("answersJson", run.getAnswersJson());
        m.put("systemPrompt", run.getSystemPrompt());
        m.put("errorCount", run.getErrorCount());
        m.put("createdAt", run.getCreatedAt().toString());
        m.put("updatedAt", run.getUpdatedAt().toString());
        return m;
    }

    /** Summary — omits questionsJson + answersJson (used for list view) */
    private Map<String, Object> toMapSummary(PipelineRun run) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", run.getId());
        m.put("clusterId", run.getClusterId());
        m.put("status", run.getStatus().name());
        m.put("outputMode", run.getOutputMode().name());
        m.put("fileName", run.getFileName());
        m.put("totalQuestions", run.getTotalQuestions());
        m.put("checkpointIndex", run.getCheckpointIndex());
        m.put("errorCount", run.getErrorCount());
        m.put("createdAt", run.getCreatedAt().toString());
        m.put("updatedAt", run.getUpdatedAt().toString());
        return m;
    }
}