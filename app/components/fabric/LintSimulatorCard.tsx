/**
 * LintSimulatorCard — a virtual lint device, living in the F menu's
 * Studio section (Slice 13, "Lint wakes up").
 *
 * This is a SIMULATOR and it says so: a panel that pretends to be a
 * lamp. But it does not cheat — it runs a real LintSocketClient on
 * its own WebSocket, joins the current room as `lint:sim-…`, says
 * lint-hello, and reacts to the same lint frames the ESP32 firmware
 * (firmware/lint_esp32/) renders. The orb is the light; the buzz bar
 * is the haptic stand-in; the button is the device's capacitive
 * touch, sent as a real lint-touch (and, while the Hotfix 2.0 relay
 * worker is undeployed, also handed to this tab's bridge locally —
 * the bridge runs the identical gating either way, deduped by id).
 *
 * Transport honesty is rendered, not implied: the badge says
 * LIVE · RELAY when frames are arriving over the socket, LOCAL
 * PREVIEW when only this tab's bridge summaries are reaching it,
 * and the footnote states the worker dependency outright.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import { hueCss } from "../../../src/identity/identityStore";
import {
  subscribeSessionState,
  type SessionPublicState,
} from "../../../src/session/sessionStore";
import { getSignalingService } from "../../../src/services/SignalingService";
import { LintSocketClient, type LintClientState } from "../../../src/lint/lintClient";
import {
  subscribeLintFrames,
  subscribeLintStore,
  submitLocalLintTouch,
  type LintFrameSource,
  type LintSnapshot,
} from "../../../src/lint/lintStore";
import { pitchHue, type LintFrame } from "../../../src/lint/lintProtocol";

const SIM_NAME = "Sim Lamp";
const SIM_HUE = 265;

export default function LintSimulatorCard() {
  const [session, setSession] = useState<SessionPublicState | null>(null);
  const [snapshot, setSnapshot] = useState<LintSnapshot | null>(null);
  const [clientState, setClientState] = useState<LintClientState>("closed");

  // Reaction state: `glow` is sustained (stroke-energy), `pulse` is
  // the fast flash (verbs, notes, session changes). The orb renders
  // whichever is louder; the buzz bar follows the latest intensity.
  const [glow, setGlow] = useState({ hue: SIM_HUE, level: 0 });
  const [pulse, setPulse] = useState({ hue: SIM_HUE, level: 0 });
  const [buzz, setBuzz] = useState(0);
  const [lastKind, setLastKind] = useState<string>("—");
  const [relayAlive, setRelayAlive] = useState(false);

  const clientRef = useRef<LintSocketClient | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastRelayAtRef = useRef(0);
  const lastStrokeAtRef = useRef(0);

  useEffect(() => subscribeSessionState(setSession), []);
  useEffect(() => subscribeLintStore(setSnapshot), []);

  const roomId = session?.roomId ?? "main";

  // Frame reactions, deduped by frame id across both transports.
  useEffect(() => {
    const react = (frame: LintFrame, id: string, source: LintFrameSource) => {
      if (source === "relay") {
        lastRelayAtRef.current = Date.now();
        setRelayAlive(true);
      }
      if (seenIdsRef.current.has(id)) return;
      seenIdsRef.current.add(id);
      if (seenIdsRef.current.size > 128) {
        seenIdsRef.current = new Set([...seenIdsRef.current].slice(-64));
      }
      switch (frame.kind) {
        case "verb":
          setPulse({ hue: frame.hue, level: 1 });
          setBuzz(1);
          setLastKind(`verb · ${frame.verb ?? ""}`);
          break;
        case "note":
          // Notes flash their pitch color (the firmware does the
          // same); the frame's hue stays the player's identity hue.
          setPulse({
            hue: typeof frame.midi === "number" ? pitchHue(frame.midi) : frame.hue,
            level: frame.intensity > 0 ? Math.max(frame.intensity, 0.2) : 0,
          });
          setBuzz(frame.intensity);
          setLastKind(`note · ${frame.note ?? ""}`);
          break;
        case "stroke-energy":
          lastStrokeAtRef.current = Date.now();
          setGlow({ hue: frame.hue, level: frame.intensity });
          setBuzz(Math.max(frame.intensity * 0.7, 0));
          setLastKind("stroke energy");
          break;
        case "session":
          setPulse({ hue: frame.hue, level: 0.6 });
          setLastKind(`session · ${frame.mode ?? ""}`);
          break;
      }
    };
    return subscribeLintFrames(react);
  }, []);

  // The device itself: one socket client per room.
  useEffect(() => {
    const client = new LintSocketClient({
      url: getSignalingService().getServerUrl(),
      roomId,
      name: SIM_NAME,
      deviceKind: "light",
      caps: ["glow", "pulse", "buzz"],
      hue: SIM_HUE,
      touchX: 0.5,
      touchY: 0.42,
      onState: setClientState,
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [roomId]);

  // Decay: pulses fade fast, buzz fades faster, and a stale glow
  // (no stroke-energy frame for a while) settles on its own.
  useEffect(() => {
    const t = setInterval(() => {
      setPulse((p) => (p.level > 0.01 ? { ...p, level: p.level * 0.76 } : p));
      setBuzz((b) => (b > 0.01 ? b * 0.84 : 0));
      if (Date.now() - lastStrokeAtRef.current > 1400) {
        setGlow((g) => (g.level > 0.01 ? { ...g, level: g.level * 0.9 } : g));
      }
      if (relayAlive && Date.now() - lastRelayAtRef.current > 6000) {
        setRelayAlive(false);
      }
    }, 120);
    return () => clearInterval(t);
  }, [relayAlive]);

  const orbLevel = Math.max(glow.level, pulse.level);
  const orbHue = pulse.level >= glow.level ? pulse.hue : glow.hue;
  const badge =
    clientState === "unavailable"
      ? "LOCAL ONLY"
      : relayAlive
        ? "LIVE · RELAY"
        : clientState === "online"
          ? "LOCAL PREVIEW"
          : "CONNECTING";
  const deviceNames = (snapshot?.devices ?? [])
    .map((d) => d.name)
    .filter(Boolean)
    .slice(0, 3);

  const onTouch = () => {
    const client = clientRef.current;
    if (!client) return;
    const touch = client.touch();
    // Same-tab path: the bridge runs the identical gate + inject
    // handler for this as for a relay-delivered touch (dedupe by id
    // makes the double delivery harmless when the worker is live).
    submitLocalLintTouch(client.peerId, touch);
  };

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
          Lint — objects in the room
        </Text>
        <Text style={{ color: colors.accent, fontSize: typeScale.caption, fontWeight: "700" }}>
          {badge}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: hueCss(orbHue),
            opacity: 0.22 + 0.78 * orbLevel,
            transform: [{ scale: 0.9 + 0.22 * orbLevel }],
          }}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            {SIM_NAME} · simulator
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            {`Last event: ${lastKind}`}
          </Text>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.round(buzz * 100)}%`,
                backgroundColor: hueCss(orbHue),
              }}
            />
          </View>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Buzz — the haptic stand-in. Draw, send a verb, or play a
            note: the room's bridge summarizes it for objects like
            this one.
          </Text>
        </View>
      </View>

      <Pressable
        pointerEvents="auto"
        onPress={onTouch}
        accessibilityRole="button"
        style={({ pressed }) => ({
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.accentLine,
          backgroundColor: pressed ? colors.accentDim : "transparent",
          alignItems: "center",
        })}
      >
        <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
          Touch the fabric — from the lamp
        </Text>
      </Pressable>

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        {deviceNames.length > 0
          ? `Objects heard in this room: ${deviceNames.join(" · ")}`
          : "No objects heard yet — this simulator is the first."}
      </Text>
      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        A simulator, honestly labeled: it speaks the real lint
        protocol on its own socket, exactly like the ESP32 firmware
        in firmware/lint_esp32. Full relay needs the Hotfix 2.0
        worker deployed; until then this tab's bridge previews the
        frames locally.
      </Text>
    </View>
  );
}
