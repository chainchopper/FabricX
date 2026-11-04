/**
 * Essence — Slice 29's living identity, in Slice 60's home.
 *
 * Slice 29 put this device's fDNA Game-of-Life in the top-right
 * corner, where the connection badge used to sit: a living
 * emblem, a tap for the ghost card summary, a second door to the
 * full ID card. Terrell (Nov 3, 2026, on device): "That ghostie
 * icon in the top right needs to be in the info panel with the
 * fabric info." Slice 60 moves it. The corner carries NOTHING
 * now — no size of this component renders over the canvas, and
 * nothing takes its place — and the default export below renders
 * as the "Your ghostie" block inside FabricInfo's per-fabric
 * panel (Slice 49), alongside that fabric's own information.
 *
 * THE BLOCK (what the panel shows):
 * - THE EMBLEM: a small 2D canvas (not a second fluid canvas —
 *   the single-canvas authority is untouched) running the device
 *   identity seed through the SHARED sim in src/identity/fdna.ts
 *   — the same module the Ghostie Home runs, no fork, no second
 *   stepper — drawn as fluid-glow: additive radial splats in the
 *   ghost's signature hue plus ONE secondary hue derived
 *   deterministically from the seed (essenceState.ts), with soft
 *   trails as cells are born and die. It steps on the behavior's
 *   cadence while the panel is open, so it genuinely evolves
 *   there; closed, the panel unmounts it (ChromeMount) and it
 *   costs nothing. The seed is read from the on-device
 *   identity/ghost records exactly as the Home reads it and is
 *   never transmitted; only the derived FBR tag is shown.
 * - THE SUMMARY (the corner's old standard mode, always shown
 *   here): the ghost's name + temperament, its FBR tag, three
 *   vitals mini-bars from the ghost store's ghostVitals readings,
 *   the brain line, and the connection state in ONE plain line.
 *   Tapping that line re-announces presence — the badge's tap
 *   behavior, kept.
 * - TWO DOORS, both links into the F menu, neither rebuilt here:
 *   "ID card ›" dispatches fabric:open-own-ghost-card (the Slice
 *   22 overlay); "Ghostie Home ›" dispatches
 *   fabric:open-ghostie-home. The Ghostie Home stays the deep
 *   panel, homed in the menu's YOU section — linked, never
 *   duplicated into this panel.
 *
 * CONNECTION STATE, READ AT A GLANCE: in the corner, state was
 * the essence's BEHAVIOR (steady / dimmed / pulsing). In the
 * panel it reads in words (the line above). With the panel
 * closed, the ONE remaining signal is a tint on the info icon
 * itself (FabricInfo): its ring and border take the danger color
 * while the session is reconnecting, the house accent otherwise.
 * A tint and nothing more — no text, no new element, no badge
 * back in the corner.
 *
 * SESSION RETRY — BEHAVIOR PRESERVED, NOW HEADLESS: the retired
 * badge's auto-retry loop never rendered anything; it only has
 * to keep running whether or not anyone opens a panel. It lives
 * in EssenceRetryKeeper below (mounted in _layout's ChromeLayer,
 * exactly where this component used to mount, rendering null):
 * the loop is carried VERBATIM — same 8s countdown, same
 * fabric:webrtc-reannounce dispatch, same gating (online with
 * zero peers only).
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

/** The door to the Slice 22 ghostie ID card (FabricMenu listens). */
export const ESSENCE_OPEN_GHOST_CARD_EVENT = "fabric:open-own-ghost-card";
/** The door to the Ghostie Home (FabricMenu listens; Slice 60). */
export const ESSENCE_OPEN_GHOSTIE_HOME_EVENT = "fabric:open-ghostie-home";

const RETRY_SECONDS = 8;

/**
 * EssenceRetryKeeper — the session's presence-retry loop, headless.
 *
 * Carried verbatim from the retired ConnectionBadge (via Slice
 * 29's corner Essence): while the session is online with zero
 * peers, re-announce presence every RETRY_SECONDS so a room can
 * still find this device. In 'local' mode there is nothing to
 * retry — local is the designed state, not a failure — and
 * 'connecting' resolves itself via bounded attempts. Slice 60
 * split it out of the visual component so the behavior never
 * depends on the info panel being open. Renders null, always.
 */
