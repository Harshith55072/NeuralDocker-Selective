package com.example.Neural_docker_selective_backend.dto;

public class RegisterRequest {
    private String accountName;
    private String email;
    private String password;

    public RegisterRequest() {
    }

    public RegisterRequest(String accountName, String email, String password) {
        this.accountName = accountName;
        this.email = email;
        this.password = password;
    }

    public static RegisterRequestBuilder builder() {
        return new RegisterRequestBuilder();
    }

    public static class RegisterRequestBuilder {
        private String accountName;
        private String email;
        private String password;

        public RegisterRequestBuilder accountName(String accountName) {
            this.accountName = accountName;
            return this;
        }

        public RegisterRequestBuilder email(String email) {
            this.email = email;
            return this;
        }

        public RegisterRequestBuilder password(String password) {
            this.password = password;
            return this;
        }

        public RegisterRequest build() {
            return new RegisterRequest(accountName, email, password);
        }
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

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
