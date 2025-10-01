import React, { useEffect, useState } from "react";
import { Platform, View, Text } from "react-native";
import { getRealtimeStatus, subscribeRealtimeStatus, type RealtimeStatus } from "../../shared/utils/realtimeStatus";

export default function ConnectionBadge() {
  if (Platform.OS !== "web") return null;

  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());

  useEffect(() => {
    const unsub = subscribeRealtimeStatus(setRt);
    return () => unsub();
  }, []);

  const transportLabel = rt.transport === "webrtc" ? "RTC" : "BC";
  const peers = rt.peers ?? 0;
  const latency = typeof rt.latencyMs === "number" ? `${Math.round(rt.latencyMs)}ms` : "—";

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 60,
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.45)",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        minWidth: 90,
        alignItems: "flex-end",
      }}
    >
      <Text style={{ color: "#e5e7eb", fontWeight: "800" }}>
        {transportLabel} • {peers}
      </Text>
      <Text style={{ color: "#93c5fd", fontSize: 11 }}>
        {latency}
      </Text>
    </View>
  );
}