/**
 * SocialFeedDrawer - Social broadcasting and follower management UI
 * Powered by Nirvana
 */
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput , Platform } from "react-native";
import { useSocialBroadcast } from "../../../src/hooks/useSocialBroadcast";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

export default function SocialFeedDrawer() {
  const {
    currentUser,
    setCurrentUser,
    registerFollower,
    subscribe,
    unsubscribe,
    broadcast,
    getFollowerSubscriptions,
    getInfluencerStats,
  } = useSocialBroadcast();

  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const haptics = useHaptics();
  const audio = useAudioCues();

  // Mock data for demo
  const mockInfluencers = [
    { id: "inf1", username: "FabricMaster", displayName: "Fabric Master", verified: true, followerCount: 12500 },
    { id: "inf2", username: "LEDWizard", displayName: "LED Wizard", verified: true, followerCount: 8340 },
    { id: "inf3", username: "VibeCreator", displayName: "Vibe Creator", verified: false, followerCount: 3200 },
  ];

  const handleSubscribe = (influencerId: string) => {
    if (!currentUser) {
      // Initialize current user
      const newUser = {
        id: `user-${Date.now()}`,
        username: "You",
        deviceIds: [],
        subscriptions: [],
        preferences: {
          notifications: true,
          vibrations: true,
          ledEffects: true,
        },
      };
      setCurrentUser(newUser);
      registerFollower(newUser);
    }

    haptics.impactMedium();
    audio.success();
    
    if (currentUser) {
      subscribe(currentUser.id, influencerId);
    }
  };

  const handleUnsubscribe = (influencerId: string) => {
    if (!currentUser) return;
    haptics.impactLight();
    audio.click();
    unsubscribe(currentUser.id, influencerId);
  };

  const handleBroadcast = () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    
    haptics.impactMedium();
    audio.success();
    
    // Broadcast as mock influencer
    broadcast("inf1", {
      type: "custom",
      title: broadcastTitle,
      message: broadcastMessage,
      effects: {
        color: { h: 180, s: 100, v: 255 },
        pattern: "pulse",
        vibration: [100, 50, 100],
        duration: 5000,
      },
    });
    
    setBroadcastTitle("");
    setBroadcastMessage("");
  };

  const subscriptions = currentUser ? getFollowerSubscriptions(currentUser.id) : [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}
    >
      {/* Header */}
      <View>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "800", marginBottom: 4 }}>
          Social Feed
        </Text>
        <Text style={{ color: "#93c5fd", fontSize: 13 }}>
          Connect with creators and receive live experiences
        </Text>
      </View>

      {/* Influencer List */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(34,211,238,0.25)",
          backgroundColor: "rgba(2,8,23,0.5)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Featured Creators</Text>
        <View style={{ gap: 8 }}>
          {mockInfluencers.map((influencer) => {
            const isSubscribed = subscriptions.some((s) => s.id === influencer.id);
            const stats = getInfluencerStats(influencer.id);
            
            return (
              <View
                key={influencer.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderWidth: 1,
                  borderColor: isSubscribed ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.2)",
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                      {influencer.displayName}
                    </Text>
                    {influencer.verified && (
                      <Text style={{ fontSize: 14 }}>✓</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() =>
                      isSubscribed ? handleUnsubscribe(influencer.id) : handleSubscribe(influencer.id)
                    }
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 6,
                      backgroundColor: isSubscribed ? "rgba(239,68,68,0.2)" : "rgba(34,211,238,0.2)",
                      borderWidth: 1,
                      borderColor: isSubscribed ? "rgba(239,68,68,0.5)" : "rgba(34,211,238,0.5)",
                    }}
                  >
                    <Text
                      style={{
                        color: isSubscribed ? "#ef4444" : "#22d3ee",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {isSubscribed ? "Unsubscribe" : "Subscribe"}
                    </Text>
                  </Pressable>
                </View>
                <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
                  @{influencer.username} • {influencer.followerCount.toLocaleString()} followers
                </Text>
                {stats.lastEvent && (
                  <Text style={{ color: "#6b7280", fontSize: 11, fontStyle: "italic" }}>
                    Latest: {stats.lastEvent.title}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Your Subscriptions */}
      {subscriptions.length > 0 && (
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(16,185,129,0.25)",
            backgroundColor: "rgba(2,8,23,0.5)",
          }}
        >
          <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>
            Your Subscriptions
          </Text>
          <Text style={{ color: "#10b981", fontSize: 12 }}>
            Subscribed to {subscriptions.length} creator{subscriptions.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {/* Broadcast Demo (for creators) */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(245,158,11,0.25)",
          backgroundColor: "rgba(2,8,23,0.5)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>
          📡 Broadcast Demo
        </Text>
        <Text style={{ color: "#f59e0b", fontSize: 12, marginBottom: 8 }}>
          Try sending a broadcast (creator mode)
        </Text>
        <TextInput
          value={broadcastTitle}
          onChangeText={setBroadcastTitle}
          placeholder="Event title..."
          placeholderTextColor="#6b7280"
          style={{
            backgroundColor: "rgba(0,0,0,0.3)",
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.25)",
            borderRadius: 8,
            padding: 10,
            color: "white",
            marginBottom: 8,
          }}
        />
        <TextInput
          value={broadcastMessage}
          onChangeText={setBroadcastMessage}
          placeholder="Broadcast message..."
          placeholderTextColor="#6b7280"
          multiline
          numberOfLines={3}
          style={{
            backgroundColor: "rgba(0,0,0,0.3)",
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.25)",
            borderRadius: 8,
            padding: 10,
            color: "white",
            marginBottom: 8,
            minHeight: 80,
          }}
        />
        <Pressable
          onPress={handleBroadcast}
          disabled={!broadcastTitle.trim() || !broadcastMessage.trim()}
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor:
              broadcastTitle.trim() && broadcastMessage.trim()
                ? "rgba(245,158,11,0.3)"
                : "rgba(148,163,184,0.1)",
            borderWidth: 1,
            borderColor:
              broadcastTitle.trim() && broadcastMessage.trim()
                ? "rgba(245,158,11,0.5)"
                : "rgba(148,163,184,0.2)",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color:
                broadcastTitle.trim() && broadcastMessage.trim() ? "#f59e0b" : "#6b7280",
              fontWeight: "700",
            }}
          >
            Send Broadcast
          </Text>
        </Pressable>
      </View>

      {/* Info */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(148,163,184,0.25)",
          backgroundColor: "rgba(0,0,0,0.2)",
        }}
      >
        <Text style={{ color: "#9ca3af", fontSize: 11 }}>
          🌟 Subscribe to creators to receive personalized experiences on your connected devices. When
          they send a broadcast, your devices will light up, vibrate, and display synchronized
          patterns!
        </Text>
      </View>
    </ScrollView>
  );
}
