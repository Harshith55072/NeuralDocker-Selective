package com.example.Neural_docker_selective_backend.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Refuses to start the backend with missing, weak, or publicly-known secrets.
 *
 * Why this exists (audit finding S1): the JWT secret used to fall back to a literal
 * that is committed to the public GitHub repo, and SERVICE_TOKEN fell back to a
 * placeholder. Anyone who knows those literals can forge a valid login token (or a
 * service call) against any deployment that never overrode them. Failing fast here
 * turns "silently insecure" into "won't boot until you fix .env".
 *
 * The JWT secret is deliberately shared across machines in this project's trust
 * model (see project.md), so a custom value copied between machines is fine. What is
 * rejected is empty, malformed, too short, or one of the known public defaults.
 */
@Component
public class SecretsValidator {

    // Known-public values that must never be accepted. Both were committed to the repo.
    private static final String LEGACY_PUBLIC_JWT_DEFAULT =
            "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
    private static final String LEGACY_PLACEHOLDER_SERVICE_TOKEN =
            "nd-service-token-change-me-in-production";

    private static final int MIN_JWT_SECRET_BYTES = 32;   // 256 bits
    private static final int MIN_SERVICE_TOKEN_CHARS = 16;

    @Value("${application.security.jwt.secret-key:}")
    private String jwtSecret;

    @Value("${service.token:}")
    private String serviceToken;

    @PostConstruct
    void validate() {
        List<String> problems = new ArrayList<>();

        String jwt = jwtSecret == null ? "" : jwtSecret.trim();
        if (jwt.isEmpty()) {
            problems.add("JWT_SECRET is not set.");
        } else if (jwt.equals(LEGACY_PUBLIC_JWT_DEFAULT)) {
            problems.add("JWT_SECRET is the publicly known default from the GitHub repo.");
        } else {
            try {
                byte[] decoded = Base64.getDecoder().decode(jwt);
                if (decoded.length < MIN_JWT_SECRET_BYTES) {
                    problems.add("JWT_SECRET is too short (" + decoded.length
                            + " bytes decoded, need at least " + MIN_JWT_SECRET_BYTES + ").");
                }
            } catch (IllegalArgumentException e) {
                problems.add("JWT_SECRET is not valid base64.");
            }
        }

        String token = serviceToken == null ? "" : serviceToken.trim();
        if (token.isEmpty()) {
            problems.add("SERVICE_TOKEN is not set.");
        } else if (token.equals(LEGACY_PLACEHOLDER_SERVICE_TOKEN)) {
            problems.add("SERVICE_TOKEN is the placeholder value from the GitHub repo.");
        } else if (token.length() < MIN_SERVICE_TOKEN_CHARS) {
            problems.add("SERVICE_TOKEN is too short (need at least "
                    + MIN_SERVICE_TOKEN_CHARS + " characters).");
        }

        if (!problems.isEmpty()) {
            StringBuilder msg = new StringBuilder("\n\n*** Refusing to start: insecure configuration ***\n");
            for (String p : problems) {
                msg.append("  - ").append(p).append('\n');
            }
            msg.append("\nFix: run run.bat (Windows) or ./setup.sh (Linux/macOS) - they generate strong\n")
               .append("values into .env automatically. Or set them yourself in .env:\n")
               .append("  JWT_SECRET    base64, at least 32 bytes   (openssl rand -base64 48)\n")
               .append("  SERVICE_TOKEN random string, 16+ chars    (openssl rand -hex 24)\n")
               .append("Machines that join the same cluster must share the same JWT_SECRET.\n");
            throw new IllegalStateException(msg.toString());
        }
    }
}
