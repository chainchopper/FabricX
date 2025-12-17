/**
 * VoiceInputButton - Floating voice input button with transcription display
 * Powered by Nirvana
 */
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Platform,
  StyleSheet,
} from "react-native";
import { useVoiceInput } from "../../src/hooks/useVoiceInput";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";

export default function VoiceInputButton() {
  const {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    toggleListening,
    clearTranscript,
  } = useVoiceInput();

  const haptics = useHaptics();
  const audio = useAudioCues();
  const [expanded, setExpanded] = useState(false);

  // Only show on web for now
  if (Platform.OS !== "web" || !isSupported) {
    return null;
  }

  const handleToggle = () => {
    haptics.impactMedium();
    if (isListening) {
      audio.click();
    } else {
      audio.pulse();
    }
    toggleListening();
  };

  const handleExpand = () => {
    haptics.impactLight();
    audio.click();
    setExpanded(!expanded);
  };

  const handleClear = () => {
    haptics.impactLight();
    audio.click();
    clearTranscript();
  };

  const combinedTranscript = transcript + " " + interimTranscript;

  return (
    <View
      style={{
        position: "absolute",
        bottom: 80,
        right: 16,
        zIndex: 100,
        pointerEvents: "box-none",
      }}
    >
      {/* Transcript Display */}
      {expanded && combinedTranscript.trim() && (
        <View
          style={{
            marginBottom: 12,
            backgroundColor: "rgba(15,23,42,0.95)",
            borderRadius: 12,
            padding: 12,
            maxWidth: 300,
            borderWidth: 1,
            borderColor: "rgba(34,211,238,0.3)",
            shadowColor: "#22d3ee",
            shadowOpacity: 0.3,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text
              style={{ color: "#22d3ee", fontWeight: "700", fontSize: 12 }}
            >
              Transcript
            </Text>
            <Pressable onPress={handleClear}>
              <Text style={{ color: "#ef4444", fontSize: 11 }}>Clear</Text>
            </Pressable>
          </View>
          <Text
            style={{
              color: interimTranscript ? "#93c5fd" : "#e5e7eb",
              fontSize: 14,
            }}
          >
            {combinedTranscript.trim()}
          </Text>
          {interimTranscript && (
            <Text
              style={{
                color: "#93c5fd",
                fontSize: 10,
                marginTop: 4,
                fontStyle: "italic",
              }}
            >
              Listening...
            </Text>
          )}
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View
          style={{
            marginBottom: 12,
            backgroundColor: "rgba(127,29,29,0.95)",
            borderRadius: 12,
            padding: 12,
            maxWidth: 300,
            borderWidth: 1,
            borderColor: "rgba(239,68,68,0.5)",
          }}
        >
          <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 12 }}>
            Error
          </Text>
          <Text style={{ color: "#fca5a5", fontSize: 12, marginTop: 4 }}>
            {error}
          </Text>
        </View>
      )}

      {/* Voice Button */}
      <View style={{ alignItems: "flex-end" }}>
        <Pressable
          onPress={handleToggle}
          onLongPress={handleExpand}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: isListening
              ? "rgba(239,68,68,0.9)"
              : "rgba(34,211,238,0.9)",
            borderWidth: 2,
            borderColor: isListening
              ? "rgba(239,68,68,1)"
              : "rgba(34,211,238,1)",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: isListening ? "#ef4444" : "#22d3ee",
            shadowOpacity: 0.6,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Text style={{ fontSize: 24 }}>
            {isListening ? "⏸️" : "🎤"}
          </Text>
        </Pressable>

        {/* Pulsing indicator when listening */}
        {isListening && (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: "#ef4444",
              borderWidth: 2,
              borderColor: "#fff",
            }}
          />
        )}
      </View>

      {/* Long press hint */}
      {!expanded && (
        <Text
          style={{
            color: "#93c5fd",
            fontSize: 10,
            marginTop: 4,
            textAlign: "right",
          }}
        >
          Long press to expand
        </Text>
      )}
    </View>
  );
}
