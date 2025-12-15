/**
 * SocialBackendService - Real backend integration for social features
 * Connects to API for persistent storage of influencers, followers, and events
 * Powered by Nirvana
 */

import type { Influencer, Follower, BroadcastEvent } from "../hooks/useSocialBroadcast";

export interface SocialBackendConfig {
  apiEndpoint: string;
  apiKey?: string;
  useLocal?: boolean; // Use localStorage as fallback
}

export class SocialBackendService {
  private config: SocialBackendConfig;
  private userId: string | null = null;

  constructor(config: SocialBackendConfig) {
    this.config = config;
  }

  /**
   * Initialize service and authenticate user
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    console.log("[SocialBackend] Initialized for user:", userId);

    // If using local storage, load data
    if (this.config.useLocal) {
      await this.loadFromLocalStorage();
    }
  }

  /**
   * Register as influencer
   */
  async registerInfluencer(influencer: Influencer): Promise<void> {
    if (this.config.useLocal) {
      const influencers = await this.getLocalInfluencers();
      influencers.set(influencer.id, influencer);
      await this.saveLocalInfluencers(influencers);
      return;
    }

    try {
      const response = await fetch(`${this.config.apiEndpoint}/influencers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey || ""}`,
        },
        body: JSON.stringify(influencer),
      });

      if (!response.ok) {
        throw new Error(`Failed to register influencer: ${response.statusText}`);
      }

