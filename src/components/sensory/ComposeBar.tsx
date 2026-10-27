import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import {
  FABRIC_COMPOSE_EVENT,
  FABRIC_COMPOSE_STATE_EVENT,
  FABRIC_COMPOSE_STOP_EVENT,
} from "../../ai/PatternComposer";

/**
 * ComposeBar — Slice 4's one HUD affordance: describe a feeling, and
 * Muse Spark (via PatternComposer) choreographs a sensory pattern the
 * whole session feels. Dispatches the prompt as a window event; the
 * live canvas (LegacyFluid) owns composition and playback, exactly the
 * split the VerbBar uses. Playback state flows back on
 * FABRIC_COMPOSE_STATE_EVENT ("playing: <name>"), and the Stop button
 * cancels through FABRIC_COMPOSE_STOP_EVENT.
 *
 * With no AI key configured the canvas falls back to built-in patterns
 * (rain / heartbeat / ocean), so this works offline too.
 *
 * Rendered inside ExperienceHUD (whose container is
 * pointerEvents="none"), so this root re-enables pointer events.
 *
 * Powered by Nirvana
 */
export default function ComposeBar() {
  // Platform const guard is safe; never changes across renders.
  if (Platform.OS !== "web") return null;

  const [prompt, setPrompt] = useState("");
  const [composing, setComposing] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const composingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onState = (ev: Event) => {
      const name = (ev as CustomEvent<string | null>).detail;
      setPlaying(name ?? null);
      setComposing(false);
    };
    window.addEventListener(FABRIC_COMPOSE_STATE_EVENT, onState as EventListener);
    return () => {
      window.removeEventListener(FABRIC_COMPOSE_STATE_EVENT, onState as EventListener);
      if (composingTimer.current) clearTimeout(composingTimer.current);
    };
  }, []);

  const submit = () => {
    const text = prompt.trim();
    if (!text || composing) return;
    setComposing(true);
    window.dispatchEvent(new CustomEvent(FABRIC_COMPOSE_EVENT, { detail: text }));
    setPrompt("");
    // Backstop: if composition produced nothing, the canvas reports a
    // null state — but never hang the input on a lost event.
    if (composingTimer.current) clearTimeout(composingTimer.current);
    composingTimer.current = setTimeout(() => setComposing(false), 20_000);
  };

  const stop = () => {
    window.dispatchEvent(new CustomEvent(FABRIC_COMPOSE_STOP_EVENT));
  };

  return (
    <View pointerEvents="auto" style={{ marginTop: 8, maxWidth: 260 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          onSubmitEditing={submit}
          placeholder="Describe a feeling…"
          placeholderTextColor="#64748b"
          accessibilityLabel="Describe a feeling to compose as a pattern"
          style={{
            flex: 1,
            color: "#e5e7eb",
            fontSize: 12,
            backgroundColor: "rgba(34,211,238,0.08)",
            borderColor: "rgba(34,211,238,0.45)",
            borderWidth: 1,
            borderRadius: 999,
            paddingVertical: 5,
            paddingHorizontal: 10,
            outlineStyle: "none",
          } as object}
        />
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Compose pattern"
          style={({ pressed }) => ({
            backgroundColor: pressed ? "rgba(34,211,238,0.35)" : "rgba(34,211,238,0.15)",
            borderColor: "rgba(34,211,238,0.45)",
            borderWidth: 1,
            borderRadius: 999,
            paddingVertical: 5,
            paddingHorizontal: 10,
            justifyContent: "center",
          })}
        >
          <Text style={{ color: "#e5e7eb", fontSize: 12, fontWeight: "700" }}>
            {composing ? "Composing…" : "Compose"}
          </Text>
        </Pressable>
      </View>
      {playing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
          <Text style={{ color: "#93c5fd", fontSize: 11 }}>
            {`Playing: ${playing}`}
          </Text>
          <Pressable
            onPress={stop}
            accessibilityRole="button"
            accessibilityLabel="Stop pattern"
            style={({ pressed }) => ({
              backgroundColor: pressed ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.15)",
              borderColor: "rgba(248,113,113,0.5)",
              borderWidth: 1,
              borderRadius: 999,
              paddingVertical: 2,
              paddingHorizontal: 8,
            })}
          >
            <Text style={{ color: "#fecaca", fontSize: 11, fontWeight: "700" }}>Stop</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
