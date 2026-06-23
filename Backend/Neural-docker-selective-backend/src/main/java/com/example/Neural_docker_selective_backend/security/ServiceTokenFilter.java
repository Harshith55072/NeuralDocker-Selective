package com.example.Neural_docker_selective_backend.security; 
 
import jakarta.servlet.FilterChain; 
import jakarta.servlet.ServletException; 
import jakarta.servlet.http.HttpServletRequest; 
import jakarta.servlet.http.HttpServletResponse; 
import org.springframework.beans.factory.annotation.Value; 
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken; 
import org.springframework.security.core.authority.SimpleGrantedAuthority; 
import org.springframework.security.core.context.SecurityContextHolder; 
import org.springframework.stereotype.Component; 
import org.springframework.web.filter.OncePerRequestFilter; 
 
import java.io.IOException; 
import java.util.List; 
 
@Component 
public class ServiceTokenFilter extends OncePerRequestFilter { 
 
    @Value("${service.token}") 
    private String serviceToken; 
 
    // Endpoints that internal services are allowed to call 
    private static final List<String> SERVICE_ALLOWED_PATHS = List.of( 
        "/api/v1/clusters/register-tunnel" 
    ); 
 
    @Override 
    protected void doFilterInternal( 
            HttpServletRequest request, 
            HttpServletResponse response, 
            FilterChain filterChain 
    ) throws ServletException, IOException { 
 
        String path = request.getRequestURI(); 
 
        // Only process requests to service-allowed paths 
        boolean isServicePath = SERVICE_ALLOWED_PATHS.stream() 
                .anyMatch(path::startsWith); 
 
        if (!isServicePath) { 
            filterChain.doFilter(request, response); 
            return; 
        } 
 
        String serviceHeader = request.getHeader("X-Service-Token"); 
 
        if (serviceHeader != null && serviceHeader.equals(serviceToken)) { 
            // Valid service token — create a synthetic authentication 
            // so Spring Security treats this request as authenticated 
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken( 
                "ngrok-monitor-service", 
                null, 
                List.of(new SimpleGrantedAuthority("ROLE_SERVICE")) 
            ); 
            SecurityContextHolder.getContext().setAuthentication(auth); 
            System.out.println("Service token authenticated for path: " + path); 
        } else if (serviceHeader != null) { 
            // Token provided but wrong — reject immediately 
            System.err.println("Invalid service token attempt on path: " + path); 
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED); 
            response.setContentType("application/json"); 
            response.getWriter().write("{\"error\": \"Invalid service token\"}"); 
            return; 
        } 
        // If no service token header — fall through to normal JWT filter 
        // This allows the endpoint to still work with a regular JWT if needed 
 
        filterChain.doFilter(request, response); 
    } 
} 
