/**
 * SwarmControlDrawer - UI for managing swarm mode and multi-device coordination
 * Powered by Nirvana
 */
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { useSwarmManager } from "../../../src/hooks/useSwarmManager";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

export default function SwarmControlDrawer() {
  const { nodes, displayWord, createRippleEffect, broadcast, syncAll } = useSwarmManager();
  const [message, setMessage] = useState("");
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
  const haptics = useHaptics();
  const audio = useAudioCues();

  const handleDisplayWord = () => {
    if (!message.trim()) return;
    haptics.impactMedium();
    audio.success();
    displayWord(message.toUpperCase(), {
      color: { h: 180, s: 100, v: 255 },
      duration: 5000,
    });
  };

  const handleRipple = (origin: number) => {
    haptics.impactLight();
    audio.click();
    createRippleEffect(origin, { h: 120 + origin * 30, s: 100, v: 255 }, 150);
  };

  const handleSync = () => {
    haptics.impactMedium();
    audio.success();
    syncAll();
  };

  const toggleNodeSelection = (nodeNumber: number) => {
    haptics.impactLight();
    audio.click();
    setSelectedNodes((prev) =>
      prev.includes(nodeNumber)
        ? prev.filter((n) => n !== nodeNumber)
        : [...prev, nodeNumber]
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}
    >
      {/* Header */}
      <View>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "800", marginBottom: 4 }}>
          Swarm Control
        </Text>
        <Text style={{ color: "#93c5fd", fontSize: 13 }}>
          Coordinate {nodes.length} connected device{nodes.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Node Status */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(34,211,238,0.25)",
          backgroundColor: "rgba(2,8,23,0.5)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Active Nodes</Text>
        {nodes.length === 0 ? (
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            No devices connected. Connect S3 Matrix devices to use swarm mode.
          </Text>
        ) : (
          <View style={{ gap: 6 }}>
            {nodes.map((node) => (
              <Pressable
                key={node.id}
                onPress={() => toggleNodeSelection(node.nodeNumber)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: selectedNodes.includes(node.nodeNumber)
                    ? "rgba(34,211,238,0.2)"
                    : "rgba(0,0,0,0.3)",
                  borderWidth: 1,
                  borderColor: selectedNodes.includes(node.nodeNumber)
                    ? "rgba(34,211,238,0.5)"
                    : "rgba(148,163,184,0.2)",
                }}
              >
                <View>
                  <Text style={{ color: "white", fontWeight: "600" }}>Node {node.nodeNumber}</Text>
                  <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                    {node.deviceId.slice(0, 12)}...
                  </Text>
                </View>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor:
                      node.status === "online"
                        ? "#10b981"
                        : node.status === "syncing"
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Display Word */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(34,211,238,0.25)",
          backgroundColor: "rgba(2,8,23,0.5)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Display Text</Text>
        <Text style={{ color: "#93c5fd", fontSize: 12, marginBottom: 8 }}>
          Show text across all nodes (one letter per device)
        </Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Enter message..."
          placeholderTextColor="#6b7280"
          maxLength={8}
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
        <Pressable
          onPress={handleDisplayWord}
          disabled={!message.trim() || nodes.length === 0}
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor:
              message.trim() && nodes.length > 0 ? "rgba(34,211,238,0.3)" : "rgba(148,163,184,0.1)",
            borderWidth: 1,
            borderColor:
              message.trim() && nodes.length > 0 ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.2)",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: message.trim() && nodes.length > 0 ? "#22d3ee" : "#6b7280",
              fontWeight: "700",
            }}
          >
            Display on Nodes
          </Text>
        </Pressable>
      </View>

      {/* Effects */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(34,211,238,0.25)",
          backgroundColor: "rgba(2,8,23,0.5)",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Swarm Effects</Text>
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={handleSync}
            disabled={nodes.length === 0}
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: nodes.length > 0 ? "rgba(16,185,129,0.2)" : "rgba(148,163,184,0.1)",
              borderWidth: 1,
              borderColor: nodes.length > 0 ? "rgba(16,185,129,0.5)" : "rgba(148,163,184,0.2)",
              alignItems: "center",
            }}
          >
            <Text style={{ color: nodes.length > 0 ? "#10b981" : "#6b7280", fontWeight: "700" }}>
              🔄 Sync All Nodes
            </Text>
          </Pressable>

          {nodes.map((node) => (
            <Pressable
              key={node.id}
              onPress={() => handleRipple(node.nodeNumber)}
              style={{
                padding: 10,
                borderRadius: 8,
                backgroundColor: "rgba(245,158,11,0.2)",
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.5)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#f59e0b", fontWeight: "700" }}>
                🌊 Ripple from Node {node.nodeNumber}
              </Text>
            </Pressable>
          ))}
        </View>
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
          💡 Tip: Connect multiple S3 Matrix devices to see swarm capabilities. Each device becomes
          a node that can display synchronized patterns, text, and effects.
        </Text>
      </View>
    </ScrollView>
  );
}
