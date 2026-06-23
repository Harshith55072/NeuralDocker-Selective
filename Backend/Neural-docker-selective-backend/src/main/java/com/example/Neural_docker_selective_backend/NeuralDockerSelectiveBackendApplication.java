package com.example.Neural_docker_selective_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class NeuralDockerSelectiveBackendApplication {

	public static void main(String[] args) {

		SpringApplication.run(NeuralDockerSelectiveBackendApplication.class, args);
	}

}
