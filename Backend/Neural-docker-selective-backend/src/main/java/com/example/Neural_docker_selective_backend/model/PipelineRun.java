package com.example.Neural_docker_selective_backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pipeline_run")
public class PipelineRun {

    public enum Status { RUNNING, PAUSED, DONE, ERROR, STOPPED }
    public enum OutputMode { WINNER_ONLY, ALL_MODELS }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false)
    private Integer clusterId;

    @Column(nullable = false)
    private Integer userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.RUNNING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OutputMode outputMode = OutputMode.WINNER_ONLY;

    /** Original file name for display */
    private String fileName;

    /** Total number of questions in this run */
    private Integer totalQuestions = 0;

    /** Index of the last question that completed successfully (0-based). -1 = none yet. */
    private Integer checkpointIndex = -1;

    /** Full questions list serialised as JSON: [{qid, text}, ...] */
    @Column(columnDefinition = "TEXT")
    private String questionsJson;

    /**
     * Accumulated answers serialised as JSON:
     * { "Q001": { "winner": "...", "winnerScore": 4.2, "models": [{model, answer, avg_score, scores:[]}] }, ... }
     * Patched incrementally after every answered question.
     */
    @Column(columnDefinition = "TEXT")
    private String answersJson = "{}";

    /** System prompt used for this run */
    @Column(columnDefinition = "TEXT")
    private String systemPrompt;

    /** Error count — incremented per failed question, never stops the run */
    private Integer errorCount = 0;

    @Column(nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt = LocalDateTime.now();

    // ── Getters & Setters ─────────────────────────────────────────────────

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public Integer getClusterId() { return clusterId; }
    public void setClusterId(Integer clusterId) { this.clusterId = clusterId; }

    public Integer getUserId() { return userId; }
    public void setUserId(Integer userId) { this.userId = userId; }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public OutputMode getOutputMode() { return outputMode; }
    public void setOutputMode(OutputMode outputMode) { this.outputMode = outputMode; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public Integer getTotalQuestions() { return totalQuestions != null ? totalQuestions : 0; }
    public void setTotalQuestions(Integer totalQuestions) { this.totalQuestions = totalQuestions; }

    public Integer getCheckpointIndex() { return checkpointIndex != null ? checkpointIndex : -1; }
    public void setCheckpointIndex(Integer checkpointIndex) { this.checkpointIndex = checkpointIndex; }

    public String getQuestionsJson() { return questionsJson; }
    public void setQuestionsJson(String questionsJson) { this.questionsJson = questionsJson; }

    public String getAnswersJson() { return answersJson != null ? answersJson : "{}"; }
    public void setAnswersJson(String answersJson) { this.answersJson = answersJson; }

    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }

    public Integer getErrorCount() { return errorCount != null ? errorCount : 0; }
    public void setErrorCount(Integer errorCount) { this.errorCount = errorCount; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}