package com.example.Neural_docker_selective_backend.service;

import com.example.Neural_docker_selective_backend.dto.AuthenticationRequest;
import com.example.Neural_docker_selective_backend.dto.AuthenticationResponse;
import com.example.Neural_docker_selective_backend.dto.RegisterRequest;
import com.example.Neural_docker_selective_backend.model.Role;
import com.example.Neural_docker_selective_backend.model.User;
import com.example.Neural_docker_selective_backend.repository.UserRepository;
import com.example.Neural_docker_selective_backend.security.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationService {

    private final UserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthenticationService(UserRepository repository, PasswordEncoder passwordEncoder, JwtService jwtService, AuthenticationManager authenticationManager) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
    }

    private String getClientIp(HttpServletRequest request) {
        String xf = request.getHeader("X-Forwarded-For");
        if (xf != null && !xf.isEmpty()) return xf.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    public AuthenticationResponse register(RegisterRequest request, HttpServletRequest servletRequest) {
        if (request.getEmail() == null || request.getEmail().isBlank()
                || request.getPassword() == null || request.getPassword().isBlank()
                || request.getAccountName() == null || request.getAccountName().isBlank()) {
            throw new RuntimeException("Account name, email, and password are all required.");
        }
        if (repository.findByEmail(request.getEmail()).isPresent()) {
            // Pre-check instead of relying on the DB's unique constraint to fail:
            // a raw DataIntegrityViolationException leaks the SQL statement, table/
            // column names, and constraint name straight to the client otherwise.
            throw new RuntimeException("An account with this email already exists.");
        }
        var user = User.builder()
                .accountName(request.getAccountName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(Role.USER)
                .score(1000.0)
                .isHost(false)
                .wins(0)
                .losses(0)
                .votes(0)
                .systemIp(getClientIp(servletRequest))
                .build();
        repository.save(user);
        var jwtToken = jwtService.generateToken(user);
        return AuthenticationResponse.builder()
                .token(jwtToken)
                .accountName(user.getAccountName())
                .email(user.getEmail())
                .userId(user.getId())
                .build();
    }

    public AuthenticationResponse authenticate(AuthenticationRequest request, HttpServletRequest servletRequest) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail(),
                        request.getPassword()
                )
        );
        var user = repository.findByEmail(request.getEmail())
                .orElseThrow();
        
        // Update system IP on every login
        user.setSystemIp(getClientIp(servletRequest));
        repository.save(user);

        var jwtToken = jwtService.generateToken(user);
        return AuthenticationResponse.builder()
                .token(jwtToken)
                .accountName(user.getAccountName())
                .email(user.getEmail())
                .userId(user.getId())
                .build();
    }
}
