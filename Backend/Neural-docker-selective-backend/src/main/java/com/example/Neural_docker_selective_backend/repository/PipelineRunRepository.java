package com.example.Neural_docker_selective_backend.repository;

import com.example.Neural_docker_selective_backend.model.PipelineRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PipelineRunRepository extends JpaRepository<PipelineRun, Integer> {

    /** All runs for a user, newest first — used for the run history panel */
    List<PipelineRun> findByUserIdOrderByCreatedAtDesc(Integer userId);

    /** Active runs for a user+cluster — used to detect/resume an interrupted run */
    List<PipelineRun> findByUserIdAndClusterIdAndStatus(
            Integer userId, Integer clusterId, PipelineRun.Status status);
}