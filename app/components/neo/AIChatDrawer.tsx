/**
 * AIChatDrawer - AI Chat Interface for LLM conversations
 * Powered by Nirvana
 */
import React, { useState, useRef, useEffect } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { useLLMChat } from "../../../src/hooks/useLLMChat";

const SYSTEM_PROMPTS = {
  assistant: "You are a helpful AI assistant. Be concise and friendly.",
  creative: "You are a creative AI that thinks outside the box. Be imaginative and inspiring.",
  technical: "You are a technical expert. Provide detailed, accurate information with examples.",
  fabric: "You are Fabric AI, an expert in the FabricX platform. Help users with their questions about interactive experiences, devices, and AI services.",
};

export default function AIChatDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("ai-chat");
  const haptics = useHaptics();
  const audio = useAudioCues();

  const [systemPrompt, setSystemPrompt] = useState<keyof typeof SYSTEM_PROMPTS>("assistant");
  const [inputText, setInputText] = useState("");
  const scrollViewRef = useRef<ScrollView>(null);

  const {
    messages,
    isLoading,
    error,
    isInitialized,
    sendMessage,
    clearMessages,
    regenerateLastResponse,
    initialize,
  } = useLLMChat(SYSTEM_PROMPTS[systemPrompt]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleBack = () => {
    haptics.impactLight();
    audio.click();
    back();
  };

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    haptics.impactMedium();
    audio.pulse();

    const message = inputText.trim();
    setInputText("");

    await sendMessage(message);
  };

  const handleClear = () => {
    haptics.impactMedium();
    audio.warning();
    clearMessages();
  };

  const handleRegenerate = () => {
    haptics.impactMedium();
    audio.pulse();
    regenerateLastResponse();
  };

  const handlePromptChange = (prompt: keyof typeof SYSTEM_PROMPTS) => {
    haptics.impactLight();
    audio.click();
    setSystemPrompt(prompt);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(10,14,28,0.96)",
            paddingTop: 56,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              onPress={handleBack}
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
            <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>
              AI Chat
            </Text>
          </View>

          {/* System Prompt Selector */}
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <Text style={{ color: "#93c5fd", fontSize: 12, marginBottom: 6 }}>
              Personality:
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(SYSTEM_PROMPTS) as Array<keyof typeof SYSTEM_PROMPTS>).map(
                (prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => handlePromptChange(prompt)}
                    disabled={isLoading}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor:
                        systemPrompt === prompt
                          ? "rgba(34,211,238,0.8)"
                          : "rgba(148,163,184,0.25)",
                      backgroundColor:
                        systemPrompt === prompt
                          ? "rgba(34,211,238,0.15)"
                          : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: systemPrompt === prompt ? "#22d3ee" : "#9ca3af",
                        fontWeight: "700",
                        fontSize: 11,
                        textTransform: "capitalize",
                      }}
                    >
                      {prompt}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </View>

          {/* Error Display */}
          {error && (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 12,
                padding: 12,
                backgroundColor: "rgba(239,68,68,0.1)",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.3)",
              }}
            >
              <Text style={{ color: "#ef4444", fontSize: 12 }}>{error}</Text>
            </View>
          )}

          {/* Initialization Status */}
          {!isInitialized && (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 12,
                padding: 12,
                backgroundColor: "rgba(59,130,246,0.1)",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(59,130,246,0.3)",
              }}
            >
              <Text style={{ color: "#60a5fa", fontSize: 12 }}>
                Configure LLM service in AI Settings to start chatting
              </Text>
            </View>
          )}

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={{ flex: 1, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 20, gap: 12 }}
          >
            {messages.length === 0 && isInitialized && (
              <View style={{ paddingTop: 20 }}>
                <Text style={{ color: "#9ca3af", textAlign: "center", fontSize: 14 }}>
                  Start a conversation by typing a message below
                </Text>
              </View>
            )}

            {messages.map((message) => (
              <View
                key={message.id}
                style={{
                  alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}
              >
                <View
                  style={{
                    backgroundColor:
                      message.role === "user"
                        ? "rgba(34,211,238,0.2)"
                        : "rgba(139,92,246,0.2)",
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor:
                      message.role === "user"
                        ? "rgba(34,211,238,0.3)"
                        : "rgba(139,92,246,0.3)",
                  }}
                >
                  <Text
                    style={{
                      color: message.role === "user" ? "#22d3ee" : "#a78bfa",
                      fontSize: 10,
                      fontWeight: "700",
                      marginBottom: 4,
                      textTransform: "uppercase",
                    }}
                  >
                    {message.role === "user" ? "You" : "AI"}
                  </Text>
                  <Text style={{ color: "#e5e7eb", fontSize: 14, lineHeight: 20 }}>
                    {message.content}
                  </Text>
                  {message.isStreaming && (
                    <Text style={{ color: "#9ca3af", fontSize: 10, marginTop: 4 }}>
                      Typing...
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Action Buttons */}
          {messages.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 16,
                paddingTop: 8,
              }}
            >
              <Pressable
                onPress={handleClear}
                disabled={isLoading}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.5)",
                  backgroundColor: "rgba(239,68,68,0.1)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 12 }}>
                  Clear
                </Text>
              </Pressable>

              <Pressable
                onPress={handleRegenerate}
                disabled={isLoading || messages.length < 2}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isLoading
                    ? "rgba(148,163,184,0.3)"
                    : "rgba(139,92,246,0.5)",
                  backgroundColor: isLoading
                    ? "rgba(148,163,184,0.1)"
                    : "rgba(139,92,246,0.1)",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: isLoading ? "#9ca3af" : "#a78bfa",
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  Regenerate
                </Text>
              </Pressable>
            </View>
          )}

          {/* Input Area */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: "rgba(148,163,184,0.2)",
            }}
          >
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your message..."
              placeholderTextColor="rgba(148,163,184,0.5)"
              multiline
              maxLength={2000}
              editable={!isLoading && isInitialized}
              onSubmitEditing={handleSend}
              style={{
                flex: 1,
                backgroundColor: "rgba(15,23,42,0.7)",
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.3)",
                borderRadius: 10,
                padding: 10,
                color: "#e5e7eb",
                maxHeight: 100,
              }}
            />

            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading || !isInitialized}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 10,
                borderWidth: 1,
                borderColor:
                  !inputText.trim() || isLoading || !isInitialized
                    ? "rgba(148,163,184,0.3)"
                    : "rgba(34,211,238,0.7)",
                backgroundColor:
                  !inputText.trim() || isLoading || !isInitialized
                    ? "rgba(148,163,184,0.1)"
                    : "rgba(34,211,238,0.2)",
              }}
            >
              <Text
                style={{
                  color:
                    !inputText.trim() || isLoading || !isInitialized
                      ? "#9ca3af"
                      : "#22d3ee",
                  fontWeight: "700",
                }}
              >
                {isLoading ? "..." : "Send"}
              </Text>
            </Pressable>
          </View>

          {/* Footer */}
          <View
            style={{
              position: "absolute",
              bottom: 12,
              left: 16,
            }}
          >
            <Text style={{ color: "#a3e635", fontSize: 12 }}>
              Powered by Nirvana
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}
