package com.example.Neural_docker_selective_backend.dto;

public class AuthenticationResponse {
    private String token;
    private String accountName;
    private String email;
    private Integer userId;

    public AuthenticationResponse() {
    }

    public AuthenticationResponse(String token, String accountName, String email, Integer userId) {
        this.token = token;
        this.accountName = accountName;
        this.email = email;
        this.userId = userId;
    }

    public static AuthenticationResponseBuilder builder() {
        return new AuthenticationResponseBuilder();
    }

    public static class AuthenticationResponseBuilder {
        private String token;
        private String accountName;
        private String email;
        private Integer userId;

        public AuthenticationResponseBuilder token(String token) {
            this.token = token;
            return this;
        }

        public AuthenticationResponseBuilder accountName(String accountName) {
            this.accountName = accountName;
            return this;
        }

        public AuthenticationResponseBuilder email(String email) {
            this.email = email;
            return this;
        }

        public AuthenticationResponseBuilder userId(Integer userId) {
            this.userId = userId;
            return this;
        }

        public AuthenticationResponse build() {
            return new AuthenticationResponse(token, accountName, email, userId);
        }
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getAccountName() {
        return accountName;
    }

    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Integer getUserId() {
        return userId;
    }

    public void setUserId(Integer userId) {
        this.userId = userId;
    }
}
