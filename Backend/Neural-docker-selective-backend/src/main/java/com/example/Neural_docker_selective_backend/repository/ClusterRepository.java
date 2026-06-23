package com.example.Neural_docker_selective_backend.repository;

import com.example.Neural_docker_selective_backend.model.Cluster;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

public interface ClusterRepository extends JpaRepository<Cluster, Integer> {
    Optional<Cluster> findByHostId(Integer hostId);

    @Modifying
    @Transactional
    @Query("UPDATE Cluster c SET c.hostTunnelUrl = :url WHERE c.id = :clusterId")
    int updateHostTunnelUrl(@Param("clusterId") Integer clusterId, @Param("url") String url);
}
