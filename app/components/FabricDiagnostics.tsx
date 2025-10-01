import React, { useEffect, useState } from "react";
import { Platform, View, Text, Pressable } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useMIDI } from "../../src/hooks/useMIDI";
import { getRealtimeStatus, subscribeRealtimeStatus, type RealtimeStatus } from "../../shared/utils/realtimeStatus";
import * as Clipboard from "expo-clipboard";

declare global {
  interface Window {
    __fabric_bg_ready?: boolean;
  }
}

export default function FabricDiagnostics() {
  const toast = useToast();
  const haptics = useHaptics();
  const { state, switchExperience, updateConfig } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { isARCameraActive, enableARCamera, disableARCamera } = useAR();

  const [ready, setReady] = useState<boolean>(() => {
    if (Platform.OS !== "web") return true;
    return typeof window !== "undefined" ? !!window.__fabric_bg_ready : false;
  });

  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as boolean | undefined;
      if (typeof detail === "boolean") setReady(detail);
      else setReady(!!window.__fabric_bg_ready);
    };
    window.addEventListener("fabric:background-ready", onReady as EventListener);
    const unsub = subscribeRealtimeStatus(setRt);
    return () => {
      window.removeEventListener("fabric:background-ready", onReady as EventListener);
      unsub();
    };
  }, []);

  const wantsAROrCamera =
    !!activeExperience?.capabilities.ar || !!activeExperience?.capabilities.camera;

  const { activeNotes } = Platform.OS === "web" ? useMIDI() : { activeNotes: [] as string[] };
  const midiEnabled = Boolean((experienceConfig.specific as any)?.midiEnabled ?? true);
  const midiNoteCount = Array.isArray(activeNotes) ? activeNotes.length : 0;

  const roomId = String(((experienceConfig.specific as any)?.roomId as string) || "main");

  const resetCurrentConfig = () => {
    if (!activeExperience) return;
    updateConfig(activeExperience.configDefaults);
    haptics.impactLight();
    toast.show("Experience config reset");
  };

  const reannouncePeers = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
      haptics.impactLight();
      toast.show("Re-announced presence");
    }
  };

  const copyInvite = async () => {
    let url = "";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const loc = new URL(window.location.href);
      loc.searchParams.set("room", roomId);
      if (activeExperience?.id) loc.searchParams.set("exp", activeExperience.id);
      url = loc.toString();
    } else {
      url = `fabric:///?room=${roomId}${activeExperience?.id ? `&exp=${activeExperience.id}` : ""}`;
    }
    await Clipboard.setStringAsync(url);
    haptics.notifySuccess();
    toast.show("Invite link copied");
  };

  return (
    <View
      style={{
        backgroundColor: "rgba(2,8,23,0.7)",
        borderColor: "rgba(34,211,238,0.35)",
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 8,
        maxWidth: 360,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800" }}>Fabric Diagnostics</Text>
      <Text style={{ color: ready ? "#34d399" : "#fbbf24", fontWeight: "700" }}>
        Ready: {ready ? "Yes" : "No"}
      </Text>

      <Text style={{ color: "#e5e7eb" }}>
        Realtime: {rt.transport === "webrtc" ? "WebRTC" : "Broadcast"}{rt.transport === "webrtc" ? ` • peers: ${rt.peers}` : ""}{typeof rt.latencyMs === "number" ? ` • latency: ${Math.round(rt.latencyMs)}ms` : ""}
      </Text>
      {rt.peerIds && rt.peerIds.length > 0 ? (
        <Text style={{ color: "#9ca3af", fontSize: 12 }}>
          Peers: {rt.peerIds.join(", ")}
        </Text>
      ) : null}
      <Text style={{ color: "#93c5fd" }}>Room: {roomId}</Text>

      <Text style={{ color: "#e5e7eb" }}>
        Experience: {activeExperience ? activeExperience.name : "None"}
      </Text>
      <Text style={{ color: "#9ca3af" }}>
        AR/Camera Capable: {wantsAROrCamera ? "Yes" : "No"}
      </Text>
      <Text style={{ color: isARCameraActive ? "#34d399" : "#9ca3af" }}>
        AR Camera Active: {isARCameraActive ? "Yes" : "No"}
      </Text>

      {activeExperience?.id === "ar-piano" ? (
        <>
          <Text style={{ color: midiEnabled ? "#34d399" : "#9ca3af" }}>
            MIDI → Fabric: {midiEnabled ? "On" : "Off"}
          </Text>
          <Text style={{ color: "#e5e7eb" }}>Active Notes: {midiNoteCount}</Text>
        </>
      ) : null}

      <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 6 }} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          onPress={async () => {
            await switchExperience("default-fluid");
            haptics.impactLight();
            toast.show("Switched to Fluid");
          }}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,211,238,0.6)", backgroundColor: "rgba(2,132,199,0.18)" }}
        >
          <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Default Fluid</Text>
        </Pressable>

        <Pressable
          onPress={resetCurrentConfig}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(234,179,8,0.7)", backgroundColor: "rgba(234,179,8,0.15)" }}
        >
          <Text style={{ color: "#fde047", fontWeight: "700" }}>Reset Config</Text>
        </Pressable>

        <Pressable
          onPress={reannouncePeers}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,211,238,0.6)" }}
        >
          <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Re-announce Peers</Text>
        </Pressable>

        <Pressable
          onPress={() => void copyInvite()}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(34,211,238,0.6)" }}
        >
          <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Copy Invite</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            haptics.notifySuccess();
            toast.show("Haptics OK");
          }}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(16,185,129,0.6)" }}
        >
          <Text style={{ color: "#34d399", fontWeight: "700" }}>Test Haptics</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            if (isARCameraActive) {
              disableARCamera();
              haptics.impactLight();
              toast.show("AR Camera disabled");
            } else {
              await enableARCamera();
              haptics.notifySuccess();
              toast.show("AR Camera enabled");
            }
          }}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: isARCameraActive ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.35)", backgroundColor: isARCameraActive ? "rgba(16,185,129,0.18)" : "transparent" }}
        >
          <Text style={{ color: isARCameraActive ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
            {isARCameraActive ? "AR: On" : "AR: Off"}
          </Text>
        </Pressable>
      </View>

      <Text style={{ color: "#a3e635", marginTop: 6, fontSize: 12 }}>Powered by Nirvana</Text>
    </View>
  );
}