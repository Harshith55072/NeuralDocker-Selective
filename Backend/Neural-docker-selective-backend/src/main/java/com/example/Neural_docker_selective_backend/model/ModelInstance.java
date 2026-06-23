package com.example.Neural_docker_selective_backend.model;

import jakarta.persistence.*;

@Entity
@Table(name = "model_instance")
public class ModelInstance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String name;
    private String path;
    private Integer systemId;
    private Integer clusterId;
    
    @Column(name = "gpu_layers")
    private Integer gpuLayers = 0;
    
    private Double score = 0.0;
    private Integer wins = 0;
    private Integer losses = 0;
    private Integer votes = 0;

    @Column(name = "cache_memory", columnDefinition = "TEXT")
    private String cacheMemory = "";

    @Column(name = "is_empty") 
    private Boolean isEmpty = false; 
 
    private String slotLabel; 

    private java.time.LocalDateTime loadedAt;

    // getters and setters
    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public Integer getSystemId() { return systemId; }
    public void setSystemId(Integer systemId) { this.systemId = systemId; }
    public Integer getClusterId() { return clusterId; }
    public void setClusterId(Integer clusterId) { this.clusterId = clusterId; }
    public Integer getGpuLayers() { return gpuLayers != null ? gpuLayers : 0; }
    public void setGpuLayers(Integer gpuLayers) { this.gpuLayers = gpuLayers; }
    public Double getScore() { return score != null ? score : 0.0; }
    public void setScore(Double score) { this.score = score; }
    public Integer getWins() { return wins != null ? wins : 0; }
    public void setWins(Integer wins) { this.wins = wins; }
    public Integer getLosses() { return losses != null ? losses : 0; }
    public void setLosses(Integer losses) { this.losses = losses; }
    public Integer getVotes() { return votes != null ? votes : 0; }
    public void setVotes(Integer votes) { this.votes = votes; }

    public String getCacheMemory() {
        return cacheMemory != null ? cacheMemory : "";
    }

    public void setCacheMemory(String cacheMemory) {
        this.cacheMemory = cacheMemory;
    }

    public Boolean getIsEmpty() { 
        return isEmpty != null ? isEmpty : false; 
    } 
 
    public void setIsEmpty(Boolean isEmpty) { 
        this.isEmpty = isEmpty; 
    } 
 
    public String getSlotLabel() { 
        return slotLabel; 
    } 
 
    public void setSlotLabel(String slotLabel) { 
        this.slotLabel = slotLabel; 
    } 

    public java.time.LocalDateTime getLoadedAt() {
        return loadedAt;
    }

    public void setLoadedAt(java.time.LocalDateTime loadedAt) {
        this.loadedAt = loadedAt;
    }
}
