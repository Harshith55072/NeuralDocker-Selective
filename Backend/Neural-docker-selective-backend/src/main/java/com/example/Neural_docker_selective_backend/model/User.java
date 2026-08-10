package com.example.Neural_docker_selective_backend.model;

import jakarta.persistence.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Entity
@Table(name = "_user")
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    
    private String accountName;
    
    @Column(unique = true)
    private String email;
    
    private String password;

    @Enumerated(EnumType.STRING)
    private Role role;

    private Integer clusterId;
    private Boolean isHost;
    private Double score;
    private Integer wins;
    private Integer losses;
    private Integer votes;
    private String systemIp;
    private String tunnelUrl;
    private String modelFolder;
    private Integer consecutiveTimeouts;
    private Boolean isOnline;
    private Boolean resourcePermissionGranted = true;
    // True only for stub User rows created inside ClusterService.joinCluster's
    // orElseGet — i.e. a *different* machine's account, mirrored into this
    // machine's local DB solely because they joined a cluster this machine
    // hosts. Their tunnelUrl is set once, directly, from the workerTunnelUrl
    // payload at join time — it must NEVER be overwritten by this machine's
    // own ngrok_monitor push (see registerTunnelForAllHosts), or a worker's
    // real tunnel gets silently replaced with the host's own tunnel URL.
    // Real local accounts (whoever actually registered/logged in on this
    // machine, host or worker) always default to false here.
    private Boolean provisionedRemotely = false;

    public User() {
    }

    public User(Integer id, String accountName, String email, String password, Role role, Integer clusterId, Boolean isHost, Double score, Integer wins, Integer losses, Integer votes, String systemIp, String tunnelUrl, String modelFolder, Integer consecutiveTimeouts, Boolean isOnline, Boolean resourcePermissionGranted) {
        this.id = id;
        this.accountName = accountName;
        this.email = email;
        this.password = password;
        this.role = role;
        this.clusterId = clusterId;
        this.isHost = isHost;
        this.score = score;
        this.wins = wins;
        this.losses = losses;
        this.votes = votes;
        this.systemIp = systemIp;
        this.tunnelUrl = tunnelUrl;
        this.modelFolder = modelFolder;
        this.consecutiveTimeouts = consecutiveTimeouts != null ? consecutiveTimeouts : 0;
        this.isOnline = isOnline != null ? isOnline : true;
        this.resourcePermissionGranted = resourcePermissionGranted != null ? resourcePermissionGranted : true;
    }

    public static UserBuilder builder() {
        return new UserBuilder();
    }

    public static class UserBuilder {
        private Integer id;
        private String accountName;
        private String email;
        private String password;
        private Role role;
        private Integer clusterId;
        private Boolean isHost;
        private Double score;
        private Integer wins;
        private Integer losses;
        private Integer votes;
        private String systemIp;
        private String tunnelUrl;
        private String modelFolder;
        private Integer consecutiveTimeouts;
        private Boolean isOnline;
        private Boolean resourcePermissionGranted;

        public UserBuilder id(Integer id) {
            this.id = id;
            return this;
        }

        public UserBuilder accountName(String accountName) {
            this.accountName = accountName;
            return this;
        }

        public UserBuilder email(String email) {
            this.email = email;
            return this;
        }

        public UserBuilder password(String password) {
            this.password = password;
            return this;
        }

        public UserBuilder role(Role role) {
            this.role = role;
            return this;
        }

        public UserBuilder clusterId(Integer clusterId) {
            this.clusterId = clusterId;
            return this;
        }

        public UserBuilder isHost(Boolean isHost) {
            this.isHost = isHost;
            return this;
        }

        public UserBuilder score(Double score) {
            this.score = score;
            return this;
        }

        public UserBuilder wins(Integer wins) {
            this.wins = wins;
            return this;
        }

        public UserBuilder losses(Integer losses) {
            this.losses = losses;
            return this;
        }

        public UserBuilder votes(Integer votes) {
            this.votes = votes;
            return this;
        }

        public UserBuilder systemIp(String systemIp) {
            this.systemIp = systemIp;
            return this;
        }

        public UserBuilder tunnelUrl(String tunnelUrl) {
            this.tunnelUrl = tunnelUrl;
            return this;
        }

        public UserBuilder modelFolder(String modelFolder) {
            this.modelFolder = modelFolder;
            return this;
        }

        public UserBuilder consecutiveTimeouts(Integer consecutiveTimeouts) {
            this.consecutiveTimeouts = consecutiveTimeouts;
            return this;
        }

        public UserBuilder isOnline(Boolean isOnline) {
            this.isOnline = isOnline;
            return this;
        }
        
        public UserBuilder resourcePermissionGranted(Boolean v) {
            this.resourcePermissionGranted = v;
            return this;
        }

        private Boolean provisionedRemotely;
        public UserBuilder provisionedRemotely(Boolean v) {
            this.provisionedRemotely = v;
            return this;
        }

        public User build() {
            User u = new User(id, accountName, email, password, role, clusterId, isHost, score, wins, losses, votes, systemIp, tunnelUrl, modelFolder, consecutiveTimeouts, isOnline, resourcePermissionGranted);
            if (provisionedRemotely != null) u.setProvisionedRemotely(provisionedRemotely);
            return u;
        }
    }

    public String getModelFolder() {
        return modelFolder;
    }

    public void setModelFolder(String modelFolder) {
        this.modelFolder = modelFolder;
    }

    public Integer getConsecutiveTimeouts() {
        return consecutiveTimeouts != null ? consecutiveTimeouts : 0;
    }

    public void setConsecutiveTimeouts(Integer consecutiveTimeouts) {
        this.consecutiveTimeouts = consecutiveTimeouts;
    }

    public Boolean getIsOnline() {
        return isOnline != null ? isOnline : true;
    }

    public void setIsOnline(Boolean isOnline) {
        this.isOnline = isOnline;
    }

    public Boolean getResourcePermissionGranted() {
        return resourcePermissionGranted != null ? resourcePermissionGranted : true;
    }
    
    public void setResourcePermissionGranted(Boolean resourcePermissionGranted) {
        this.resourcePermissionGranted = resourcePermissionGranted;
    }

    public Integer getWins() {
        return wins;
    }

    public void setWins(Integer wins) {
        this.wins = wins;
    }

    public Integer getLosses() {
        return losses;
    }

    public void setLosses(Integer losses) {
        this.losses = losses;
    }

    public Integer getVotes() {
        return votes;
    }

    public void setVotes(Integer votes) {
        this.votes = votes;
    }

    public Integer getClusterId() {
        return clusterId;
    }

    public void setClusterId(Integer clusterId) {
        this.clusterId = clusterId;
    }

    public Boolean getIsHost() {
        return isHost;
    }

    public void setIsHost(Boolean isHost) {
        this.isHost = isHost;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
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

    public String getSystemIp() {
        return systemIp;
    }

    public void setSystemIp(String systemIp) {
        this.systemIp = systemIp;
    }

    public String getTunnelUrl() {
        return tunnelUrl;
    }

    public void setTunnelUrl(String tunnelUrl) {
        this.tunnelUrl = tunnelUrl;
    }

    public Boolean getProvisionedRemotely() {
        return provisionedRemotely != null ? provisionedRemotely : false;
    }

    public void setProvisionedRemotely(Boolean provisionedRemotely) {
        this.provisionedRemotely = provisionedRemotely;
    }

    @Override
    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority(role.name()));
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
