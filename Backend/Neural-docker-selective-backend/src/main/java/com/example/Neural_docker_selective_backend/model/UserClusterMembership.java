package com.example.Neural_docker_selective_backend.model;

import jakarta.persistence.*;

@Entity
@Table(name = "user_cluster_membership",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "cluster_id"}))
public class UserClusterMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id", nullable = false)
    private Integer userId;

    @Column(name = "cluster_id", nullable = false)
    private Integer clusterId;

    @Column(name = "is_host", nullable = false)
    private Boolean isHost = false;

    @Column(name = "resource_permission_granted", nullable = false)
    private Boolean resourcePermissionGranted = true;

    public UserClusterMembership() {}

    public UserClusterMembership(Integer userId, Integer clusterId, Boolean isHost) {
        this.userId = userId;
        this.clusterId = clusterId;
        this.isHost = isHost != null ? isHost : false;
        this.resourcePermissionGranted = true;
    }

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public Integer getUserId() { return userId; }
    public void setUserId(Integer userId) { this.userId = userId; }

    public Integer getClusterId() { return clusterId; }
    public void setClusterId(Integer clusterId) { this.clusterId = clusterId; }

    public Boolean getIsHost() { return isHost != null ? isHost : false; }
    public void setIsHost(Boolean isHost) { this.isHost = isHost; }

    public Boolean getResourcePermissionGranted() { return resourcePermissionGranted != null ? resourcePermissionGranted : true; }
    public void setResourcePermissionGranted(Boolean resourcePermissionGranted) { this.resourcePermissionGranted = resourcePermissionGranted; }
}
