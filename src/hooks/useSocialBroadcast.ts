/**
 * SocialBroadcastManager - Influencer-to-follower broadcasting system
 * Enables real-time notifications and experiences sent to followers' devices
 * Powered by Nirvana
 */

export interface Influencer {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  followerCount: number;
  verified: boolean;
}

export interface Follower {
  id: string;
  username: string;
  deviceIds: string[]; // Connected Fabric devices
  subscriptions: string[]; // Influencer IDs
  preferences: {
    notifications: boolean;
    vibrations: boolean;
    ledEffects: boolean;
  };
}

export interface BroadcastEvent {
  id: string;
  influencerId: string;
  type: "tweet" | "post" | "live" | "custom";
  title: string;
  message: string;
  effects: {
    color?: { h: number; s: number; v: number };
    pattern?: "pulse" | "wave" | "ripple" | "text";
    vibration?: number[]; // Pattern in ms
    duration?: number;
  };
  timestamp: number;
  expiresAt?: number;
}

export class SocialBroadcastManager {
  private influencers: Map<string, Influencer> = new Map();
  private followers: Map<string, Follower> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // influencerId -> followerIds
  private eventHistory: BroadcastEvent[] = [];
  private onEventCallback?: (event: BroadcastEvent, followerIds: string[]) => void;
  
  // Register an influencer
  registerInfluencer(influencer: Influencer): void {
    this.influencers.set(influencer.id, influencer);
    if (!this.subscriptions.has(influencer.id)) {
      this.subscriptions.set(influencer.id, new Set());
    }
    console.log(`[Social] Registered influencer: ${influencer.username}`);
  }
  
  // Register a follower
  registerFollower(follower: Follower): void {
    this.followers.set(follower.id, follower);
    
    // Add to influencer subscriptions
    follower.subscriptions.forEach((influencerId) => {
      if (!this.subscriptions.has(influencerId)) {
        this.subscriptions.set(influencerId, new Set());
      }
      this.subscriptions.get(influencerId)!.add(follower.id);
    });
    
    console.log(`[Social] Registered follower: ${follower.username}`);
  }
  
  // Subscribe follower to influencer
  subscribe(followerId: string, influencerId: string): boolean {
    const follower = this.followers.get(followerId);
    const influencer = this.influencers.get(influencerId);
    
    if (!follower || !influencer) return false;
    
    if (!follower.subscriptions.includes(influencerId)) {
      follower.subscriptions.push(influencerId);
    }
    
    if (!this.subscriptions.has(influencerId)) {
      this.subscriptions.set(influencerId, new Set());
    }
    this.subscriptions.get(influencerId)!.add(followerId);
    
    console.log(`[Social] ${follower.username} subscribed to ${influencer.username}`);
    return true;
  }
  
  // Unsubscribe follower from influencer
  unsubscribe(followerId: string, influencerId: string): boolean {
    const follower = this.followers.get(followerId);
    if (!follower) return false;
    
    follower.subscriptions = follower.subscriptions.filter((id) => id !== influencerId);
    this.subscriptions.get(influencerId)?.delete(followerId);
    
    console.log(`[Social] ${follower.username} unsubscribed from influencer ${influencerId}`);
    return true;
  }
  
  // Broadcast event to all followers
  broadcast(influencerId: string, eventData: Omit<BroadcastEvent, "id" | "influencerId" | "timestamp">): string {
    const influencer = this.influencers.get(influencerId);
    if (!influencer) {
      throw new Error("Influencer not found");
    }
    
    const event: BroadcastEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      influencerId,
      timestamp: Date.now(),
      ...eventData,
    };
    
    this.eventHistory.push(event);
    
    // Get all followers
    const followerIds = Array.from(this.subscriptions.get(influencerId) || []);
    
    // Filter by preferences
    const activeFollowers = followerIds.filter((id) => {
      const follower = this.followers.get(id);
      return follower?.preferences.notifications;
    });
    
    console.log(`[Social] Broadcasting event from ${influencer.username} to ${activeFollowers.length} followers`);
    
    // Trigger callback
    if (this.onEventCallback) {
      this.onEventCallback(event, activeFollowers);
    }
    
