package com.example.Neural_docker_selective_backend.repository;

import com.example.Neural_docker_selective_backend.model.ModelInstance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ModelInstanceRepository extends JpaRepository<ModelInstance, Integer> {
    List<ModelInstance> findByClusterId(Integer clusterId);
    Optional<ModelInstance> findBySystemIdAndName(Integer systemId, String name);
    List<ModelInstance> findAllBySystemIdAndName(Integer systemId, String name);
    List<ModelInstance> findBySystemId(Integer systemId);
}
