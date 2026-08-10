package com.example.Neural_docker_selective_backend.config;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    // Must come before the broader RuntimeException handler below (Spring picks
    // the most specific matching @ExceptionHandler) — a raw
    // DataIntegrityViolationException otherwise leaks the SQL statement, table/
    // column names, and constraint name straight to the client. Most call sites
    // that can hit this should pre-check and throw a friendly RuntimeException
    // instead (see AuthenticationService.register for an example) — this is the
    // safety net for anywhere that doesn't.
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrityViolation(DataIntegrityViolationException e) {
        return ResponseEntity.badRequest().body(Map.of("error", "That value conflicts with an existing record (likely already in use)."));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntimeException(RuntimeException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleException(Exception e) {
        return ResponseEntity.internalServerError().body(Map.of("error", "An unexpected error occurred: " + e.getMessage()));
    }
}
