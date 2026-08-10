package com.example.Neural_docker_selective_backend.ratelimit;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/**
 * Holds one TokenBucket per client key (IP address, or account email —
 * whichever the caller chooses) per named rule. Shared by both rate-limit
 * filters so they don't duplicate bucket-management/cleanup logic.
 *
 * Buckets live in a plain ConcurrentHashMap forever unless evicted — for a
 * long-running node that could mean one bucket per distinct IP that's ever
 * hit the auth endpoints, which slowly leaks memory. evictIdleBuckets() runs
 * on a schedule and drops any bucket that's both been quiet for a while AND
 * is back at full capacity (i.e. genuinely idle, not just a client that's
 * currently rate-limited and would get a fresh bucket — with fresh burst
 * capacity — if we evicted it mid-limit).
 */
@Component
public class RateLimiterRegistry {

    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    /** Gets this key's bucket for a rule, creating it on first use. ruleName namespaces the key so the same client can have independent budgets per rule (e.g. "auth" vs "inference"). */
    public TokenBucket bucketFor(String ruleName, String clientKey, Function<Void, TokenBucket> factory) {
        return buckets.computeIfAbsent(ruleName + ":" + clientKey, k -> factory.apply(null));
    }

    @Scheduled(fixedRate = 10 * 60 * 1000) // every 10 minutes
    public void evictIdleBuckets() {
        long cutoff = System.currentTimeMillis() - (30 * 60 * 1000); // idle for 30+ min
        buckets.entrySet().removeIf(entry -> entry.getValue().isIdleSince(cutoff));
    }

    /** Exposed for tests/inspection — not used in request handling. */
    public int trackedClientCount() {
        return buckets.size();
    }
}
