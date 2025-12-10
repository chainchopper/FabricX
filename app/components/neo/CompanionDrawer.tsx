import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, TextInput } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Suggestion {
  id: string;
  text: string;
  action: string;
}

export default function CompanionDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("companion");
  const haptics = useHaptics();
  const audio = useAudioCues();
  
  const [activeTab, setActiveTab] = useState<"chat" | "suggestions" | "settings">("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm your Fabric AI companion. I can help you create experiences, answer questions, and guide you through features. How can I assist you today?",
      timestamp: new Date(),
    },
  ]);

  const mockSuggestions: Suggestion[] = [
    { id: "1", text: "Create a calming meditation scene", action: "create_scene" },
    { id: "2", text: "Show me how to use MIDI controllers", action: "tutorial" },
    { id: "3", text: "Suggest effects for my composition", action: "suggest_effects" },
    { id: "4", text: "Help me optimize performance", action: "optimize" },
    { id: "5", text: "Explain swarm mode features", action: "explain_swarm" },
  ];

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    haptics.impactLight();
    audio.click();
    
    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    
    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `I understand you want to ${input}. Let me help you with that. [This is a demo response - real AI integration coming soon!]`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      haptics.impactLight();
      audio.success();
    }, 1000);
  };

  const handleSuggestion = (suggestion: Suggestion) => {
    haptics.impactMedium();
    audio.click();
    setInput(suggestion.text);
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
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>🤖 AI Companion</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Your intelligent assistant for Fabric
        </Text>

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          {(["chat", "suggestions", "settings"] as const).map((tab) => (
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

        {/* Content Area */}
        {activeTab === "chat" ? (
          <View style={{ flex: 1 }}>
            {/* Messages */}
            <ScrollView
              style={{ flex: 1, paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <View style={{ gap: 12 }}>
                {messages.map((msg) => (
                  <View
                    key={msg.id}
                    style={{
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor:
                        msg.role === "user"
                          ? "rgba(34,211,238,0.5)"
                          : "rgba(168,85,247,0.5)",
                      backgroundColor:
                        msg.role === "user"
                          ? "rgba(34,211,238,0.15)"
                          : "rgba(168,85,247,0.15)",
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 14, lineHeight: 20 }}>
                      {msg.content}
                    </Text>
                    <Text
                      style={{
                        color: "#9ca3af",
                        fontSize: 10,
                        marginTop: 4,
                        textAlign: msg.role === "user" ? "right" : "left",
                      }}
                    >
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Input */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "rgba(2,8,23,0.8)" }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask me anything..."
                  placeholderTextColor="#6b7280"
                  onSubmitEditing={handleSend}
                  multiline
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.3)",
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    borderRadius: 8,
                    padding: 10,
                    color: "white",
                    maxHeight: 100,
                  }}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={!input.trim()}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    backgroundColor: input.trim() ? "rgba(34,211,238,0.3)" : "rgba(148,163,184,0.1)",
                    borderWidth: 1,
                    borderColor: input.trim() ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.2)",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: input.trim() ? "#22d3ee" : "#6b7280", fontWeight: "700" }}>
                    Send
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : activeTab === "suggestions" ? (
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
            <View style={{ gap: 12 }}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(168,85,247,0.25)",
                  backgroundColor: "rgba(168,85,247,0.08)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 6 }}>Quick Actions</Text>
                <Text style={{ color: "#cbd5e1", fontSize: 13 }}>
                  Select a suggestion to start a conversation
                </Text>
              </View>

              {mockSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  onPress={() => handleSuggestion(suggestion)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    backgroundColor: "rgba(2,8,23,0.5)",
                  }}
                >
                  <Text style={{ color: "white", fontSize: 14 }}>💡 {suggestion.text}</Text>
                </Pressable>
              ))}

              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                  marginTop: 8,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 6 }}>Capabilities</Text>
                <Text style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 20 }}>
                  • Create and customize experiences{"\n"}
                  • Answer questions about features{"\n"}
                  • Provide tutorials and guidance{"\n"}
                  • Suggest optimizations{"\n"}
                  • Help with troubleshooting{"\n"}
                  • Explain technical concepts
                </Text>
              </View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
            <View style={{ gap: 12 }}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>AI Model</Text>
                <Text style={{ color: "#cbd5e1", fontSize: 13, marginBottom: 10 }}>
                  Fabric AI Companion v1.0
                </Text>
                <Pressable
                  onPress={() => { haptics.impactLight(); audio.click(); }}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: "rgba(34,211,238,0.2)",
                    borderWidth: 1,
                    borderColor: "rgba(34,211,238,0.5)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Check for Updates</Text>
                </Pressable>
              </View>

              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Preferences</Text>
                
                <View style={{ gap: 10 }}>
                  <Pressable
                    onPress={() => { haptics.impactLight(); audio.click(); }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(0,0,0,0.3)",
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.2)",
                    }}
                  >
                    <Text style={{ color: "white" }}>Voice Response</Text>
                    <View
                      style={{
                        width: 40,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: "#6b7280",
                        justifyContent: "center",
                        alignItems: "flex-start",
                        paddingHorizontal: 2,
                      }}
                    >
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "white" }} />
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => { haptics.impactLight(); audio.click(); }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(0,0,0,0.3)",
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.2)",
                    }}
                  >
                    <Text style={{ color: "white" }}>Auto Suggestions</Text>
                    <View
                      style={{
                        width: 40,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: "#10b981",
                        justifyContent: "center",
                        alignItems: "flex-end",
                        paddingHorizontal: 2,
                      }}
                    >
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "white" }} />
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => { haptics.impactLight(); audio.click(); }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(0,0,0,0.3)",
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.2)",
                    }}
                  >
                    <Text style={{ color: "white" }}>Context Awareness</Text>
                    <View
                      style={{
                        width: 40,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: "#10b981",
                        justifyContent: "center",
                        alignItems: "flex-end",
                        paddingHorizontal: 2,
                      }}
                    >
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "white" }} />
                    </View>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={() => { haptics.impactMedium(); audio.warning(); }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.5)",
                  backgroundColor: "rgba(239,68,68,0.1)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>Clear Chat History</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}