package com.example.Neural_docker_selective_backend.controller;

import com.example.Neural_docker_selective_backend.dto.AuthenticationRequest;
import com.example.Neural_docker_selective_backend.dto.AuthenticationResponse;
import com.example.Neural_docker_selective_backend.dto.RegisterRequest;
import com.example.Neural_docker_selective_backend.service.AuthenticationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthenticationController {

    private final AuthenticationService service;

    public AuthenticationController(AuthenticationService service) {
        this.service = service;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthenticationResponse> register(
            @RequestBody RegisterRequest request,
            HttpServletRequest servletRequest
    ) {
        return ResponseEntity.ok(service.register(request, servletRequest));
    }

    @PostMapping("/authenticate")
    public ResponseEntity<AuthenticationResponse> authenticate(
            @RequestBody AuthenticationRequest request,
            HttpServletRequest servletRequest
    ) {
        return ResponseEntity.ok(service.authenticate(request, servletRequest));
    }
}