    return event.id;
  }
  
  // Send personalized message to specific follower
  sendPersonal(influencerId: string, followerId: string, message: string, effects: BroadcastEvent["effects"]): void {
    const event: BroadcastEvent = {
      id: `personal-${Date.now()}`,
      influencerId,
      type: "custom",
      title: "Personal Message",
      message,
      effects,
      timestamp: Date.now(),
    };
    
    if (this.onEventCallback) {
      this.onEventCallback(event, [followerId]);
    }
  }
  
  // Get follower devices
  getFollowerDevices(followerId: string): string[] {
    return this.followers.get(followerId)?.deviceIds || [];
  }
  
  // Set event callback
  onEvent(callback: (event: BroadcastEvent, followerIds: string[]) => void): void {
    this.onEventCallback = callback;
  }
  
  // Get influencer stats
  getInfluencerStats(influencerId: string): {
    followerCount: number;
    eventCount: number;
    lastEvent?: BroadcastEvent;
  } {
    const followerCount = this.subscriptions.get(influencerId)?.size || 0;
    const events = this.eventHistory.filter((e) => e.influencerId === influencerId);
    
    return {
      followerCount,
      eventCount: events.length,
      lastEvent: events[events.length - 1],
    };
  }
  
  // Get follower subscriptions
  getFollowerSubscriptions(followerId: string): Influencer[] {
    const follower = this.followers.get(followerId);
    if (!follower) return [];
    
    return follower.subscriptions
      .map((id) => this.influencers.get(id))
      .filter((inf): inf is Influencer => inf !== undefined);
  }
  
  // Cleanup old events
  cleanupEvents(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    this.eventHistory = this.eventHistory.filter(
      (event) => now - event.timestamp < maxAge
    );
  }
}

// React hook for social broadcasting
import { useState, useEffect } from "react";
import { useSwarmManager } from "./useSwarmManager";

export function useSocialBroadcast() {
  const [manager] = useState(() => new SocialBroadcastManager());
  const [currentUser, setCurrentUser] = useState<Follower | null>(null);
  const { swarmManager } = useSwarmManager();
  
  useEffect(() => {
    // Setup event callback to deliver to devices
    manager.onEvent((event, followerIds) => {
      followerIds.forEach((followerId) => {
        const deviceIds = manager.getFollowerDevices(followerId);
        
        deviceIds.forEach((deviceId) => {
          // Deliver event effect to device
          deliverEventToDevice(deviceId, event);
        });
      });
    });
    
    // Cleanup old events periodically
    const cleanupInterval = setInterval(() => {
      manager.cleanupEvents();
    }, 60 * 60 * 1000); // Every hour
    
    return () => {
      clearInterval(cleanupInterval);
    };
  }, [manager]);
  
  const deliverEventToDevice = (deviceId: string, event: BroadcastEvent) => {
    // Color effect
    if (event.effects.color) {
      swarmManager.sendToNodes([0], "setColor", {
        color: event.effects.color,
        duration: event.effects.duration || 3000,
      });
    }
    
    // Vibration pattern
    if (event.effects.vibration) {
      swarmManager.sendToNodes([0], "vibrate", {
        pattern: event.effects.vibration,
      });
    }
    
    // Text pattern
    if (event.effects.pattern === "text" && event.message) {
      swarmManager.displayWord(event.message.substring(0, 8), {
        color: event.effects.color,
        duration: event.effects.duration,
      });
    }
    
    // Wave/ripple pattern
    if (event.effects.pattern === "wave" || event.effects.pattern === "ripple") {
      swarmManager.createRippleEffect(
        0,
        event.effects.color || { h: 180, s: 100, v: 255 },
        200
      );
    }
  };
  
  return {
    manager,
    currentUser,
    setCurrentUser,
    registerInfluencer: manager.registerInfluencer.bind(manager),
    registerFollower: manager.registerFollower.bind(manager),
    subscribe: manager.subscribe.bind(manager),
    unsubscribe: manager.unsubscribe.bind(manager),
    broadcast: manager.broadcast.bind(manager),
    sendPersonal: manager.sendPersonal.bind(manager),
    getInfluencerStats: manager.getInfluencerStats.bind(manager),
    getFollowerSubscriptions: manager.getFollowerSubscriptions.bind(manager),
  };
}
