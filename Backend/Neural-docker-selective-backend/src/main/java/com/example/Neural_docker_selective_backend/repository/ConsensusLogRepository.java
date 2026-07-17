package com.example.Neural_docker_selective_backend.repository;

import com.example.Neural_docker_selective_backend.model.ConsensusLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ConsensusLogRepository extends JpaRepository<ConsensusLog, Integer> {

    /** History for a cluster, newest first — used by the durable history endpoint */
    List<ConsensusLog> findByClusterIdOrderByCreatedAtDesc(Integer clusterId, Pageable pageable);
}
