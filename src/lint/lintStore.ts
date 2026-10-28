/**
 * Lint store — the in-app meeting point for Fabric objects.
 *
 * Same module pub/sub pattern as src/session/sessionStore: the bridge
 * (which lives with the room transport) and the simulator (which lives
 * in the chrome) never import each other; they meet here.
 *
 * Two flows pass through:
 * - FRAMES (bridge -> any local consumer): every lint frame the bridge
 *   emits is published here for same-tab consumers (the simulator's
 *   local preview) IN ADDITION to going out on the signaling relay.
 *   Frames that arrive FROM the relay are published too, tagged
 *   source "relay", so consumers can dedupe by frame id and honestly
 *   label what they're showing.
 * - LOCAL TOUCHES (simulator -> bridge): the simulator's touch button
 *   submits here when it wants the same-tab path; the bridge runs the
 *   exact same gating + injection handler it runs for relay touches,
 *   deduped by touch id across both sources.
 *
 * The device registry (from lint-hello, either source) backs the
 * simulator card's "objects in this room" line.
 *
 * Powered by Nirvana
 */

import type { LintFrame, LintHello, LintTouch } from "./lintProtocol";

export type LintFrameSource = "relay" | "local";

export interface LintDeviceInfo {
  peerId: string;
  name: string;
  deviceKind: LintHello["deviceKind"];
  caps: string[];
  hue: number;
  /** Last hello heard (ms) — devices re-hello as a heartbeat. */
  lastSeen: number;
  source: LintFrameSource;
}

export interface LintSnapshot {
  devices: LintDeviceInfo[];
  lastFrame: LintFrame | null;
  lastFrameSource: LintFrameSource | null;
  lastFrameAt: number;
}

const devices = new Map<string, LintDeviceInfo>();
let lastFrame: LintFrame | null = null;
let lastFrameSource: LintFrameSource | null = null;
let lastFrameAt = 0;

const snapshotListeners = new Set<(s: LintSnapshot) => void>();
const frameListeners = new Set<
  (frame: LintFrame, id: string, source: LintFrameSource) => void
>();
const localTouchListeners = new Set<(fromId: string, touch: LintTouch) => void>();

export function getLintSnapshot(): LintSnapshot {
  return {
    devices: [...devices.values()].sort((a, b) => a.peerId.localeCompare(b.peerId)),
    lastFrame,
    lastFrameSource,
    lastFrameAt,
  };
}

function emitSnapshot(): void {
  const snap = getLintSnapshot();
  snapshotListeners.forEach((l) => {
    try {
      l(snap);
    } catch {
      // A misbehaving consumer must not break the store.
    }
  });
}

export function subscribeLintStore(
  fn: (s: LintSnapshot) => void
): () => void {
  snapshotListeners.add(fn);
  fn(getLintSnapshot());
  return () => {
    snapshotListeners.delete(fn);
  };
}

/** A lint-hello was heard (either transport): register/refresh it. */
export function noteLintDevice(
  peerId: string,
  hello: LintHello,
  source: LintFrameSource
): void {
  devices.set(peerId, {
    peerId,
    name: hello.name,
    deviceKind: hello.deviceKind,
    caps: hello.caps,
    hue: hello.hue,
    lastSeen: Date.now(),
    source,
  });
  emitSnapshot();
}

export function forgetLintDevice(peerId: string): void {
  if (devices.delete(peerId)) emitSnapshot();
}

/** A lint frame exists (emitted locally or heard on the relay). */
export function publishLintFrame(
  frame: LintFrame,
  id: string,
  source: LintFrameSource
): void {
  lastFrame = frame;
  lastFrameSource = source;
  lastFrameAt = Date.now();
  frameListeners.forEach((l) => {
    try {
      l(frame, id, source);
    } catch {
      // Consumer errors are isolated.
    }
  });
  emitSnapshot();
}

export function subscribeLintFrames(
  fn: (frame: LintFrame, id: string, source: LintFrameSource) => void
): () => void {
  frameListeners.add(fn);
  return () => {
    frameListeners.delete(fn);
  };
}

/**
 * The simulator's local touch path: the panel submits its touch here
 * as well as on its socket. The bridge subscribes and runs the same
 * handler either way (dedupe by touch id makes double delivery a
 * no-op).
 */
export function submitLocalLintTouch(fromId: string, touch: LintTouch): void {
  localTouchListeners.forEach((l) => {
    try {
      l(fromId, touch);
    } catch {
      // Consumer errors are isolated.
    }
  });
}

export function subscribeLocalLintTouches(
  fn: (fromId: string, touch: LintTouch) => void
): () => void {
  localTouchListeners.add(fn);
  return () => {
    localTouchListeners.delete(fn);
  };
}
