package com.example.Neural_docker_selective_backend.config;

import com.example.Neural_docker_selective_backend.repository.UserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.example.Neural_docker_selective_backend.security.JwtService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.web.client.RestTemplate;

@Configuration
public class ApplicationConfig {

    private final UserRepository repository;

    public ApplicationConfig(UserRepository repository) {
        this.repository = repository;
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return username -> repository.findByEmail(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService());
        authProvider.setPasswordEncoder(passwordEncoder());
        return authProvider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Every outgoing call made with these RestTemplates goes to an AI service (this
     * machine's, or another cluster node's through its tunnel), and the AI service
     * requires a JWT (audit finding S3). A fresh short-lived token is minted per request.
     */
    private static ClientHttpRequestInterceptor aiServiceAuth(JwtService jwtService) {
        return (request, body, execution) -> {
            request.getHeaders().set(HttpHeaders.AUTHORIZATION, "Bearer " + jwtService.generateAiServiceToken());
            return execution.execute(request, body);
        };
    }

    @Bean
    public RestTemplate restTemplate(JwtService jwtService) {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory = 
            new org.springframework.http.client.SimpleClientHttpRequestFactory(); 
        factory.setConnectTimeout(10000);   // 10s connect 
        factory.setReadTimeout(300000);     // 5 minutes, covers generate + rate for slow CPU models
        RestTemplate template = new RestTemplate(factory);
        template.getInterceptors().add(aiServiceAuth(jwtService));
        return template; 
    }

    @Bean("modelLoadRestTemplate")
    public RestTemplate modelLoadRestTemplate(JwtService jwtService) {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory = 
            new org.springframework.http.client.SimpleClientHttpRequestFactory(); 
        factory.setConnectTimeout(5000); 
        factory.setReadTimeout(600000); // 10 minutes
        RestTemplate template = new RestTemplate(factory);
        template.getInterceptors().add(aiServiceAuth(jwtService));
        return template; 
    }
}
