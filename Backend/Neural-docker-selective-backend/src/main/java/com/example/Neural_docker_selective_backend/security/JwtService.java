package com.example.Neural_docker_selective_backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {

    @Value("${application.security.jwt.secret-key}")
    private String secretKey;
    @Value("${application.security.jwt.expiration}")
    private long jwtExpiration;

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    public String generateToken(UserDetails userDetails) {
        return generateToken(new HashMap<>(), userDetails);
    }

    // --- Backend -> AI service calls (audit finding S3) ---------------------------------
    // The AI service requires a JWT signed with the shared secret. The backend mints a
    // short-lived one per outgoing request. It carries scope=ai-service so that
    // JwtAuthenticationFilter can refuse to accept it as a login for THIS backend: if the
    // token ever reaches a node that isn't trusted (e.g. a worker supplied a bogus
    // tunnel URL), it cannot be replayed against the API.
    private static final String AI_SCOPE_CLAIM = "scope";
    private static final String AI_SCOPE = "ai-service";
    // 5 minutes rather than seconds so machines whose clocks differ a little still agree.
    private static final long AI_TOKEN_TTL_MS = 5 * 60 * 1000L;

    public String generateAiServiceToken() {
        long now = System.currentTimeMillis();
        return Jwts
                .builder()
                .claim(AI_SCOPE_CLAIM, AI_SCOPE)
                .subject("backend-gateway")
                .issuedAt(new Date(now))
                .expiration(new Date(now + AI_TOKEN_TTL_MS))
                .signWith(getSignInKey())
                .compact();
    }

    public boolean isAiServiceToken(String token) {
        return AI_SCOPE.equals(extractClaim(token, c -> c.get(AI_SCOPE_CLAIM, String.class)));
    }

    public String generateToken(Map<String, Object> extraClaims, UserDetails userDetails) {
        return buildToken(extraClaims, userDetails, jwtExpiration);
    }

    private String buildToken(Map<String, Object> extraClaims, UserDetails userDetails, long expiration) {
        return Jwts
                .builder()
                .claims(extraClaims)
                .subject(userDetails.getUsername())
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSignInKey())
                .compact();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return (username.equals(userDetails.getUsername())) && !isTokenExpired(token);
    }

    private boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    private Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    private Claims extractAllClaims(String token) {
        return Jwts
                .parser()
                .verifyWith((javax.crypto.SecretKey) getSignInKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private Key getSignInKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
