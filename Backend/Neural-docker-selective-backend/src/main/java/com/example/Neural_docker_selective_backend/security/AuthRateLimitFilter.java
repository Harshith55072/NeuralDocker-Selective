package com.example.Neural_docker_selective_backend.security;

import com.example.Neural_docker_selective_backend.ratelimit.RateLimiterRegistry;
import com.example.Neural_docker_selective_backend.ratelimit.TokenBucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Rate-limits the public, unauthenticated auth endpoints (register/login) by
 * client IP. These are the one place in the API that MUST stay reachable
 * without a token (see SecurityConfiguration's permitAll on /api/v1/auth/**),
 * which also makes them the only realistic target for credential-stuffing or
 * registration-spam against this app — nothing else is reachable pre-auth.
 *
 * Placed as the very first filter in the chain (before ServiceTokenFilter),
 * so an over-budget request gets rejected before doing any real work — no
 * JWT parsing, no DB lookup, nothing but a map read.
 */
@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {

    // Deliberately generous — this is meant to stop scripted abuse, not slow
    // down someone who mistypes their password a couple of times. Burst of 10,
    // refilling to a steady 10/minute.
    private static final long CAPACITY = 10;
    private static final long REFILL_TOKENS = 10;
    private static final long REFILL_PERIOD_MILLIS = 60_000;

    private final RateLimiterRegistry registry;

    public AuthRateLimitFilter(RateLimiterRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        if (!request.getRequestURI().startsWith("/api/v1/auth/")) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientIp = extractClientIp(request);
        TokenBucket bucket = registry.bucketFor("auth", clientIp,
                v -> new TokenBucket(CAPACITY, REFILL_TOKENS, REFILL_PERIOD_MILLIS));

        if (bucket.tryConsume()) {
            filterChain.doFilter(request, response);
            return;
        }

        long retryAfterSeconds = bucket.secondsUntilNextToken();
        response.setStatus(429); // HttpServletResponse has no SC_TOO_MANY_REQUESTS constant pre-Servlet 6
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"error\": \"Too many attempts. Try again in " + retryAfterSeconds + "s.\"}");
    }

    /**
     * Ngrok (and any reverse proxy) sits in front of the real client for
     * cross-machine requests, so request.getRemoteAddr() would just be the
     * tunnel's own address for every worker — useless as a rate-limit key.
     * X-Forwarded-For's first entry is the original client. Falls back to
     * getRemoteAddr() for direct local requests, which won't have the header.
     */
    private String extractClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
