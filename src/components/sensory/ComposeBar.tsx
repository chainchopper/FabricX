import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View } from "react-native";
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
 * Slice 37: the TEXT FIELD IS GONE from the canvas. Terrell's
 * Nov 1 device report: the bottom-center input "does nothing —
 * doesn't respond either way, and clicking it makes the scene
 * lose focus." Two truths inside that: (1) on canvases with no
 * compose consumer (the Dancer Stage, whose canvas replaces the
 * fluid that owns this event) the field AND the mic dispatched
 * into the void — the HUD no longer mounts this bar there at
 * all; (2) even where typing worked, an always-visible field on
 * the canvas steals the scene's focus and strands the iOS page
 * short after the keyboard closes (Hotfix 2.3's white-below
 * bug). Voice is the canvas's input now; TYPING lives in the
 * Companion panel, whose send dispatches this same event where
 * focus theft costs nothing.
 *
 * Hotfix 2.4: an ask NO path could shape is no longer captioned as
 * an error (the old "beyond the interpreter" dev captions are gone
 * from user-facing copy entirely). The canvas answers with life
 * instead — the
 * ghost's puzzlement, or the fabric's own ripple — and the source
 * event carries that moment ({ source: "puzzled", ghostName }), so
 * this bar captions what actually happened in the world: "{Name}
 * tilts its head at that one." Successful interpretations keep
 * their honest credits below.
 *
 * Hotfix 2.5: the mic finally asks. Voice capture no longer
 * depends on SpeechRecognition existing (Firefox never shipped
 * it, so the button there could never even prompt) — the hook
 * falls back to getUserMedia + MediaRecorder capture with
 * transcription through the resolved endpoint, the mic button
 * pulses while live, and a transcription in flight captions
 * itself ("Heard you — turning it into words…"). A browser
 * refusal is answered in-world, ghost puzzlement included.
 *
 * Rendered inside ExperienceHUD (whose container is
 * pointerEvents="none"), so this root re-enables pointer events.
 *
 * Powered by Nirvana
 */
export default function ComposeBar() {
  // Platform const guard is safe; never changes across renders.
  if (Platform.OS !== "web") return null;

  const [composing, setComposing] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [source, setSource] = useState<
    "llm" | "builtin" | "ghost" | "device" | null
  >(null);
  // Hotfix 2.4: the living fallback's caption state — the ghost's
  // name when the ghost performed its puzzlement, null when the
  // fabric itself rippled (no ghost able to act).
  const [puzzled, setPuzzled] = useState<{ name: string | null } | null>(
    null
  );
  const composingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onState = (ev: Event) => {
      const name = (ev as CustomEvent<string | null>).detail;
      setPlaying(name ?? null);
      setComposing(false);
    };
    const onSource = (ev: Event) => {
      const detail = (
        ev as CustomEvent<
          string | { source?: string; ghostName?: string | null }
        >
      ).detail;
      if (typeof detail === "string") {
        setSource(
          detail === "llm" ||
            detail === "builtin" ||
            detail === "ghost" ||
            detail === "device"
            ? detail
            : null
        );
        setPuzzled(null);
      } else if (detail && detail.source === "puzzled") {
        setSource(null);
        setPuzzled({ name: detail.ghostName ?? null });
      }
    };
    window.addEventListener(FABRIC_COMPOSE_STATE_EVENT, onState as EventListener);
    window.addEventListener(FABRIC_COMPOSE_SOURCE_EVENT, onSource as EventListener);
    return () => {
      window.removeEventListener(FABRIC_COMPOSE_STATE_EVENT, onState as EventListener);
      window.removeEventListener(FABRIC_COMPOSE_SOURCE_EVENT, onSource as EventListener);
      if (composingTimer.current) clearTimeout(composingTimer.current);
    };
  }, []);

  const submitText = (raw: string, confidence?: number | null) => {
    const text = raw.trim();
    if (!text || composing) return;
    setSource(null);
    setPuzzled(null);
    setComposing(true);
    // Slice 33: a voice final that carried the recognizer's
    // confidence dispatches the object detail ({ text, confidence,
    // via }) so the canvas can hand the score to the ghost's
    // utterance sense. Unscored voice finals keep the plain-string
    // detail every existing listener knows. (Typed asks dispatch
    // the same plain-string detail — from the Companion panel,
    // Slice 37; nothing types on the canvas any more.)
    window.dispatchEvent(
      new CustomEvent(FABRIC_COMPOSE_EVENT, {
        detail:
          typeof confidence === "number"
            ? { text, confidence, via: "voice" }
            : text,
      })
    );
    // Backstop: if composition produced nothing, the canvas reports a
    // null state — but never hang the input on a lost event.
    if (composingTimer.current) clearTimeout(composingTimer.current);
    composingTimer.current = setTimeout(() => setComposing(false), 20_000);
  };

  const voice = useComposeVoice(submitText);

  // Hotfix 2.5: while the mic is live the button breathes — a
  // voice state you can SEE, not a caption you have to read.
  // (Universal capture means this now happens in Firefox too:
  // getUserMedia asks, the button pulses, the bar listens.)
  const micPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!voice.listening) {
      micPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, {
          toValue: 0.45,
          duration: 560,
          useNativeDriver: true,
        }),
        Animated.timing(micPulse, {
          toValue: 1,
          duration: 560,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [voice.listening, micPulse]);

  const stop = () => {
    window.dispatchEvent(new CustomEvent(FABRIC_COMPOSE_STOP_EVENT));
  };

  return (
    <View pointerEvents="auto" style={{ marginTop: 8, maxWidth: 300 }}>
      {/* Slice 37: voice only. The mic is the whole affordance —
          no text field overlays the canvas, so nothing on this
          bar can take the scene's focus or summon a keyboard
          over it. The label beside the mic says where typing
          went (the Companion panel) instead of pretending the
          canvas is a form. */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Pressable
          pointerEvents="auto"
          onPress={voice.toggle}
          accessibilityRole="button"
          accessibilityLabel={voice.listening ? "Stop listening" : "Ask by voice"}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
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
          <Animated.View style={{ opacity: micPulse }}>
            <Text style={{ fontSize: 17 }}>{voice.listening ? "●" : "🎤"}</Text>
          </Animated.View>
        </Pressable>
        <Text style={{ color: "#94a3b8", fontSize: 11, flexShrink: 1 }}>
          {composing
            ? "Composing\u2026"
            : voice.listening
              ? "Listening \u2014 say it"
              : "Ask by voice \u2014 typing lives in the Companion panel"}
        </Text>
      </View>
      {voice.listening || voice.busy || voice.interim || voice.message ? (
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
              : voice.busy
                ? "Heard you — turning it into words…"
                : "Listening… speak your request")}
        </Text>
      ) : null}
      {source ? (
        <Text style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
          {source === "builtin"
            ? "Interpreted on-device."
            : source === "device"
              ? "Interpreted on this device."
              : source === "ghost"
                ? "Answered by your ghost, from its live state."
                : "Interpreted by the cloud model."}
        </Text>
      ) : null}
      {puzzled ? (
        <Text style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>
          {puzzled.name
            ? `${puzzled.name} tilts its head at that one.`
            : "The fabric ripples — that one's still a mystery."}
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
