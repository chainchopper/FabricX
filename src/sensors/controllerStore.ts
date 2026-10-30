/**
 * Controller store — Slice 34 ("Senses", Layer B3): the phone as a
 * senses-only controller + calibration device for the OTHER screens
 * in the fabric.
 *
 * THE ROLE. A participant normally joins as a "screen": senses are
 * local input (Slice 12's laws — tilt leans THIS device's pool,
 * raw motion never leaves the phone) and the experience renders
 * here. Joining as a "controller" flips the direction on purpose:
 * this phone's tilt and shake are delivered to the room as events
 * (the tilt-geometry interactions and the shake event — never raw
 * samples), the experience renders on the other connected screens,
 * and this phone's own surface goes dark-but-honest: a control
 * surface naming the role, the live lean, and the way back. That
 * is Terrell's billboard line made literal: why look at my screen
 * when five other screens are connected to my fabric?
 *
 * The role is THIS DEVICE's choice about itself — it binds nobody
 * else, travels nowhere, and is not a session/host concept. It
 * persists on the device (fabric_controller_v1) like any other
 * body preference: rejoining the app as a controller is a stance
 * you keep until you stand down.
 *
 * CALIBRATION. A controller's tilt means nothing without a zero:
 * "registers orientation and scale for the session's shared space"
 * starts with this phone's natural grip. Calibrating captures the
 * CURRENT orientation (beta/gamma) as the neutral point — the
 * sensor hook (useDeviceMotion) registers a capture handler that
 * reads its latest raw sample, the motionState permission pattern
 * exactly — and the hook's tilt math then measures from the
 * captured neutral instead of the stock 45° assumption. The
 * capture is a number pair from the phone's own sensors; like all
 * raw motion data it never leaves the device. What travels is only
 * what tilt events ever carried: splat geometry.
 *
 * PRIVACY, restated because this store is where it could blur:
 * this module holds a role word and two calibration angles. No
 * sensor stream, no history, no per-frame anything. The tilt
 * EVENTS that leave a controller are built by tiltInteractionFor
 * below from an already-smoothed, already-dead-zoned lean vector —
 * the same numbers Slice 12 would have splatted locally.
 *
 * Same module pub/sub pattern as src/sensors/motionState.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";
import type { FluidInteraction } from "../types/fluid";

export const CONTROLLER_KEY = "fabric_controller_v1";

export type ControllerRole = "screen" | "controller";

export interface ControllerCalibration {
  /** Neutral orientation, degrees, captured from the live sensor. */
  beta0: number;
  gamma0: number;
  capturedAt: number;
}

export interface ControllerSnapshot {
  role: ControllerRole;
  calibration: ControllerCalibration | null;
}

type Listener = (s: ControllerSnapshot) => void;

let snapshot: ControllerSnapshot = { role: "screen", calibration: null };
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // A misbehaving consumer must not break the store.
    }
  });
}

export function getControllerSnapshot(): ControllerSnapshot {
  return snapshot;
}

export function subscribeController(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ------------------------------------------------------------------ */
/* Persistence (best-effort, device-local)                             */
/* ------------------------------------------------------------------ */

interface PersistedController {
  role?: unknown;
  calibration?: unknown;
}

export function sanitizeControllerPersisted(
  raw: unknown
): ControllerSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { role: "screen", calibration: null };
  }
  const rec = raw as PersistedController;
  const role: ControllerRole =
    rec.role === "controller" ? "controller" : "screen";
  let calibration: ControllerCalibration | null = null;
  const c = rec.calibration as Record<string, unknown> | null;
  if (
    c &&
    typeof c === "object" &&
    typeof c.beta0 === "number" &&
    Number.isFinite(c.beta0) &&
    typeof c.gamma0 === "number" &&
    Number.isFinite(c.gamma0)
  ) {
    calibration = {
      beta0: c.beta0,
      gamma0: c.gamma0,
      capturedAt: typeof c.capturedAt === "number" ? c.capturedAt : 0,
    };
  }
  return { role, calibration };
}

let loadStarted = false;

/** Load the persisted stance once (idempotent; publish on land). */
export function ensureControllerLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void (async () => {
    try {
      const raw = await getJSON<unknown>(CONTROLLER_KEY, null);
      const loaded = sanitizeControllerPersisted(raw);
      // A user choice made while the load was in flight wins.
      if (snapshot.role === "screen" && snapshot.calibration === null) {
        snapshot = loaded;
        emit();
      }
    } catch {
      // Persistence is best-effort; the default stance stands.
    }
  })();
}

function persist(): void {
  void setJSON(CONTROLLER_KEY, snapshot).catch(() => {
    // Best-effort (see ghostBrainPref): the row re-reads on open.
  });
}

/* ------------------------------------------------------------------ */
/* The role                                                            */
/* ------------------------------------------------------------------ */

export function setControllerRole(role: ControllerRole): void {
  if (snapshot.role === role) return;
  snapshot = { ...snapshot, role };
  persist();
  emit();
}

export function isControllerRole(): boolean {
  return snapshot.role === "controller";
}

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */

type CaptureFn = () => { beta: number; gamma: number } | null;

let captureHandler: CaptureFn | null = null;

/**
 * Called by useDeviceMotion while it is listening; cleared on
 * unmount. The handler reads the hook's latest raw sample — the
 * only place raw orientation exists — and hands back one pair.
 */
export function registerCalibrationCapture(
  handler: CaptureFn | null
): void {
  captureHandler = handler;
}

/**
 * Capture the current grip as the shared space's neutral. Resolves
 * true when a live sensor sample was captured (the hook must be
 * listening — Motion on for the layer, permission granted);
 * false when no sensor is flowing, so the UI can say so plainly
 * instead of recording a fiction.
 */
export function requestControllerCalibration(): boolean {
  if (!captureHandler) return false;
  const sample = captureHandler();
  if (!sample) return false;
  snapshot = {
    ...snapshot,
    calibration: {
      beta0: sample.beta,
      gamma0: sample.gamma,
      capturedAt: Date.now(),
    },
  };
  persist();
  emit();
  return true;
}

export function clearControllerCalibration(): void {
  if (snapshot.calibration === null) return;
  snapshot = { ...snapshot, calibration: null };
  persist();
  emit();
}

/* ------------------------------------------------------------------ */
/* The tilt event (B3's wire shape)                                    */
/* ------------------------------------------------------------------ */

/**
 * Build the interaction a controller's lean sends to the room.
 * The geometry is Slice 12's own tilt splat — the splat sits
 * up-slope of center and pushes down-slope at TILT_FORCE — so a
 * receiving screen renders exactly the lean the controller's own
 * screen would have shown as a "screen". Position and force are
 * all that travel; the raw beta/gamma never do.
 */
export function tiltInteractionFor(
  tiltX: number,
  tiltY: number,
  color: { r: number; g: number; b: number }
): Omit<FluidInteraction, "userId" | "timestamp"> {
  return {
    kind: "tilt",
    position: { x: 0.5 - tiltX * 0.16, y: 0.5 - tiltY * 0.16 },
    force: { x: tiltX * 42, y: tiltY * 42 },
    pressure: 0.4,
    color,
  };
}
