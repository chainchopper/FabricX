/**
 * Lint bridge — the tiny translator between a Fabric room and its lint.
 *
 * Every Fabric client already sees the whole room: its own sends at the
 * sendInteraction funnel, remote interactions at acceptRemote, notes at
 * sendNote / the note receive branch (taps in useFluidMultiUser). The
 * bridge consumes exactly those taps and summarizes them into lint
 * frames (lintProtocol) — verbs and notes immediately, strokes as a
 * 10 Hz energy aggregate. It never sees raw local-only life: ambient
 * breathing never enters the funnel, and ghost interactions are
 * filtered out by sender prefix. LOCAL-ONLY STAYS LOCAL.
 *
 * One bridge per room: bridges elect themselves — the connected human
 * client with the smallest peerId among (self + heard humans) is the
 * bridge; everyone else stays silent on the wire. If the bridge
 * leaves, the next-smallest takes over. Every frame carries a dedupe
 * id, and every frame is ALSO published to lintStore, so a same-tab
 * simulator can preview the loop before the relay worker (Hotfix 2.0)
 * is deployed.
 *
 * The return path: lint-touch payloads (from the relay, or from the
 * same-tab simulator via lintStore) are gated EXACTLY like a guest's
 * broadcast under Slice 5's rule — the lint is treated as a guest
 * whose id is its peerId: open room / collab -> its touches land;
 * control -> only if it were the driver (v0 hosts cannot pass control
 * to a lint, so effectively never); mirror / view -> never, the same
 * silence a guest's broadcast gets. An allowed touch is injected
 * through the ghost's established two-step: sendInteraction under the
 * lint's own id (broadcast + seq stamp) and injectRemoteInteraction
 * for the local render, sharing one object so (userId, seq) dedupe
 * keeps it single.
 *
 * Powered by Nirvana
 */

import type { FluidInteraction } from "../types/fluid";
import {
  getSignalingService,
  type SignalingMessage,
} from "../services/SignalingService";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../session/sessionStore";
import { getIdentitySnapshot, getPeerIdentity } from "../identity/identityStore";
import {
  asLintFrameMessage,
  asLintHello,
  asLintTouch,
  clamp01,
  hueToRgb,
  isLintId,
  isLintPayload,
  makeLintFrameMessage,
  noteNameToMidi,
  normHue,
  rgbToHue,
  type LintFrame,
  type LintTouch,
} from "./lintProtocol";
import {
  forgetLintDevice,
  noteLintDevice,
  publishLintFrame,
  subscribeLocalLintTouches,
} from "./lintStore";

export interface LintBridgeHooks {
  sendInteraction: (
    interaction: Omit<FluidInteraction, "userId" | "timestamp">,
    fromUserId?: string
  ) => FluidInteraction;
  injectRemoteInteraction: (interaction: FluidInteraction) => void;
}

const TICK_MS = 100;
const EMIT_MIN_INTERVAL_MS = 100; // stroke-energy ceiling: 10 Hz
const EMIT_HEARTBEAT_MS = 300; // re-emit a steady state at least this often
const ENERGY_ON = 0.03;
const SEEN_TOUCH_CAP = 64;

// Aggregation tuning (v0, by feel — see docs/LINT.md): a point's
// contribution saturates so unknown engine force scales can't blow
// the accumulator up; the 0.55 decay per 100ms tick gives stroke
// energy a ~0.5s memory, so a lamp glows while you draw and settles
// shortly after you stop.
const DECAY = 0.55;
const INTENSITY_SCALE = 8;

interface Binding {
  roomId: string;
  selfId: string;
  hooks: LintBridgeHooks;
}

let binding: Binding | null = null;
let bindToken = 0;
let unsubs: (() => void)[] = [];
let tickTimer: ReturnType<typeof setInterval> | null = null;

let elected = false;
let frameCounter = 0;

// Stroke-energy accumulator.
let acc = 0;
let sumSin = 0;
let sumCos = 0;
let lastHue = 210;
let wasActive = false;
let lastEmitAt = 0;
let lastEmitIntensity = 0;
let lastEmitHue = 210;

let prevSession: { mode: string; hostId: string | null; peers: number } | null =
  null;

const seenTouchIds: string[] = [];
const seenTouchSet = new Set<string>();

function selfHue(): number | null {
  try {
    const self = getIdentitySnapshot().self;
    return self && typeof self.hue === "number" ? self.hue : null;
  } catch {
    return null;
  }
}

