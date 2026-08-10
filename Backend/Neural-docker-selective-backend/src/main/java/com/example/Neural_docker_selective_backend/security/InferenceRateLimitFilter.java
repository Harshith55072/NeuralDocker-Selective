package com.example.Neural_docker_selective_backend.security;

import com.example.Neural_docker_selective_backend.ratelimit.RateLimiterRegistry;
import com.example.Neural_docker_selective_backend.ratelimit.TokenBucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Rate-limits the endpoints that actually trigger GPU/CPU inference across
 * the cluster — the genuinely scarce resource here, unlike a typical REST
 * API where every endpoint costs roughly the same. Keyed per authenticated
 * user (not per IP) since the whole point is protecting shared compute from
 * any one account hammering it, regardless of which machine they're calling
 * from.
 *
 * Placed AFTER JwtAuthenticationFilter in the chain (see SecurityConfiguration)
 * so SecurityContextHolder is already populated when this runs — an
 * unauthenticated request never reaches here at all, it's already been
 * rejected with 401 upstream.
 */
@Component
public class InferenceRateLimitFilter extends OncePerRequestFilter {

    // Tighter than the auth limiter — each of these requests can tie up a
    // model across every node in the cluster for the duration of a consensus
    // round. Burst of 5, refilling to 20/minute — generous enough for normal
    // back-to-back question-asking, tight enough to stop a runaway loop (like
    // the /my-clusters 2-second polling issue found earlier this session)
    // from doing the same thing to something this expensive.
    private static final long CAPACITY = 5;
    private static final long REFILL_TOKENS = 20;
    private static final long REFILL_PERIOD_MILLIS = 60_000;

    private final RateLimiterRegistry registry;

    public InferenceRateLimitFilter(RateLimiterRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        if (!isRateLimitedRoute(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            // Shouldn't happen — this filter runs after JwtAuthenticationFilter,
            // and these routes require authentication — but fail open to the
            // normal auth check downstream rather than rate-limiting on a null key.
            filterChain.doFilter(request, response);
            return;
        }

        String userKey = auth.getName();
        TokenBucket bucket = registry.bucketFor("inference", userKey,
                v -> new TokenBucket(CAPACITY, REFILL_TOKENS, REFILL_PERIOD_MILLIS));

        if (bucket.tryConsume()) {
            filterChain.doFilter(request, response);
            return;
        }

        long retryAfterSeconds = bucket.secondsUntilNextToken();
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"error\": \"You're sending requests faster than the cluster can process them. Try again in "
                        + retryAfterSeconds + "s.\"}");
    }

    private boolean isRateLimitedRoute(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String method = request.getMethod();
        if (!"POST".equals(method)) return false;
        return uri.equals("/api/v1/clusters/consensus/ask")
                || uri.equals("/api/v1/pipeline/runs");
    }
}
