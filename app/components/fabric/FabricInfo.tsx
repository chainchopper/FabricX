/**
 * FabricInfo — Slice 49: one small animated info icon per
 * fabric, and the fabric's own information panel behind it.
 *
 * Terrell (Nov 3, 2026): "I feel like too much menu stuff is
 * included over our fabric space still so a small animated info
 * icon seems in order which will pull up the fabrics information
 * panel — each fabric is different so."
 *
 * The shape, under the chrome doctrine (the canvas is the view
 * space; one cluster; transitions, never pops; parked truly):
 *
 * - THE ICON is the only standing chrome a fabric adds. It
 *   docks bottom-right, riding above the fabric's own control
 *   band (fabricInfo's per-fabric offsets, from Slice 44's
 *   certified band heights) so it never covers a play surface,
 *   and clear of the Essence (top-right) and the brain chip's
 *   slot (top-center). It breathes — a slow pulse with a soft
 *   ring — on the house motion feel, rests still under
 *   reduced-motion, fades with the rest of the chrome at idle,
 *   and enters/leaves WITH its fabric (it is keyed by fabric
 *   id and mounted through ChromeMount, the one transition).
 *   It renders only while a fabric is loaded and the one menu
 *   is closed: on menu/gallery screens there is no icon.
 *
 * - THE PANEL is that fabric's own: its name and what it is,
 *   its modes, the rules that matter to a participant, its
 *   controls, the ghostie's tools available HERE (fabricInfo's
 *   resolver over the one ghost-tool registry, through the
 *   same gates the ghost is refused by), and the session's
 *   facts — including who is driving, which used to pin a
 *   participant's name onto the HUD cluster and now lives
 *   here, inside a panel a person chose to open. While the
 *   panel is open it is the only panel on the canvas (opening
 *   the F menu closes it; switching fabrics closes it), and
 *   closed means PARKED: ChromeMount plays the exit and
 *   unmounts, so a closed panel is zero pixels and no touch.
 *
 * Mount point: _layout's ChromeLayer, as a direct child of the
 * root view — the same pointer-events ancestry as every other
 * chrome element (no "none" ancestor; the scrim and the card
 * carry their own pointerEvents="auto").
 *
 * Content: ./fabricInfo.ts (pure data + the ghost-tool
 * resolver). Nothing about a specific fabric is hardcoded in
 * this component — the panel's content key is the loaded
 * fabric's id, resolved through fabricInfoFor.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useFabricChrome } from "./FabricChromeContext";
import ChromeMount from "../../../src/components/ui/ChromeMount";
import Icon from "../../../src/components/ui/Icon";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import {
  SESSION_MODE_LABEL,
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../../../src/session/sessionStore";
import {
  FABRIC_RULE_LABEL,
  getSessionFabricState,
  subscribeSessionFabric,
  type SessionFabricState,
} from "../../../src/session/fabricStore";
import { displayNameFor } from "../../../src/identity/identityStore";
import {
  canvasKindFor,
  fabricInfoFor,
  ghostToolsHere,
  iconBottomFor,
  FABRIC_ICON_RIGHT,
  FABRIC_ICON_SIZE,
} from "./fabricInfo";

function useReducedMotion(): boolean {
  return useMemo(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }, []);
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.accent,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.2,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
      }}
    >
      {children}
    </Text>
  );
}

function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <Text
          key={line}
          style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
        >
          {"·  "}
          {line}
        </Text>
      ))}
    </>
  );
}

export default function FabricInfo() {
  const { state } = useExperience();
  const { idle, chromeOpacity, menuOpen, setHoldVisible, noteActivity } =
    useFabricChrome();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionPublicState>(() =>
    getSessionPublicState()
  );
  const [fabricState, setFabricState] = useState<SessionFabricState>(() =>
    getSessionFabricState()
  );
  useEffect(() => subscribeSessionState(setSession), []);
  useEffect(() => subscribeSessionFabric(setFabricState), []);

  const active = state.activeExperience;
  const activeId = active?.id ?? null;

  // The panel belongs to ONE fabric: a fabric switch closes it
  // (the icon re-keys and arrives with the new fabric instead).
  const prevIdRef = useRef(activeId);
  useEffect(() => {
    if (prevIdRef.current !== activeId) {
      prevIdRef.current = activeId;
      setOpen(false);
    }
  }, [activeId]);
  // The one menu opening closes the panel: one panel at a time.
  useEffect(() => {
    if (menuOpen) setOpen(false);
  }, [menuOpen]);
  // While the panel is open, hold the chrome fade off.
  useEffect(() => {
    setHoldVisible(open);
    return () => setHoldVisible(false);
  }, [open, setHoldVisible]);

  // The breathing pulse: a slow swell of the icon with a soft
  // ring expanding off it. Still under reduced-motion.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.38],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });
  const iconScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });

  if (Platform.OS !== "web" || !active) return null;
  const info = fabricInfoFor(active.id);
  if (!info) return null;

  // The ghost's rules, resolved for THIS participant exactly as
  // the canvas resolves them for the ghost's own scenario: a
  // guest is bound by the host's rules; a host and an open room
  // are permissive (the host's rules bind guests, never the
  // host's own ghost).
  const rules =
    session.role === "guest"
      ? fabricState.rules
      : { draw: true, verbs: true, notes: true };
  const tools = ghostToolsHere(active.id, canvasKindFor(active), rules);

  const faded = idle && !open;
  const driverLine =
    session.hostId && session.mode === "control" && session.driverId
      ? session.driverId === session.selfId
        ? "You're driving"
        : `${displayNameFor(session.driverId, session.selfId)} is driving`
      : null;

  return (
    <>
      {/* THE ICON — keyed by fabric id: it arrives with its
          fabric and leaves with it, through ChromeMount. */}
      <ChromeMount
        key={active.id}
        visible={!menuOpen}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          right: FABRIC_ICON_RIGHT,
          bottom: iconBottomFor(active.id),
          zIndex: 85,
        }}
      >
        <Animated.View style={{ opacity: chromeOpacity }}>
          <View
            style={{
              width: FABRIC_ICON_SIZE,
              height: FABRIC_ICON_SIZE,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {reduceMotion ? null : (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: FABRIC_ICON_SIZE - 6,
                  height: FABRIC_ICON_SIZE - 6,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.accentLine,
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                }}
              />
            )}
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Pressable
                pointerEvents={faded && Platform.OS === "web" ? "none" : "auto"}
                onPress={() => {
                  noteActivity();
                  setOpen((o) => !o);
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  open
                    ? `Close information about ${active.name}`
                    : `About ${active.name}`
                }
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: open ? colors.accent : colors.accentLine,
                  backgroundColor: pressed ? colors.accentDim : colors.panel,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: faded && Platform.OS !== "web" ? 0.08 : 1,
                })}
              >
                <Icon
                  name={open ? "close" : "info"}
                  size={20}
                  color={colors.accent}
                />
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </ChromeMount>

      {/* THE PANEL — this fabric's own. Mounted only while
          open (ChromeMount unmounts after the exit: parked is
          zero pixels and no touch). */}
      <ChromeMount
        visible={open}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 90,
        }}
      >
        <Pressable
          pointerEvents="auto"
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={`Close ${active.name} information`}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.backdrop,
          }}
        />
        <View
          pointerEvents="auto"
          style={{
            position: "absolute",
            left: spacing.md,
            right: spacing.md,
            bottom: spacing.md,
            maxHeight: "62%",
            borderRadius: radius.sheet,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.sheet,
            padding: spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: typeScale.title,
                  fontWeight: "600",
                }}
              >
                {active.name}
              </Text>
              <Text
                style={{
                  color: colors.textDim,
                  fontSize: typeScale.body,
                  marginTop: 2,
                }}
              >
                {active.blurb}
              </Text>
            </View>
            <Pressable
              pointerEvents="auto"
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={`Close ${active.name} information`}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed
                  ? "rgba(255,255,255,0.08)"
                  : "transparent",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ marginTop: spacing.xs }}>
            <SectionTitle>WHAT THIS FABRIC IS</SectionTitle>
            <Text
              style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
            >
              {info.about}
            </Text>

            <SectionTitle>MODES</SectionTitle>
            <Lines lines={info.modes} />

            <SectionTitle>RULES HERE</SectionTitle>
            <Lines lines={info.rules} />
            {session.role === "guest" ? (
              <Text
                style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
              >
                {"·  "}You're a guest in this room — the host's rules
                for guests:{" "}
                {(Object.keys(FABRIC_RULE_LABEL) as Array<keyof typeof FABRIC_RULE_LABEL>)
                  .map(
                    (k) =>
                      `${FABRIC_RULE_LABEL[k].replace("Guests can ", "")} ${
                        fabricState.rules[k] ? "on" : "off"
                      }`
                  )
                  .join(" · ")}
              </Text>
            ) : session.role === "host" ? (
              <Text
                style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
              >
                {"·  "}You're hosting — guests here play by the rules
                you set in the F menu
              </Text>
            ) : null}

            <SectionTitle>CONTROLS</SectionTitle>
            <Lines lines={info.controls} />

            <SectionTitle>YOUR GHOSTIE HERE</SectionTitle>
            {tools.map((tool) => (
              <Text
                key={tool.id}
                style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
              >
                <Text
                  style={{
                    color: tool.available ? colors.ghost : colors.textDim,
                  }}
                >
                  ●
                </Text>{" "}
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {tool.label}
                </Text>{" "}
                — {tool.line}
                {tool.available ? "" : ` (${tool.note})`}
              </Text>
            ))}

            <SectionTitle>THIS ROOM</SectionTitle>
            {session.hostId ? (
              <>
                <Text
                  style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
                >
                  {SESSION_MODE_LABEL[session.mode]}
                  {session.role === "host"
                    ? " · you're hosting"
                    : session.role === "guest"
                      ? " · you're a guest"
                      : ""}
                  {` · ${session.peers} other ${session.peers === 1 ? "person" : "people"} here`}
                </Text>
                {driverLine ? (
                  <Text
                    style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
                  >
                    {driverLine}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text
                style={{ color: colors.textDim, fontSize: typeScale.body, lineHeight: 20 }}
              >
                Open room — just you and your ghostie, until someone
                joins or you start hosting.
              </Text>
            )}
          </ScrollView>
        </View>
      </ChromeMount>
    </>
  );
}
