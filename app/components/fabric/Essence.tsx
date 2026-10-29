/**
 * Essence — Slice 29: the living corner identity.
 *
 * The top-right corner used to carry the connection badge — three
 * lines of debug-flavored text ("Auto retry in 4s · Tap to retry").
 * Terrell's call: that real estate should MEAN something. It is now
 * this device's fDNA Game-of-Life, alive — a tiny piece of the
 * fluid that is unmistakably alive and unmistakably THIS device's.
 *
 * THE EMBLEM: a small 2D canvas in chrome (not a second fluid
 * canvas — the single-canvas authority is untouched) running the
 * device identity seed through the SHARED sim in
 * src/identity/fdna.ts — the same module the Ghostie Home runs, no
 * fork, no second stepper — drawn as fluid-glow: additive radial
 * splats in the ghost's signature hue plus ONE secondary hue
 * derived deterministically from the seed (essenceState.ts), with
 * soft trails as cells are born and die (each cell carries a glow
 * intensity that decays over ~3 steps). The seed is read from the
 * on-device identity/ghost records exactly as the Home reads it
 * and is never transmitted; only the derived FBR tag is shown.
 *
 * MODES:
 * - Compact (default): about the old badge's footprint, no text.
 *   Connection state is the essence's BEHAVIOR (essenceState):
 *   connected = steady living glow at the Home's 300ms cadence;
 *   reconnecting/retry = dimmed and slowed, holding its breath;
 *   solo = a calm slow pulse. No "Auto retry" text, no FPS, ever.
 * - Standard (tap): ~2x the compact height — the emblem at left,
 *   the ghost card summary at right (name + temperament, FBR tag,
 *   three vitals mini-bars from the ghost store's ghostVitals
 *   readings, the brain tier line) and below, the connection state
 *   in ONE plain line. Tapping that line re-announces presence —
 *   the badge's tap behavior, kept. Tap the essence again, or
 *   anywhere else, and it collapses.
 * - Full view: standard mode's "ID card ›" dispatches
 *   fabric:open-own-ghost-card; the F menu listens and opens the
 *   EXISTING Slice 22 ghostie ID card overlay. This component
 *   rebuilds none of it — it only wires the door.
 *
 * SESSION RETRY — BEHAVIOR PRESERVED: the retired badge's
 * auto-retry loop is carried below VERBATIM (same 8s countdown,
 * same fabric:webrtc-reannounce dispatch, same gating: online with
 * zero peers only). Only its presentation changed — the countdown
 * is no longer rendered as text; the essence's dimming carries it.
 *
 * PERF: the sim steps on the Home's cadence (300ms) or slower by
 * behavior, skips ticks while the document is hidden, and pauses
 * when the F menu is open over it on a narrow screen. It is a
 * corner emblem; it costs ~nothing.
 *
 * Mount: _layout's ChromeLayer, exactly where ConnectionBadge
 * mounted (top-right, zIndex 60, web only — the badge's own gate).
 * Every tap target carries its own pointerEvents="auto".
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import {
  getRealtimeStatus,
  subscribeRealtimeStatus,
  type RealtimeStatus,
} from "../../../shared/utils/realtimeStatus";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../../../src/session/sessionStore";
import {
  FDNA_COLS,
  FDNA_ROWS,
  createFdnaLineage,
  deriveFdnaTag,
  type FdnaLineage,
} from "../../../src/identity/fdna";
import {
  essenceBehaviorFor,
  essenceBrainLine,
  essenceConnectionLine,
  essenceGlowAlpha,
  essenceSecondaryHue,
  essenceStepMs,
} from "../../../src/identity/essenceState";
import { useIdentitySnapshot } from "../../../src/identity/useIdentity";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";
import {
  getGhostBrainTier,
  type GhostBrainTier,
} from "../../../src/ghost/ghostBrainPref";
import { GHOST_PREF_KEY } from "../../../src/ghost/useGhostPeer";
import { getJSON } from "../../utils/storage";
import { useToast } from "../Toast";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import { useFabricChrome } from "./FabricChromeContext";

/** The door to the Slice 22 ghostie ID card (FabricMenu listens). */
export const ESSENCE_OPEN_GHOST_CARD_EVENT = "fabric:open-own-ghost-card";

const RETRY_SECONDS = 8;

/* Emblem geometry: the fDNA grid at 14 bitmap px per cell, shown
 * at 84x56 CSS px in both modes (the card grows around it). */
const CELL_PX = 14;
const BITMAP_W = FDNA_COLS * CELL_PX;
const BITMAP_H = FDNA_ROWS * CELL_PX;
const EMBLEM_W = 84;
const EMBLEM_H = 56;

