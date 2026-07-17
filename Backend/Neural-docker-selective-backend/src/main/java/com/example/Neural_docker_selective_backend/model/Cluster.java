package com.example.Neural_docker_selective_backend.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonProperty;

@Entity
@Table(name = "cluster")
public class Cluster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    private String name;
    @Column(name = "is_public")
    @JsonProperty("isPublic")
    private Boolean isPublic;
    private Integer hostId;
    private String password;
    private Integer maxModels = 6;
    private Boolean autoRotate = false;
    private Boolean weightedVoting = true;
    private Integer sessionAnswers = 0;
    private Integer sessionLimit = 10;
    private Integer maxNodeTimeouts = 3;
    private Integer recoveryPingInterval = 40;
    private Integer nodeTimeoutSeconds = 40;
    private Integer discussionRounds = 2;
    private Integer maxTokens = 512;
    private Double temperature = 0.7;
    private String scoringMode = "cumulative";
    private Boolean autoQueue = true;
    private Boolean sessionHistory = true;
    private Boolean enableDiscussion = false;
    private Boolean anonymousDiscussion = false;
    private String discussionBasePrompt = "";
    @Column(name = "host_tunnel_url")
    @JsonProperty("hostTunnelUrl")
    private String hostTunnelUrl;

    public Cluster() {
    }

    public Cluster(Integer id, String name, Boolean isPublic, Integer hostId, String password, Integer maxModels, Boolean autoRotate, Boolean weightedVoting, Integer sessionAnswers, Integer sessionLimit, Integer maxNodeTimeouts, Integer recoveryPingInterval, Integer nodeTimeoutSeconds, Integer discussionRounds, Integer maxTokens, Double temperature, String scoringMode, Boolean autoQueue, Boolean enableDiscussion, Boolean anonymousDiscussion, String discussionBasePrompt) {
        this.id = id;
        this.name = name;
        this.isPublic = isPublic;
        this.hostId = hostId;
        this.password = password;
        this.maxModels = maxModels != null ? maxModels : 6;
        this.autoRotate = autoRotate != null ? autoRotate : false;
        this.weightedVoting = weightedVoting != null ? weightedVoting : true;
        this.sessionAnswers = sessionAnswers != null ? sessionAnswers : 0;
        this.sessionLimit = sessionLimit != null ? sessionLimit : 10;
        this.maxNodeTimeouts = maxNodeTimeouts != null ? maxNodeTimeouts : 3;
        this.recoveryPingInterval = recoveryPingInterval != null ? recoveryPingInterval : 40;
        this.nodeTimeoutSeconds = nodeTimeoutSeconds != null ? nodeTimeoutSeconds : 40;
        this.discussionRounds = discussionRounds != null ? discussionRounds : 2;
        this.maxTokens = maxTokens != null ? maxTokens : 512;
        this.temperature = temperature != null ? temperature : 0.7;
        this.scoringMode = scoringMode != null ? scoringMode : "cumulative";
        this.autoQueue = autoQueue != null ? autoQueue : true;
        this.enableDiscussion = enableDiscussion != null ? enableDiscussion : false;
        this.anonymousDiscussion = anonymousDiscussion != null ? anonymousDiscussion : false;
        this.discussionBasePrompt = discussionBasePrompt != null ? discussionBasePrompt : "";
    }

    public static ClusterBuilder builder() {
        return new ClusterBuilder();
    }

    public static class ClusterBuilder {
        private Integer id;
        private String name;
        private Boolean isPublic;
        private Integer hostId;
        private String password;
        private Integer maxModels;
        private Boolean autoRotate;
        private Boolean weightedVoting;
        private Integer sessionAnswers;
        private Integer sessionLimit;
        private Integer maxNodeTimeouts;
        private Integer recoveryPingInterval;
        private Integer nodeTimeoutSeconds;
        private Integer discussionRounds;
        private Integer maxTokens;
        private Double temperature;
        private String scoringMode;
        private Boolean autoQueue;
        private Boolean enableDiscussion;
        private Boolean anonymousDiscussion;
        private String discussionBasePrompt;

        public ClusterBuilder id(Integer id) {
            this.id = id;
            return this;
        }

        public ClusterBuilder name(String name) {
            this.name = name;
            return this;
        }

        public ClusterBuilder isPublic(Boolean isPublic) {
            this.isPublic = isPublic;
            return this;
        }

        public ClusterBuilder hostId(Integer hostId) {
            this.hostId = hostId;
            return this;
        }

        public ClusterBuilder password(String password) {
            this.password = password;
            return this;
        }

        public ClusterBuilder maxModels(Integer maxModels) {
            this.maxModels = maxModels;
            return this;
        }

        public ClusterBuilder autoRotate(Boolean autoRotate) {
            this.autoRotate = autoRotate;
            return this;
        }

        public ClusterBuilder weightedVoting(Boolean weightedVoting) {
            this.weightedVoting = weightedVoting;
            return this;
        }

        public ClusterBuilder sessionAnswers(Integer sessionAnswers) {
            this.sessionAnswers = sessionAnswers;
            return this;
        }

        public ClusterBuilder sessionLimit(Integer sessionLimit) {
            this.sessionLimit = sessionLimit;
            return this;
        }

        public ClusterBuilder maxNodeTimeouts(Integer maxNodeTimeouts) {
            this.maxNodeTimeouts = maxNodeTimeouts;
            return this;
        }

        public ClusterBuilder recoveryPingInterval(Integer recoveryPingInterval) {
            this.recoveryPingInterval = recoveryPingInterval;
            return this;
        }

        public ClusterBuilder nodeTimeoutSeconds(Integer nodeTimeoutSeconds) {
            this.nodeTimeoutSeconds = nodeTimeoutSeconds;
            return this;
        }

        public ClusterBuilder discussionRounds(Integer discussionRounds) {
            this.discussionRounds = discussionRounds;
            return this;
        }

        public ClusterBuilder maxTokens(Integer maxTokens) {
            this.maxTokens = maxTokens;
            return this;
        }

        public ClusterBuilder temperature(Double temperature) {
            this.temperature = temperature;
            return this;
        }

        public ClusterBuilder scoringMode(String scoringMode) {
            this.scoringMode = scoringMode;
            return this;
        }

        public ClusterBuilder autoQueue(Boolean autoQueue) {
            this.autoQueue = autoQueue;
            return this;
        }

        public ClusterBuilder enableDiscussion(Boolean enableDiscussion) {
            this.enableDiscussion = enableDiscussion;
            return this;
        }

        public ClusterBuilder anonymousDiscussion(Boolean anonymousDiscussion) {
            this.anonymousDiscussion = anonymousDiscussion;
            return this;
        }

        public ClusterBuilder discussionBasePrompt(String discussionBasePrompt) {
            this.discussionBasePrompt = discussionBasePrompt;
            return this;
        }

        public Cluster build() {
            return new Cluster(id, name, isPublic, hostId, password, maxModels, autoRotate, weightedVoting, sessionAnswers, sessionLimit, maxNodeTimeouts, recoveryPingInterval, nodeTimeoutSeconds, discussionRounds, maxTokens, temperature, scoringMode, autoQueue, enableDiscussion, anonymousDiscussion, discussionBasePrompt);
        }
    }

    public Integer getSessionAnswers() {
        return sessionAnswers != null ? sessionAnswers : 0;
    }

    public void setSessionAnswers(Integer sessionAnswers) {
        this.sessionAnswers = sessionAnswers;
    }

    public Integer getSessionLimit() {
        return sessionLimit != null ? sessionLimit : 10;
    }

    public void setSessionLimit(Integer sessionLimit) {
        this.sessionLimit = sessionLimit;
    }

    public Integer getMaxNodeTimeouts() {
        return maxNodeTimeouts != null ? maxNodeTimeouts : 3;
    }

    public void setMaxNodeTimeouts(Integer maxNodeTimeouts) {
        this.maxNodeTimeouts = maxNodeTimeouts;
    }

    public Integer getRecoveryPingInterval() {
        return recoveryPingInterval != null ? recoveryPingInterval : 40;
    }

    public void setRecoveryPingInterval(Integer recoveryPingInterval) {
        this.recoveryPingInterval = recoveryPingInterval;
    }

    public Integer getNodeTimeoutSeconds() {
        return nodeTimeoutSeconds != null ? nodeTimeoutSeconds : 40;
    }

    public void setNodeTimeoutSeconds(Integer nodeTimeoutSeconds) {
        this.nodeTimeoutSeconds = nodeTimeoutSeconds;
    }

    public Integer getDiscussionRounds() {
        return discussionRounds != null ? discussionRounds : 2;
    }

    public void setDiscussionRounds(Integer discussionRounds) {
        this.discussionRounds = discussionRounds;
    }

    public Integer getMaxTokens() {
        return maxTokens != null ? maxTokens : 512;
    }

    public void setMaxTokens(Integer maxTokens) {
        this.maxTokens = maxTokens;
    }

    public Double getTemperature() {
        return temperature != null ? temperature : 0.7;
    }

    public void setTemperature(Double temperature) {
        this.temperature = temperature;
    }

    public String getScoringMode() {
        return scoringMode != null ? scoringMode : "cumulative";
    }

    public void setScoringMode(String scoringMode) {
        this.scoringMode = scoringMode;
    }

    public Boolean getAutoQueue() {
        return autoQueue != null ? autoQueue : true;
    }

    public void setAutoQueue(Boolean autoQueue) {
        this.autoQueue = autoQueue;
    }

    public Boolean getSessionHistory() {
        return sessionHistory != null ? sessionHistory : true;
    }

    public void setSessionHistory(Boolean sessionHistory) {
        this.sessionHistory = sessionHistory;
    }

    public Boolean getEnableDiscussion() {
        return enableDiscussion != null ? enableDiscussion : false;
    }

    public void setEnableDiscussion(Boolean enableDiscussion) {
        this.enableDiscussion = enableDiscussion;
    }

    public String getDiscussionBasePrompt() {
        return discussionBasePrompt != null ? discussionBasePrompt : "";
    }

    public void setDiscussionBasePrompt(String discussionBasePrompt) {
        this.discussionBasePrompt = discussionBasePrompt;
    }

    public Boolean getAnonymousDiscussion() {
        return anonymousDiscussion != null ? anonymousDiscussion : false;
    }

    public void setAnonymousDiscussion(Boolean anonymousDiscussion) {
        this.anonymousDiscussion = anonymousDiscussion;
    }

    public Integer getMaxModels() {
        return maxModels != null ? maxModels : 6;
    }

    public void setMaxModels(Integer maxModels) {
        this.maxModels = maxModels;
    }

    public Boolean getAutoRotate() {
        return autoRotate != null ? autoRotate : false;
    }

    public void setAutoRotate(Boolean autoRotate) {
        this.autoRotate = autoRotate;
    }

    public Boolean getWeightedVoting() {
        return weightedVoting != null ? weightedVoting : true;
    }

    public void setWeightedVoting(Boolean weightedVoting) {
        this.weightedVoting = weightedVoting;
    }

    public Integer getId() {
        return id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @JsonProperty("isPublic")
    public Boolean getIsPublic() {
        return isPublic;
    }

    public void setIsPublic(Boolean isPublic) {
        this.isPublic = isPublic;
    }

    public Integer getHostId() {
        return hostId;
    }

    public void setHostId(Integer hostId) {
        this.hostId = hostId;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    @JsonProperty("hostTunnelUrl")
    public String getHostTunnelUrl() {
        return hostTunnelUrl;
    }

    @JsonProperty("hostTunnelUrl")
    public void setHostTunnelUrl(String hostTunnelUrl) {
        this.hostTunnelUrl = hostTunnelUrl;
    }
}
