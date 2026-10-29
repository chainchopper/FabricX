import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import {
  FABRIC_COMPOSE_EVENT,
  FABRIC_COMPOSE_STATE_EVENT,
  FABRIC_COMPOSE_STOP_EVENT,
} from "../../ai/PatternComposer";
import { FABRIC_COMPOSE_SOURCE_EVENT } from "../../ai/RecipeComposer";
import { useComposeVoice } from "./useComposeVoice";

/**
 * ComposeBar — Slice 4's one HUD affordance: describe a feeling, and
 * Muse Spark (via PatternComposer) choreographs a sensory pattern the
 * whole session feels. Dispatches the prompt as a window event; the
 * live canvas (LegacyFluid) owns composition and playback, exactly the
 * split the VerbBar uses. Playback state flows back on
 * FABRIC_COMPOSE_STATE_EVENT ("playing: <name>"), and the Stop button
 * cancels through FABRIC_COMPOSE_STOP_EVENT.
 *
 * The in-browser interpreter is the default and answers on-device
 * (built-in patterns — rain / heartbeat / ocean — and the generative
 * performance templates), so this works offline with nothing to
 * connect. A resolved cloud model (the user's own saved one, or
 * Fanalogy's built-in cloud — see PatternComposer's resolution)
 * invents open-ended answers instead. Nothing here ever asks for a
 * key (Cleanup 2). Slice 15 adds
 * the second vocabulary behind the same input: a drawing prompt
 * ("draw a heart", "a ring that bursts") composes a Recipe instead —
 * the canvas routes it, this bar doesn't need to know.
 *
 * Slice 17 makes the bar voice-first: the mic is the primary
 * affordance and a spoken final transcript enters the exact same
 * submit path as typed text. Typing remains the alternative. The
 * canvas also reports the answer's source, so a built-in
 * interpretation is captioned as a built-in — never dressed up as
 * open-ended model intelligence.
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
  const [source, setSource] = useState<
    "llm" | "builtin" | "ghost" | "beyond-builtin" | "beyond-model" | null
  >(null);
  const composingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onState = (ev: Event) => {
      const name = (ev as CustomEvent<string | null>).detail;
      setPlaying(name ?? null);
      setComposing(false);
    };
    const onSource = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      setSource(
        detail === "llm" ||
          detail === "builtin" ||
          detail === "ghost" ||
          detail === "beyond-builtin" ||
          detail === "beyond-model"
          ? detail
          : null
      );
    };
    window.addEventListener(FABRIC_COMPOSE_STATE_EVENT, onState as EventListener);
    window.addEventListener(FABRIC_COMPOSE_SOURCE_EVENT, onSource as EventListener);
    return () => {
      window.removeEventListener(FABRIC_COMPOSE_STATE_EVENT, onState as EventListener);
      window.removeEventListener(FABRIC_COMPOSE_SOURCE_EVENT, onSource as EventListener);
      if (composingTimer.current) clearTimeout(composingTimer.current);
    };
  }, []);

  const submitText = (raw: string) => {
    const text = raw.trim();
    if (!text || composing) return;
    setSource(null);
    setComposing(true);
    window.dispatchEvent(new CustomEvent(FABRIC_COMPOSE_EVENT, { detail: text }));
    setPrompt("");
    // Backstop: if composition produced nothing, the canvas reports a
    // null state — but never hang the input on a lost event.
    if (composingTimer.current) clearTimeout(composingTimer.current);
    composingTimer.current = setTimeout(() => setComposing(false), 20_000);
  };

  const submit = () => submitText(prompt);
  const voice = useComposeVoice(submitText);

  const stop = () => {
    window.dispatchEvent(new CustomEvent(FABRIC_COMPOSE_STOP_EVENT));
  };

  return (
    <View pointerEvents="auto" style={{ marginTop: 8, maxWidth: 300 }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "stretch" }}>
        <Pressable
          pointerEvents="auto"
          onPress={voice.toggle}
          accessibilityRole="button"
          accessibilityLabel={voice.listening ? "Stop listening" : "Ask by voice"}
          style={({ pressed }) => ({
            width: 38,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: voice.listening
              ? "rgba(248,113,113,0.8)"
              : "rgba(34,211,238,0.65)",
            backgroundColor: voice.listening
              ? "rgba(248,113,113,0.3)"
              : pressed
                ? "rgba(34,211,238,0.35)"
                : "rgba(34,211,238,0.18)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text style={{ fontSize: 17 }}>{voice.listening ? "●" : "🎤"}</Text>
        </Pressable>
        <TextInput
          pointerEvents="auto"
          value={prompt}
          onChangeText={setPrompt}
          onSubmitEditing={submit}
          placeholder="Ask for anything — 'show me your heartbeat'…"
          placeholderTextColor="#64748b"
          accessibilityLabel="Ask for a performance, by typing if you prefer"
          style={{
            flex: 1,
            color: "#e5e7eb",
            // 16px floor (Hotfix 2.3): below 16px, iOS Safari
            // auto-zooms on focus and can strand the page scrolled
            // with unstyled white below the app once the keyboard
            // closes — Terrell's long-standing "typing breaks the
            // piano layout" report. 16px is iOS's no-zoom threshold.
            fontSize: 16,
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
          pointerEvents="auto"
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
      {voice.listening || voice.interim || voice.message ? (
        <Text
          style={{
            color: voice.message ? "#fca5a5" : "#93c5fd",
            fontSize: 11,
            marginTop: 6,
          }}
        >
          {voice.message ??
            (voice.interim
              ? `Hearing: ${voice.interim}`
              : "Listening… speak your request")}
        </Text>
      ) : null}
      {source ? (
        <Text style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
          {source === "builtin"
            ? "Interpreted on-device."
            : source === "ghost"
              ? "Answered by your ghost, from its live state."
              : source === "beyond-builtin"
                ? "That one's beyond the built-in interpreter."
                : source === "beyond-model"
                  ? "That one's beyond the cloud model too — try a feeling, a shape, or a rhythm."
                  : "Interpreted by the cloud model."}
        </Text>
      ) : null}
      {playing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
          <Text style={{ color: "#93c5fd", fontSize: 11 }}>
            {`Playing: ${playing}`}
          </Text>
          <Pressable
            pointerEvents="auto"
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