export default function Essence() {
  if (Platform.OS !== "web") return null;

  const toast = useToast();
  const { menuOpen } = useFabricChrome();
  const identity = useIdentitySnapshot();
  const self = identity.self;
  const seed = self?.seed;

  const [expanded, setExpanded] = useState(false);
  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  const [session, setSession] = useState<SessionPublicState>(() =>
    getSessionPublicState()
  );
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  const [tier, setTier] = useState<GhostBrainTier>("on-device");
  const [ghostSeed, setGhostSeed] = useState<number | null>(null);
  // The badge RENDERED its retry countdown, so it lived in state;
  // the essence never shows it — the counter is a ref, the timing
  // and dispatch below are the badge's, unchanged.
  const countdownRef = useRef<number>(RETRY_SECONDS);
  const timerRef = useRef<number | null>(null);

  const mode = rt.mode ?? "local";
  const peers = rt.peers ?? 0;
  const behavior = essenceBehaviorFor(mode, peers);

  useEffect(() => {
    const unsub = subscribeRealtimeStatus((next) => setRt(next));
    return () => unsub();
  }, []);

  useEffect(() => subscribeSessionState(setSession), []);
  useEffect(() => subscribeGhostState(setGhost), []);

  useEffect(() => {
    let cancelled = false;
    getGhostBrainTier()
      .then((t) => {
        if (!cancelled) setTier(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The ghost's seed (Slice 9 binding) for the FBR tag — read from
  // the on-device ghost record exactly as the Ghostie Home reads
  // it; the tag is derived locally and the seed never leaves.
  useEffect(() => {
    let cancelled = false;
    getJSON<{ identity?: { seed?: unknown } } | null>(GHOST_PREF_KEY, null)
      .then((pref) => {
        if (cancelled) return;
        const s = pref?.identity?.seed;
        if (typeof s === "number") setGhostSeed(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Manage auto-retry loop — carried verbatim from the retired
  // ConnectionBadge. It only runs in 'online' mode with no peers
  // (signaling is up, re-announcing may still find someone). In
  // 'local' mode there is nothing to retry — local is the designed
  // state, not a failure — and 'connecting' resolves itself via
  // bounded attempts.
  useEffect(() => {
    const shouldRetry = mode === "online" && peers === 0;
    if (!shouldRetry) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      countdownRef.current = RETRY_SECONDS;
      return;
    }

    // Start countdown if not already running
    if (!timerRef.current) {
      timerRef.current = window.setInterval(() => {
        if (countdownRef.current <= 1) {
          // Fire re-announce
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
          }
          countdownRef.current = RETRY_SECONDS; // reset loop
        } else {
          countdownRef.current -= 1;
        }
      }, 1000) as unknown as number;
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [mode, peers]);

  const reannounce = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
      toast.show("Re-announced presence");
    }
    // manual press resets countdown
    countdownRef.current = RETRY_SECONDS;
  };

  /* ---------------- the living emblem ---------------- */
  const hostRef = useRef<View | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<Uint8Array | null>(null);
  const lineageRef = useRef<FdnaLineage | null>(null);
  const glowRef = useRef<Float32Array>(
    new Float32Array(FDNA_COLS * FDNA_ROWS)
  );

  const primaryHue = ghost.ghostHue ?? self?.hue ?? 187;
  const secondaryHue =
    typeof seed === "number" ? essenceSecondaryHue(primaryHue, seed) : primaryHue;
  // Which cells burn in the secondary hue: a deterministic scatter
  // from the seed, stable for this device forever.
  const seedMix = typeof seed === "number" ? Math.abs(seed | 0) % 6 : 0;

  const drawNow = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof document === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const grid = gridRef.current;
    const glow = glowRef.current;
    const alpha = essenceGlowAlpha(behavior, Date.now());
    ctx.clearRect(0, 0, BITMAP_W, BITMAP_H);
    ctx.globalCompositeOperation = "lighter";
    for (let y = 0; y < FDNA_ROWS; y++) {
      for (let x = 0; x < FDNA_COLS; x++) {
        const i = y * FDNA_COLS + x;
        const intensity = glow[i];
        if (intensity <= 0.02) continue;
        const hue =
          (x * 7 + y * 13 + seedMix) % 6 === 0 ? secondaryHue : primaryHue;
        const cx = (x + 0.5) * CELL_PX;
        const cy = (y + 0.5) * CELL_PX;
        const r = (5 + 10 * intensity) * (grid && grid[i] ? 1 : 0.8);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(
          0,
          `hsla(${hue}, 90%, 62%, ${(0.85 * intensity * alpha).toFixed(3)})`
        );
        g.addColorStop(1, `hsla(${hue}, 90%, 62%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  };
  const drawRef = useRef(drawNow);
  drawRef.current = drawNow;

  // Mount the tiny canvas into its host view (web only; the host
  // keeps the layout, the canvas is a plain 2D surface inside it).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || typeof host.appendChild !== "function") return;
    const canvas = document.createElement("canvas");
    canvas.width = BITMAP_W;
    canvas.height = BITMAP_H;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);
    canvasRef.current = canvas;
    drawRef.current();
    return () => {
      canvas.remove();
      canvasRef.current = null;
    };
  }, []);

  // Seed the sim: the module's lineage owns the life (the Home
  // runs the same one) — it renews a burned-out lineage from the
  // identity's next derivation, so the emblem never settles into
  // a repeating loop. (This surface used to reseed only on total
  // extinction, which most lineages never reach — they freeze or
  // blink first.) gridRef mirrors the lineage's current grid for
  // the draw loop.
  useEffect(() => {
    if (typeof seed !== "number") return;
    const lineage = createFdnaLineage(seed);
    lineageRef.current = lineage;
    gridRef.current = lineage.grid;
    const glow = glowRef.current;
    const grid = lineage.grid;
    for (let i = 0; i < glow.length; i++) glow[i] = grid[i] ? 1 : 0;
    drawRef.current();
  }, [seed]);

  // Step on the behavior's cadence; hold still while hidden, and
  // pause while the F menu is open over the corner (narrow screens).
  useEffect(() => {
    if (typeof seed !== "number") return;
    const covered =
      menuOpen &&
      typeof window !== "undefined" &&
      window.innerWidth < 560;
    if (covered) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const lineage = lineageRef.current;
      if (!lineage) return;
      const next = lineage.step().grid;
      gridRef.current = next;
      const glow = glowRef.current;
      for (let i = 0; i < glow.length; i++) {
        glow[i] = next[i] ? 1 : glow[i] * 0.72;
      }
      drawRef.current();
    }, essenceStepMs(behavior));
    return () => window.clearInterval(id);
  }, [seed, behavior, menuOpen]);

  // A behavior change (dim / pulse) is visible immediately, not at
  // the next step.
  useEffect(() => {
    drawRef.current();
  }, [behavior, expanded]);

  /* ---------------- standard mode data ---------------- */
  const tagSeed = ghostSeed ?? seed;
  const tag = typeof tagSeed === "number" ? deriveFdnaTag(tagSeed) : null;
  const brainLine = essenceBrainLine(ghost.brain?.source ?? null, tier);
  const connLine = essenceConnectionLine(behavior, peers);
  const vitals = ghost.vitals
    ? [
        { label: "Health", value: ghost.vitals.health },
        { label: "Stamina", value: ghost.vitals.stamina },
        { label: "Vigor", value: ghost.vitals.vigor },
      ]
    : null;

  const openGhostCard = () => {
    setExpanded(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ESSENCE_OPEN_GHOST_CARD_EVENT));
    }
  };

  return (
    <>
      {expanded ? (
        <Pressable
          pointerEvents="auto"
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          accessibilityLabel="Close your ghostie's summary"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 65,
          }}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 70,
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: radius.card,
            padding: spacing.sm,
            ...(expanded ? { width: 304, maxWidth: 320 } : null),
          }}
        >
          <Pressable
            pointerEvents="auto"
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={
              expanded
                ? "Collapse your essence"
                : "Your essence — tap for your ghostie's summary"
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
            }}
          >
            <View
              ref={hostRef}
              style={{
                width: EMBLEM_W,
                height: EMBLEM_H,
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: "rgba(5,8,10,0.55)",
                opacity: behavior === "reconnecting" ? 0.55 : 1,
              }}
            />
            {expanded ? (
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: typeScale.body,
                    fontWeight: "700",
                  }}
                  numberOfLines={1}
                >
                  {ghost.ghostName ?? "Your ghostie"}
                  {ghost.temperament ? (
                    <Text
                      style={{ color: colors.textDim, fontWeight: "400" }}
                    >
                      {` · ${ghost.temperament}`}
                    </Text>
                  ) : null}
                </Text>
                {tag ? (
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: typeScale.caption,
                      fontWeight: "700",
                      letterSpacing: 1,
                    }}
                  >
                    {tag}
                  </Text>
                ) : null}
                {vitals
                  ? vitals.map((v) => (
                      <View
                        key={v.label}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textDim,
                            fontSize: 10,
                            width: 44,
                          }}
                        >
                          {v.label}
                        </Text>
                        <View
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: colors.line,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              height: 4,
                              borderRadius: 2,
                              width: `${Math.max(
                                0,
                                Math.min(100, v.value)
                              )}%`,
                              backgroundColor: colors.ghost,
                            }}
                          />
                        </View>
                      </View>
                    ))
                  : null}
              </View>
            ) : null}
          </Pressable>

          {expanded ? (
            <View style={{ marginTop: spacing.sm, gap: 2 }}>
              <Text
                style={{ color: colors.textDim, fontSize: typeScale.caption }}
              >
                {brainLine}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Pressable
                  pointerEvents="auto"
                  onPress={reannounce}
                  accessibilityRole="button"
                  accessibilityLabel={`${connLine}. Tap to re-announce presence`}
                  style={{ paddingVertical: 2, paddingRight: 8 }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: typeScale.caption,
                      fontWeight: "600",
                    }}
                  >
                    {connLine}
                    {session.hostId ? ` · room ${session.roomId}` : ""}
                  </Text>
                </Pressable>
                <Pressable
                  pointerEvents="auto"
                  onPress={openGhostCard}
                  accessibilityRole="button"
                  accessibilityLabel="Open your ghostie's full ID card"
                  style={{ paddingVertical: 2, paddingLeft: 8 }}
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: typeScale.caption,
                      fontWeight: "700",
                    }}
                  >
                    ID card ›
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </>
  );
}