      console.log("[SocialBackend] Influencer registered:", influencer.username);
    } catch (err) {
      console.error("[SocialBackend] Register influencer failed:", err);
      throw err;
    }
  }

  /**
   * Register as follower
   */
  async registerFollower(follower: Follower): Promise<void> {
    if (this.config.useLocal) {
      const followers = await this.getLocalFollowers();
      followers.set(follower.id, follower);
      await this.saveLocalFollowers(followers);
      return;
    }

    try {
      const response = await fetch(`${this.config.apiEndpoint}/followers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey || ""}`,
        },
        body: JSON.stringify(follower),
      });

      if (!response.ok) {
        throw new Error(`Failed to register follower: ${response.statusText}`);
      }

      console.log("[SocialBackend] Follower registered:", follower.username);
    } catch (err) {
      console.error("[SocialBackend] Register follower failed:", err);
      throw err;
    }
  }

  /**
   * Subscribe to influencer
   */
  async subscribe(followerId: string, influencerId: string): Promise<void> {
    if (this.config.useLocal) {
      const followers = await this.getLocalFollowers();
      const follower = followers.get(followerId);
      if (follower && !follower.subscriptions.includes(influencerId)) {
        follower.subscriptions.push(influencerId);
        await this.saveLocalFollowers(followers);
      }
      return;
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/subscriptions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.config.apiKey || ""}`,
          },
          body: JSON.stringify({ followerId, influencerId }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to subscribe: ${response.statusText}`);
      }

      console.log("[SocialBackend] Subscribed:", followerId, "to", influencerId);
    } catch (err) {
      console.error("[SocialBackend] Subscribe failed:", err);
      throw err;
    }
  }

  /**
   * Unsubscribe from influencer
   */
  async unsubscribe(followerId: string, influencerId: string): Promise<void> {
    if (this.config.useLocal) {
      const followers = await this.getLocalFollowers();
      const follower = followers.get(followerId);
      if (follower) {
        follower.subscriptions = follower.subscriptions.filter(
          (id) => id !== influencerId
        );
        await this.saveLocalFollowers(followers);
      }
      return;
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/subscriptions/${followerId}/${influencerId}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${this.config.apiKey || ""}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to unsubscribe: ${response.statusText}`);
      }

      console.log("[SocialBackend] Unsubscribed:", followerId, "from", influencerId);
    } catch (err) {
      console.error("[SocialBackend] Unsubscribe failed:", err);
      throw err;
    }
  }

  /**
   * Broadcast event
   */
  async broadcastEvent(event: BroadcastEvent): Promise<void> {
    if (this.config.useLocal) {
      const events = await this.getLocalEvents();
      events.push(event);
      await this.saveLocalEvents(events);
      return;
    }

    try {
      const response = await fetch(`${this.config.apiEndpoint}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey || ""}`,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Failed to broadcast event: ${response.statusText}`);
      }

      console.log("[SocialBackend] Event broadcasted:", event.id);
    } catch (err) {
      console.error("[SocialBackend] Broadcast event failed:", err);
      throw err;
    }
  }

  /**
   * Get influencer's followers
   */
  async getFollowers(influencerId: string): Promise<Follower[]> {
    if (this.config.useLocal) {
      const followers = await this.getLocalFollowers();
      return Array.from(followers.values()).filter((f) =>
        f.subscriptions.includes(influencerId)
      );
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/influencers/${influencerId}/followers`,
        {
          headers: {
            "Authorization": `Bearer ${this.config.apiKey || ""}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get followers: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error("[SocialBackend] Get followers failed:", err);
      return [];
    }
  }

  /**
   * Get follower's subscriptions
   */
  async getSubscriptions(followerId: string): Promise<Influencer[]> {
    if (this.config.useLocal) {
      const followers = await this.getLocalFollowers();
      const influencers = await this.getLocalInfluencers();
      const follower = followers.get(followerId);
      
      if (!follower) return [];
      
      return follower.subscriptions
        .map((id) => influencers.get(id))
        .filter((inf): inf is Influencer => inf !== undefined);
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/followers/${followerId}/subscriptions`,
        {
          headers: {
            "Authorization": `Bearer ${this.config.apiKey || ""}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get subscriptions: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error("[SocialBackend] Get subscriptions failed:", err);
      return [];
    }
  }

  /**
   * Get recent events for follower
   */
  async getRecentEvents(followerId: string, limit: number = 50): Promise<BroadcastEvent[]> {
    if (this.config.useLocal) {
      const events = await this.getLocalEvents();
      const followers = await this.getLocalFollowers();
      const follower = followers.get(followerId);
      
      if (!follower) return [];
      
      return events
        .filter((e) => follower.subscriptions.includes(e.influencerId))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    }

    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/followers/${followerId}/events?limit=${limit}`,
        {
          headers: {
            "Authorization": `Bearer ${this.config.apiKey || ""}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get events: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.error("[SocialBackend] Get events failed:", err);
      return [];
    }
  }

  /**
   * Local storage helpers
   */
  private async getLocalInfluencers(): Promise<Map<string, Influencer>> {
    try {
      const data = localStorage.getItem("fabric_influencers");
      if (!data) return new Map();
      
      const array = JSON.parse(data);
      return new Map(array);
    } catch {
      return new Map();
    }
  }

  private async saveLocalInfluencers(influencers: Map<string, Influencer>): Promise<void> {
    localStorage.setItem("fabric_influencers", JSON.stringify(Array.from(influencers.entries())));
  }

  private async getLocalFollowers(): Promise<Map<string, Follower>> {
    try {
      const data = localStorage.getItem("fabric_followers");
      if (!data) return new Map();
      
      const array = JSON.parse(data);
      return new Map(array);
    } catch {
      return new Map();
    }
  }

  private async saveLocalFollowers(followers: Map<string, Follower>): Promise<void> {
    localStorage.setItem("fabric_followers", JSON.stringify(Array.from(followers.entries())));
  }

  private async getLocalEvents(): Promise<BroadcastEvent[]> {
    try {
      const data = localStorage.getItem("fabric_social_events");
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private async saveLocalEvents(events: BroadcastEvent[]): Promise<void> {
    // Keep only last 100 events
    const recent = events.slice(-100);
    localStorage.setItem("fabric_social_events", JSON.stringify(recent));
  }

  private async loadFromLocalStorage(): Promise<void> {
    console.log("[SocialBackend] Loading from localStorage");
    // Data is loaded on-demand through get methods
  }
}

// Singleton instance
let socialBackendService: SocialBackendService | null = null;

export function getSocialBackendService(config?: SocialBackendConfig): SocialBackendService {
  if (!socialBackendService && config) {
    socialBackendService = new SocialBackendService(config);
  } else if (!socialBackendService) {
    // Default to local storage mode
    socialBackendService = new SocialBackendService({
      apiEndpoint: "",
      useLocal: true,
    });
  }
  return socialBackendService;
}

export function resetSocialBackendService(): void {
  socialBackendService = null;
}