function peerHue(id: string | null | undefined): number | null {
  if (!id) return null;
  try {
    const p = getPeerIdentity(id);
    return p && typeof p.hue === "number" ? p.hue : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Frame emission
// ------------------------------------------------------------------

function emitFrame(frame: LintFrame): void {
  if (!binding) return;
  const id = `${binding.selfId}:${++frameCounter}`;
  // Same-tab consumers (the simulator's local preview) always hear it.
  publishLintFrame(frame, id, "local");
  // The wire belongs to the elected bridge alone.
  if (!elected) return;
  const signaling = getSignalingService();
  if (!signaling.isConnected()) return;
  signaling.send({
    type: "relay",
    roomId: binding.roomId,
    from: binding.selfId,
    payload: makeLintFrameMessage(id, frame),
  } as SignalingMessage);
}

// ------------------------------------------------------------------
// Observation taps (called from useFluidMultiUser)
// ------------------------------------------------------------------

function interactionHue(i: FluidInteraction): number {
  if (typeof i.hue === "number") return i.hue;
  if (i.color) return rgbToHue(i.color.r, i.color.g, i.color.b);
  return lastHue;
}

/**
 * A room interaction that actually left a client (local, post-gate)
 * or arrived from the room (remote). Ghost and lint senders are
 * filtered here: the ghost stays a screen presence in v0, and lint
 * touches must never summarize back into lint frames (loop).
 */
export function lintObserveInteraction(interaction: FluidInteraction): void {
  if (!binding) return;
  const sender = interaction.userId;
  if (!sender || sender.startsWith("ghost:") || isLintId(sender)) return;

  if (interaction.verb) {
    emitFrame({
      kind: "verb",
      verb: interaction.verb,
      hue: interactionHue(interaction),
      intensity: clamp01(interaction.pressure || 1),
    });
    return;
  }

  // Stroke point: fold into the energy aggregate.
  const fx = interaction.force?.x ?? 0;
  const fy = interaction.force?.y ?? 0;
  const mag = Math.sqrt(fx * fx + fy * fy);
  const contribution =
    (interaction.pressure || 0.5) * Math.max(0.15, Math.min(1.5, mag / 120));
  const hue = interactionHue(interaction);
  const rad = (hue * Math.PI) / 180;
  acc += contribution;
  sumSin += Math.sin(rad) * contribution;
  sumCos += Math.cos(rad) * contribution;
  if (acc > 0.5) lastHue = hue;
}

/** A note the room heard (local send that passed the gate, or remote). */
export function lintObserveNote(init: {
  note: string;
  velocity: number;
  phase: "on" | "off";
  hue?: number | null;
}): void {
  if (!binding) return;
  const midi = noteNameToMidi(init.note);
  emitFrame({
    kind: "note",
    note: init.note,
    ...(midi !== null ? { midi } : {}),
    hue: typeof init.hue === "number" ? init.hue : lastHue,
    intensity: init.phase === "on" ? clamp01(init.velocity) : 0,
  });
}

// ------------------------------------------------------------------
// Aggregation tick
// ------------------------------------------------------------------

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function tick(): void {
  acc *= DECAY;
  sumSin *= DECAY;
  sumCos *= DECAY;
  const intensity = clamp01(acc / INTENSITY_SCALE);
  const resultant = Math.sqrt(sumSin * sumSin + sumCos * sumCos);
  let dominant = lastHue;
  if (resultant > 0.05) {
    dominant = normHue((Math.atan2(sumSin, sumCos) * 180) / Math.PI);
    lastHue = dominant;
  }
  const now = Date.now();
  if (intensity >= ENERGY_ON) {
    const changed =
      Math.abs(intensity - lastEmitIntensity) >= 0.08 ||
      hueDistance(dominant, lastEmitHue) >= 24;
    const heartbeat = now - lastEmitAt >= EMIT_HEARTBEAT_MS;
    const spaced = now - lastEmitAt >= EMIT_MIN_INTERVAL_MS;
    if (spaced && (changed || heartbeat)) {
      emitFrame({ kind: "stroke-energy", hue: dominant, intensity });
      lastEmitAt = now;
      lastEmitIntensity = intensity;
      lastEmitHue = dominant;
    }
    wasActive = true;
  } else if (wasActive) {
    // One trailing zero so lamps actually turn off.
    emitFrame({ kind: "stroke-energy", hue: lastHue, intensity: 0 });
    lastEmitAt = now;
    lastEmitIntensity = 0;
    wasActive = false;
  }
}

// ------------------------------------------------------------------
// Session frames + bridge election
// ------------------------------------------------------------------

function onSessionState(s: SessionPublicState): void {
  if (!binding || s.roomId !== binding.roomId) return;

  // Election: smallest connected human peerId bridges.
  const candidates = [s.selfId, ...s.guestIds].filter(
    (id) => id && !isLintId(id) && !id.startsWith("ghost:")
  );
  if (candidates.length > 0) {
    candidates.sort();
    elected = candidates[0] === binding.selfId;
  }

  const cur = { mode: s.mode, hostId: s.hostId, peers: s.peers };
  if (!prevSession) {
    prevSession = cur;
    return;
  }
  if (
    cur.mode !== prevSession.mode ||
    cur.hostId !== prevSession.hostId ||
    cur.peers !== prevSession.peers
  ) {
    const hue =
      peerHue(cur.hostId) ??
      (cur.hostId === binding.selfId ? selfHue() : null) ??
      lastHue;
    emitFrame({
      kind: "session",
      mode: cur.mode,
      hue,
      intensity: clamp01(cur.peers / 4),
    });
    prevSession = cur;
  }
}

// ------------------------------------------------------------------
// Lint -> fabric: hellos, touches
// ------------------------------------------------------------------

function touchAllowed(fromId: string): boolean {
  const s = getSessionPublicState();
  if (!binding || s.roomId !== binding.roomId) return false;
  // Slice 5's rule, from the lint's chair (it is never host or driver
  // in v0) — mirrors computeCanSend in useFluidMultiUser.
  if (!s.hostId) return true;
  if (s.mode === "collab") return true;
  if (s.mode === "control") return s.driverId === fromId;
  return s.hostId === fromId; // mirror / view: host only
}

function handleLintTouch(fromId: string, touch: LintTouch): void {
  if (!binding) return;
  if (seenTouchSet.has(touch.id)) return;
  seenTouchSet.add(touch.id);
  seenTouchIds.push(touch.id);
  if (seenTouchIds.length > SEEN_TOUCH_CAP) {
    const old = seenTouchIds.shift();
    if (old) seenTouchSet.delete(old);
  }
  if (!touchAllowed(fromId)) return;
  const partial: Omit<FluidInteraction, "userId" | "timestamp"> = {
    position: { x: touch.x, y: touch.y },
    force: { x: 0, y: 0 },
    pressure: 1,
    color: hueToRgb(touch.hue),
  };
  const full = binding.hooks.sendInteraction(partial, fromId);
  binding.hooks.injectRemoteInteraction(full);
}

function onSignalingMessage(msg: SignalingMessage): void {
  if (!binding || !msg || msg.roomId !== binding.roomId) return;
  if (msg.type === "peer-left") {
    if (isLintId(msg.peerId)) forgetLintDevice(msg.peerId);
    return;
  }
  if (msg.type !== "relay") return;
  if (msg.from === binding.selfId) return; // the worker never echoes; belt + braces
  if (!isLintPayload(msg.payload)) return;
  const hello = asLintHello(msg.payload);
  if (hello) {
    noteLintDevice(msg.from, hello, "relay");
    return;
  }
  const frameMsg = asLintFrameMessage(msg.payload);
  if (frameMsg) {
    // Another bridge's frames: publish for local consumers (the
    // simulator labels them "relay" — the true wire path).
    publishLintFrame(frameMsg.frame, frameMsg.id, "relay");
    return;
  }
  const touch = asLintTouch(msg.payload);
  if (touch) handleLintTouch(msg.from, touch);
}

// ------------------------------------------------------------------
// Bind / unbind (called from useFluidMultiUser)
// ------------------------------------------------------------------

function stopBridge(): void {
  unsubs.forEach((u) => {
    try {
      u();
    } catch {
      // Unsubscribe errors are not fatal.
    }
  });
  unsubs = [];
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  binding = null;
  elected = false;
  prevSession = null;
  acc = 0;
  sumSin = 0;
  sumCos = 0;
  wasActive = false;
}

export function bindLintBridge(
  roomId: string,
  selfId: string,
  hooks: LintBridgeHooks
): () => void {
  const token = ++bindToken;
  stopBridge();
  binding = { roomId, selfId, hooks };

  const signaling = getSignalingService();
  unsubs.push(signaling.onMessage(onSignalingMessage));
  unsubs.push(subscribeSessionState(onSessionState));
  unsubs.push(
    subscribeLocalLintTouches((fromId, touch) => handleLintTouch(fromId, touch))
  );
  tickTimer = setInterval(tick, TICK_MS);

  return () => {
    if (token === bindToken) stopBridge();
  };
}