export function EssenceRetryKeeper() {
  if (Platform.OS !== "web") return null;

  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  // The badge RENDERED its retry countdown, so it lived in state;
  // nothing renders it now — the counter is a ref, the timing
  // and dispatch below are the badge's, unchanged.
  const countdownRef = useRef<number>(RETRY_SECONDS);
  const timerRef = useRef<number | null>(null);

  const mode = rt.mode ?? "local";
  const peers = rt.peers ?? 0;

  useEffect(() => {
    const unsub = subscribeRealtimeStatus((next) => setRt(next));
    return () => unsub();
  }, []);

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

  return null;
}

/* Emblem geometry: the fDNA grid at 14 bitmap px per cell, shown
 * at 84x56 CSS px (the summary grows around it, as the corner's
 * standard mode did). */
const CELL_PX = 14;
const BITMAP_W = FDNA_COLS * CELL_PX;
const BITMAP_H = FDNA_ROWS * CELL_PX;
const EMBLEM_W = 84;
const EMBLEM_H = 56;

export default function Essence() {
  if (Platform.OS !== "web") return null;

  const toast = useToast();
  const identity = useIdentitySnapshot();
  const self = identity.self;
  const seed = self?.seed;

  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  const [session, setSession] = useState<SessionPublicState>(() =>
    getSessionPublicState()
  );
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  const [tier, setTier] = useState<GhostBrainTier>("on-device");
  const [ghostSeed, setGhostSeed] = useState<number | null>(null);

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

  const reannounce = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
      toast.show("Re-announced presence");
    }
    // The badge's manual press also reset the loop's countdown;
    // the keeper owns its counter now (Slice 60) — the dispatch
    // above is the behavior that matters, and it is unchanged.
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

  // Step on the behavior's cadence while the panel holds this
  // block; hold still while the document is hidden. The panel
  // unmounts the block when it closes (ChromeMount), which is
  // what stops the stepping — the corner's old "pause while the
  // F menu covers it" case cannot occur here: opening the menu
  // closes the panel first.
  useEffect(() => {
    if (typeof seed !== "number") return;
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
  }, [seed, behavior]);

  // A behavior change (dim / pulse) is visible immediately, not at
  // the next step.
  useEffect(() => {
    drawRef.current();
  }, [behavior]);

  /* ---------------- the summary ---------------- */
  const tagSeed = ghostSeed ?? seed;
  const tag = typeof tagSeed === "number" ? deriveFdnaTag(tagSeed) : null;
  const brainLine = essenceBrainLine(ghost.brain?.source ?? null, tier);
  const connLine = essenceConnectionLine(
    behavior,
    peers,
    // Hotfix 2.6: the resolved role (session store) rides the
    // connection line — "Connected · 3 here · Hosting".
    session.role === "host" ? "host" : session.role === "guest" ? "guest" : null
  );
  const vitals = ghost.vitals
    ? [
        { label: "Health", value: ghost.vitals.health },
        { label: "Stamina", value: ghost.vitals.stamina },
        { label: "Vigor", value: ghost.vitals.vigor },
      ]
    : null;

  const openGhostCard = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ESSENCE_OPEN_GHOST_CARD_EVENT));
    }
  };
  const openGhostieHome = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ESSENCE_OPEN_GHOSTIE_HOME_EVENT));
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing.sm,
      }}
    >
      <View
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
      </View>

      <View style={{ marginTop: spacing.sm, gap: 2 }}>
        <Text
          style={{ color: colors.textDim, fontSize: typeScale.caption }}
        >
          {brainLine}
        </Text>
        <Pressable
          pointerEvents="auto"
          onPress={reannounce}
          accessibilityRole="button"
          accessibilityLabel={`${connLine}. Tap to re-announce presence`}
          style={{ paddingVertical: 2 }}
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: spacing.md,
          }}
        >
          <Pressable
            pointerEvents="auto"
            onPress={openGhostCard}
            accessibilityRole="button"
            accessibilityLabel="Open your ghostie's full ID card"
            style={{ paddingVertical: 2 }}
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
          <Pressable
            pointerEvents="auto"
            onPress={openGhostieHome}
            accessibilityRole="button"
            accessibilityLabel="Open your ghostie's home"
            style={{ paddingVertical: 2 }}
          >
            <Text
              style={{
                color: colors.accent,
                fontSize: typeScale.caption,
                fontWeight: "700",
              }}
            >
              Ghostie Home ›
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
