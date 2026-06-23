package com.example.Neural_docker_selective_backend.repository;

import com.example.Neural_docker_selective_backend.model.UserClusterMembership;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserClusterMembershipRepository extends JpaRepository<UserClusterMembership, Integer> {

    // All clusters a user belongs to
    List<UserClusterMembership> findByUserId(Integer userId);

    // All members of a cluster
    List<UserClusterMembership> findByClusterId(Integer clusterId);

    // Specific membership lookup
    Optional<UserClusterMembership> findByUserIdAndClusterId(Integer userId, Integer clusterId);

    // All hosts of a cluster
    List<UserClusterMembership> findByClusterIdAndIsHost(Integer clusterId, Boolean isHost);

    // All clusters where user is host
    List<UserClusterMembership> findByUserIdAndIsHost(Integer userId, Boolean isHost);

    // Check if membership exists
    boolean existsByUserIdAndClusterId(Integer userId, Integer clusterId);

    // Find all host memberships across all clusters
    List<UserClusterMembership> findByIsHost(Boolean isHost);

    // All worker memberships for a cluster (non-host)
    default List<UserClusterMembership> findWorkersByClusterId(Integer clusterId) {
        return findByClusterIdAndIsHost(clusterId, false);
    }

    // Delete a specific membership
    void deleteByUserIdAndClusterId(Integer userId, Integer clusterId);
}
