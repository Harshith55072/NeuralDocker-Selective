package com.example.Neural_docker_selective_backend.ratelimit;

/**
 * Hand-rolled token-bucket rate limiter. One instance = one client's budget.
 *
 * How it works: a bucket holds up to {@code capacity} tokens. Every request
 * that's allowed through consumes one token. Tokens refill continuously over
 * time at a rate of {@code refillTokens} per {@code refillPeriodMillis} — so
 * a client can burst up to {@code capacity} requests immediately, then has to
 * wait for tokens to trickle back in, rather than being cut off completely
 * for a fixed window (that's the main advantage over a naive "N requests per
 * minute, reset on the minute" counter, which lets a client spend its whole
 * budget right at the boundary and then again right after — effectively
 * doubling the real burst rate).
 *
 * Not distributed — this is in-memory, per-JVM-instance state, which is
 * intentional here: each NeuralDocker node is a single Spring Boot instance
 * (no horizontal scaling behind a load balancer), so there's no need for
 * Redis-backed shared state to make this correct.
 */
public class TokenBucket {

    private final long capacity;
    private final long refillTokens;
    private final long refillPeriodMillis;

    private double availableTokens;
    private long lastRefillTimestamp;

    public TokenBucket(long capacity, long refillTokens, long refillPeriodMillis) {
        this.capacity = capacity;
        this.refillTokens = refillTokens;
        this.refillPeriodMillis = refillPeriodMillis;
        this.availableTokens = capacity;
        this.lastRefillTimestamp = System.currentTimeMillis();
    }

    /**
     * Attempts to consume one token. Returns true if allowed, false if the
     * client is over budget right now. Synchronized because a single bucket
     * instance can be hit concurrently by parallel requests from the same
     * client (e.g. a browser firing several fetches at once).
     */
    public synchronized boolean tryConsume() {
        refill();
        if (availableTokens >= 1.0) {
            availableTokens -= 1.0;
            return true;
        }
        return false;
    }

    /** Seconds until at least one token will be available — used for the Retry-After header. */
    public synchronized long secondsUntilNextToken() {
        refill();
        if (availableTokens >= 1.0) return 0;
        double missing = 1.0 - availableTokens;
        double millisPerToken = (double) refillPeriodMillis / (double) refillTokens;
        return Math.max(1, (long) Math.ceil((missing * millisPerToken) / 1000.0));
    }

    /** True if this bucket hasn't been touched in a while — safe to evict and free memory. */
    public synchronized boolean isIdleSince(long cutoffTimestamp) {
        return lastRefillTimestamp < cutoffTimestamp && availableTokens >= capacity;
    }

    private void refill() {
        long now = System.currentTimeMillis();
        long elapsed = now - lastRefillTimestamp;
        if (elapsed <= 0) return;
        double tokensToAdd = (elapsed / (double) refillPeriodMillis) * refillTokens;
        if (tokensToAdd > 0) {
            availableTokens = Math.min(capacity, availableTokens + tokensToAdd);
            lastRefillTimestamp = now;
        }
    }
}
