package com.example.Neural_docker_selective_backend.config;

import com.example.Neural_docker_selective_backend.security.JwtAuthenticationFilter;
import com.example.Neural_docker_selective_backend.security.ServiceTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

    private final JwtAuthenticationFilter jwtAuthFilter;
    private final AuthenticationProvider authenticationProvider;
    private final ServiceTokenFilter serviceTokenFilter;

    public SecurityConfiguration(
            JwtAuthenticationFilter jwtAuthFilter,
            AuthenticationProvider authenticationProvider,
            ServiceTokenFilter serviceTokenFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.authenticationProvider = authenticationProvider;
        this.serviceTokenFilter = serviceTokenFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .authorizeHttpRequests(auth -> auth
                // Public auth endpoints — no token needed
                .requestMatchers("/api/v1/auth/**").permitAll()
                // Public cluster discovery — no token needed
                .requestMatchers("/api/v1/clusters/public").permitAll()
                .requestMatchers("/api/v1/clusters/public/**").permitAll()
                // Service endpoints — authenticated via ServiceTokenFilter
                // before this filter chain runs, so permit here
                .requestMatchers("/api/v1/clusters/register-tunnel").permitAll()
                // Everything else requires JWT
                .requestMatchers("/api/v1/clusters/**").authenticated()
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .authenticationProvider(authenticationProvider)
            // Service token filter runs first so it can authenticate
            // service requests before the JWT filter sees them
            .addFilterBefore(serviceTokenFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Allowed origins — includes localhost for dev and ngrok for distributed nodes
        // Add your production domain here when deploying
        configuration.setAllowedOrigins(Arrays.asList(
            // Local development
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080",
            "http://localhost:8081",
            // ngrok tunnels — allows any ngrok subdomain
            // This is needed for distributed nodes accessing the backend via tunnel
            "https://*.ngrok-free.app",
            "https://*.ngrok.io"
        ));

        configuration.setAllowedMethods(Arrays.asList(
            "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"
        ));

        configuration.setAllowedHeaders(Arrays.asList(
            "Authorization",
            "Content-Type",
            "X-Service-Token",
            "X-Requested-With",
            "Accept",
            "Origin"
        ));

        // Allow credentials for JWT auth
        configuration.setAllowCredentials(true);

        // Cache preflight for 1 hour to reduce OPTIONS requests
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}