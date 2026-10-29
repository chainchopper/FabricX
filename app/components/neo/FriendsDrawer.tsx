import React, { useMemo, useRef, useState, useEffect } from "react";
import { Animated, Pressable, Text, TextInput, View, Platform, ScrollView } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useExperience } from "../../context/ExperienceContext";
import { useFabricChat } from "../../../src/hooks/useFabricChat";
import { getRealtimeStatus, subscribeRealtimeStatus, type RealtimeStatus } from "../../../shared/utils/realtimeStatus";
import { peerColor } from "../../../shared/utils/peerColor";

export default function FriendsDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("friends");

  const { state } = useExperience();
  const roomId = useMemo(() => {
    const s = state.experienceConfig.specific as Record<string, unknown> | undefined;
    return (s?.roomId as string) || "main";
  }, [state.experienceConfig]);

  const chat = useFabricChat(roomId);
  const [input, setInput] = useState<string>("");
  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());

  useEffect(() => {
    const unsub = subscribeRealtimeStatus(setRt);
    return () => unsub();
  }, []);

  const peers = useMemo(() => (rt.peerIds && rt.peerIds.length > 0 ? rt.peerIds : []), [rt.peerIds]);

  const onSend = () => {
    if (!input.trim()) return;
    const ok = chat.send(input);
    if (ok) setInput("");
  };

  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [chat.messages.length]);

  const Title = () => (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
      <Pressable
        onPress={() => back()}
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
      <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Friends & Chat</Text>
    </View>
  );

  if (Platform.OS !== "web") {
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
            paddingTop: 56,
            paddingHorizontal: 16,
          }}
        >
          <Title />
          <Text style={{ color: "#93c5fd" }}>
            Chat is web-only for now. Peers visible on web sessions.
          </Text>
        </View>
      </Animated.View>
    );
  }

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
          paddingTop: 56,
          paddingHorizontal: 16,
        }}
      >
        <Title />

        {/* Room / Transport */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: "#93c5fd" }}>Room: {roomId}</Text>
          <Text style={{ color: "#e5e7eb", marginTop: 4 }}>
            Transport: {rt.transport === "webrtc" ? "WebRTC" : "Broadcast"} • Peers: {rt.peers ?? 0}
          </Text>
          {/* Peer color chips */}
          {peers.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {peers.map((id) => {
                const clr = peerColor(id);
                return (
                  <View
                    key={id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.35)",
                      backgroundColor: "rgba(2,8,23,0.5)",
                    }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 6,
                        backgroundColor: clr,
                        borderWidth: 1,
                        borderColor: "rgba(0,0,0,0.35)",
                      }}
                    />
                    <Text style={{ color: "#cbd5e1", fontSize: 12 }} numberOfLines={1}>
                      {id}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Name editor */}
        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 6 }}>Display Name</Text>
          <TextInput
            value={chat.name}
            onChangeText={chat.updateName}
            placeholder="Your name"
            placeholderTextColor="#6b7280"
            style={{
              backgroundColor: "#0b1220",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              borderRadius: 10,
              color: "white",
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          />
        </View>

        {/* Messages */}
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(2,8,23,0.5)",
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.35)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 10, gap: 6 }}
            showsVerticalScrollIndicator={false}
          >
            {chat.messages.map((m) => {
              const mine = m.userId === chat.userId;
              return (
                <View
                  key={m.id}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    backgroundColor: mine ? "rgba(2,132,199,0.22)" : "rgba(15,23,42,0.85)",
                    borderColor: mine ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                  }}
                >
                  <Text style={{ color: mine ? "#22d3ee" : "#9ca3af", fontSize: 11, marginBottom: 2 }}>
                    {m.name}
                  </Text>
                  <Text style={{ color: "#e5e7eb" }}>{m.text}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Composer */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={chat.enabled ? "Type a message..." : "Chat unavailable"}
            placeholderTextColor="#6b7280"
            editable={chat.enabled && chat.connected}
            onSubmitEditing={onSend}
            style={{
              flex: 1,
              backgroundColor: "#0b1220",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              borderRadius: 10,
              color: "white",
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          />
          <Pressable
            onPress={onSend}
            disabled={!chat.enabled || !chat.connected || input.trim().length === 0}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: chat.enabled && chat.connected && input.trim().length > 0 ? "#0891b2" : "rgba(8,145,178,0.4)",
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.5)",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Send</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}