import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, TextInput , Platform } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { formatRelativeTime, formatDuration } from "../../utils/timeFormatters";

interface Contact {
  id: string;
  name: string;
  status: "online" | "offline" | "busy" | "in-call";
  lastSeen?: Date;
  avatar: string;
}

interface CallSession {
  id: string;
  participants: string[];
  type: "audio" | "video" | "fabric";
  duration: number;
  timestamp: Date;
  status: "active" | "ended" | "missed";
}

export default function CallDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("call");
  const haptics = useHaptics();
  const audio = useAudioCues();
  
  const [activeTab, setActiveTab] = useState<"contacts" | "active" | "history">("contacts");
  const [searchQuery, setSearchQuery] = useState("");
  const [inCall, setInCall] = useState(false);

  const mockContacts: Contact[] = [
    { id: "1", name: "Alice", status: "online", avatar: "👩" },
    { id: "2", name: "Bob", status: "busy", avatar: "👨" },
    { id: "3", name: "Charlie", status: "offline", lastSeen: new Date(Date.now() - 1000 * 60 * 30), avatar: "🧑" },
    { id: "4", name: "Diana", status: "online", avatar: "👩" },
    { id: "5", name: "Eve", status: "in-call", avatar: "👩" },
  ];

  const mockSessions: CallSession[] = [
    {
      id: "1",
      participants: ["Alice", "Bob"],
      type: "fabric",
      duration: 1234,
      timestamp: new Date(Date.now() - 1000 * 60 * 15),
      status: "active",
    },
    {
      id: "2",
      participants: ["Charlie"],
      type: "video",
      duration: 456,
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
      status: "ended",
    },
    {
      id: "3",
      participants: ["Diana", "Eve"],
      type: "audio",
      duration: 0,
      timestamp: new Date(Date.now() - 1000 * 60 * 120),
      status: "missed",
    },
  ];

  const filteredContacts = mockContacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const handleCall = (contactId: string, type: "audio" | "video" | "fabric") => {
    haptics.impactHeavy();
    audio.success();
    setInCall(true);
    // Call logic would go here
  };

  const handleEndCall = () => {
    haptics.impactMedium();
    audio.warning();
    setInCall(false);
  };

  const getStatusColor = (status: Contact["status"]) => {
    const colors = {
      online: "#10b981",
      offline: "#6b7280",
      busy: "#f59e0b",
      "in-call": "#22d3ee",
    };
    return colors[status];
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(mins / 60);
    
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(6,10,22,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, paddingHorizontal: 16 }}>
          <Pressable
            onPress={() => { haptics.impactLight(); audio.click(); back(); }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Call</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Connect with friends in multi-sensory sessions
        </Text>

        {/* Active Call Banner */}
        {inCall && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.5)",
              backgroundColor: "rgba(16,185,129,0.15)",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 4 }}>📞 Call in Progress</Text>
                <Text style={{ color: "#93c5fd", fontSize: 12 }}>Alice, Bob</Text>
              </View>
              <Pressable
                onPress={handleEndCall}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: "rgba(239,68,68,0.3)",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.6)",
                }}
              >
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>End Call</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          {(["contacts", "active", "history"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: activeTab === tab ? "rgba(34,211,238,0.8)" : "rgba(148,163,184,0.25)",
                backgroundColor: activeTab === tab ? "rgba(34,211,238,0.15)" : "transparent",
              }}
            >
              <Text
                style={{
                  color: activeTab === tab ? "#22d3ee" : "#9ca3af",
                  fontWeight: activeTab === tab ? "700" : "600",
                  textAlign: "center",
                  fontSize: 13,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search Bar (Contacts tab only) */}
        {activeTab === "contacts" && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search contacts..."
              placeholderTextColor="#6b7280"
              style={{
                backgroundColor: "rgba(0,0,0,0.3)",
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.25)",
                borderRadius: 8,
                padding: 10,
                color: "white",
              }}
            />
          </View>
        )}

        {/* Content Area */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
          {activeTab === "contacts" && (
            <View style={{ gap: 12 }}>
              {filteredContacts.map((contact) => (
                <View
                  key={contact.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    backgroundColor: "rgba(2,8,23,0.5)",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                    <Text style={{ fontSize: 40, marginRight: 12 }}>{contact.avatar}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{contact.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: getStatusColor(contact.status),
                            marginRight: 6,
                          }}
                        />
                        <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                          {contact.status === "offline" && contact.lastSeen
                            ? `Last seen ${formatRelativeTime(contact.lastSeen)}`
                            : contact.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable
                      onPress={() => handleCall(contact.id, "audio")}
                      disabled={contact.status === "offline"}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: contact.status === "offline" ? "rgba(148,163,184,0.1)" : "rgba(16,185,129,0.2)",
                        borderWidth: 1,
                        borderColor: contact.status === "offline" ? "rgba(148,163,184,0.2)" : "rgba(16,185,129,0.5)",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: contact.status === "offline" ? "#6b7280" : "#10b981", fontWeight: "700", fontSize: 12 }}>
                        🔊 Audio
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleCall(contact.id, "video")}
                      disabled={contact.status === "offline"}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: contact.status === "offline" ? "rgba(148,163,184,0.1)" : "rgba(34,211,238,0.2)",
                        borderWidth: 1,
                        borderColor: contact.status === "offline" ? "rgba(148,163,184,0.2)" : "rgba(34,211,238,0.5)",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: contact.status === "offline" ? "#6b7280" : "#22d3ee", fontWeight: "700", fontSize: 12 }}>
                        📹 Video
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleCall(contact.id, "fabric")}
                      disabled={contact.status === "offline"}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: contact.status === "offline" ? "rgba(148,163,184,0.1)" : "rgba(168,85,247,0.2)",
                        borderWidth: 1,
                        borderColor: contact.status === "offline" ? "rgba(148,163,184,0.2)" : "rgba(168,85,247,0.5)",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: contact.status === "offline" ? "#6b7280" : "#a855f7", fontWeight: "700", fontSize: 12 }}>
                        ✨ Fabric
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === "active" && (
            <View style={{ gap: 12 }}>
              {mockSessions.filter((s) => s.status === "active").length === 0 ? (
                <Text style={{ color: "#9ca3af", textAlign: "center", marginTop: 20 }}>
                  No active calls. Start a new call from Contacts!
                </Text>
              ) : (
                mockSessions
                  .filter((s) => s.status === "active")
                  .map((session) => (
                    <View
                      key={session.id}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.5)",
                        backgroundColor: "rgba(16,185,129,0.1)",
                      }}
                    >
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                          {session.participants.join(", ")}
                        </Text>
                        <Text style={{ color: "#93c5fd", fontSize: 12 }}>
                          {session.type.toUpperCase()} • {formatDuration(session.duration)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => { haptics.impactLight(); audio.click(); }}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor: "rgba(34,211,238,0.2)",
                            borderWidth: 1,
                            borderColor: "rgba(34,211,238,0.5)",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Join</Text>
                        </Pressable>
                        <Pressable
                          onPress={handleEndCall}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: "rgba(239,68,68,0.2)",
                            borderWidth: 1,
                            borderColor: "rgba(239,68,68,0.5)",
                          }}
                        >
                          <Text style={{ color: "#ef4444", fontWeight: "700" }}>End</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
              )}
            </View>
          )}

          {activeTab === "history" && (
            <View style={{ gap: 12 }}>
              {mockSessions.map((session) => (
                <View
                  key={session.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    backgroundColor: "rgba(2,8,23,0.5)",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>
                        {session.participants.join(", ")}
                      </Text>
                      <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                        {session.type.toUpperCase()} • {formatRelativeTime(session.timestamp)}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        backgroundColor:
                          session.status === "active"
                            ? "rgba(16,185,129,0.2)"
                            : session.status === "ended"
                            ? "rgba(34,211,238,0.2)"
                            : "rgba(239,68,68,0.2)",
                        borderWidth: 1,
                        borderColor:
                          session.status === "active"
                            ? "rgba(16,185,129,0.5)"
                            : session.status === "ended"
                            ? "rgba(34,211,238,0.5)"
                            : "rgba(239,68,68,0.5)",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            session.status === "active"
                              ? "#10b981"
                              : session.status === "ended"
                              ? "#22d3ee"
                              : "#ef4444",
                          fontSize: 10,
                          fontWeight: "600",
                        }}
                      >
                        {session.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {session.duration > 0 && (
                    <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                      Duration: {formatDuration(session.duration)}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}