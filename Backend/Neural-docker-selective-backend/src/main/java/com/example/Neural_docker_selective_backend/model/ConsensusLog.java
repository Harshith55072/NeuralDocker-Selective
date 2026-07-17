package com.example.Neural_docker_selective_backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Durable record of one interactive consensus round (ConsensusService.runConsensus).
 * Distinct from PipelineRun, which batches many questions from a file upload —
 * this is one row per prompt asked through the live cluster chat.
 */
@Entity
@Table(name = "consensus_log")
public class ConsensusLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false)
    private Integer clusterId;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String prompt;

    @Column(columnDefinition = "TEXT")
    private String systemPrompt;

    /** Name of the winning model for this round */
    private String winnerModel;

    /**
     * All per-model answers serialised as JSON:
     * [{ "model": "...", "answer": "...", "avg_score": 4.2, "scores": [4,5,3] }, ...]
     * Mirrors the "all_responses" shape already returned to the frontend by
     * runConsensus, so the frontend can reuse its existing response-card UI.
     */
    @Column(columnDefinition = "TEXT")
    private String answersJson;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    // ── Getters & Setters ─────────────────────────────────────────────────

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public Integer getClusterId() { return clusterId; }
    public void setClusterId(Integer clusterId) { this.clusterId = clusterId; }

    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }

    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }

    public String getWinnerModel() { return winnerModel; }
    public void setWinnerModel(String winnerModel) { this.winnerModel = winnerModel; }

    public String getAnswersJson() { return answersJson; }
    public void setAnswersJson(String answersJson) { this.answersJson = answersJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
