import { useEffect, useRef, useState, type RefObject } from "react";
import type { LegacyFluidEngine } from "../components/fluid/LegacyFluidEngine";
import { getIdentitySnapshot, hueDyeColor } from "../identity/identityStore";
import {
  registerMotionRequestHandler,
  setMotionPublicState,
  type MotionPermission,
} from "./motionState";

/**
 * Slice 12 ("The Body's Sensors") — the phone's motion sensors,
 * wired into the fluid.
 *
 * The Oct 26 sensor inventory had gyro/tilt as the last unwired
 * sense (mic, camera, haptics, speakers already live). The world
 * model frames sensors as how the real world TOUCHES the fabric;
 * this hook is that touch, under three laws the whole slice obeys:
 *
 * 1. SENSORS ARE PERSONAL INPUT, LIKE A FINGER. Tilt steers only
 *    THIS device's fluid. The raw orientation/motion stream is
 *    read here, applied here, and dropped here — it is never put
 *    on a transport, never written to a store, never logged. What
 *    the room receives from a person moving is only what their
 *    deliberate gestures have always sent: their strokes, and (see
 *    3) the shake EVENT. A peer cannot learn how you are holding
 *    your phone from anything Fabric transmits.
 * 2. OPT-IN PER LAYER. The hook runs only while the active layer's
 *    "Motion" setting (specific.motionEnabled, THIS LAYER settings)
 *    is on — and unlike the ghost/ambient toggles, absent means
 *    OFF: a layer starts still until its owner asks the body in.
 *    Toggle off → listeners are removed entirely, not muted.
 * 3. A SHAKE IS A VERB, NOT A STREAM. A deliberate shake fires ONE
 *    interaction (kind: "shake") through LegacyFluid's normal
 *    sendInteraction funnel — Slice 5 session gating, Slice 6 hue
 *    stamp, Hotfix 1.9 sequence all apply — and receivers render a
 *    radial bloom in the shaker's hue. Peers feel an event, never
 *    a feed.
 *
 * IDLE BEHAVIOR (the Slice 7 contract applied to sensors): hidden
 * tab → the apply loop stands down and nothing is scheduled; a
 * quiet device produces a zero vector (flat-desk detection below),
 * so a phone lying still injects no phantom current; toggle off →
 * full listener teardown. Sampling is rAF-throttled and splats are
 * capped at ~3/s — the battery cost of an enabled layer is a few
 * small splats, not a sensor firehose.
 *
 * PLATFORMS: web today (DeviceOrientation / DeviceMotion). iOS
 * Safari gates both behind requestPermission(), which the browser
 * honors ONLY from inside a user gesture — LegacyFluid never calls
 * it; the F menu's "Enable tilt" button does (via motionState),
 * inside its onPress. Android Chrome and desktop browsers need no
 * request. Native shells expose no web orientation events, so the
 * hook reports "unavailable" there — native motion APIs are a
 * separate slice, not a fallback this one fakes.
 */

export interface MotionStats {
  /** off: layer setting off · needs-permission: iOS request not yet
   *  granted · denied · unavailable: no web sensor APIs ·
   *  on: listening */
  state: "off" | "needs-permission" | "denied" | "unavailable" | "on";
  /** Smoothed tilt vector currently being applied, -1..1 per axis. */
  tiltX: number;
  tiltY: number;
  shakes: number;
  lastShakeAt: number | null;
}

/** Holding a phone in hand, its top tilted back, reads beta ≈ 45°. */
const NEUTRAL_BETA_DEG = 45;
/** Degrees of tilt from neutral that map to full-strength pull. */
const TILT_RANGE_DEG = 35;
/** Below this, hand tremor and sensor noise are not intent. */
const TILT_DEAD_ZONE = 0.09;
/** Tilt splat cadence: a lean, not a spray (≈3/s). */
const TILT_SPLAT_MS = 320;
/** Peak tilt force — ambient micro-currents run 42–70, touch runs
 *  in the hundreds; a pool leaning should sit at the gentle end. */
const TILT_FORCE = 42;

/**
 * Shake detection, tuned against walking: a footstep's impact is a
 * single moderate jolt (~10–18 m/s² of delta); a deliberate shake
 * is a rapid back-and-forth — repeated LARGE deltas at 3–5 Hz. So:
 * one jolt = a vector delta over SHAKE_JOLT_DELTA; a shake = two
 * jolts inside SHAKE_WINDOW_MS; then SHAKE_DEBOUNCE_MS of quiet
 * before another can fire (a shake is an event, not a siren).
 */
const SHAKE_JOLT_DELTA = 30;
const SHAKE_WINDOW_MS = 650;
const SHAKE_DEBOUNCE_MS = 1500;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type PermissionCtor = {
  requestPermission?: () => Promise<string>;
};

function orientationCtor(): PermissionCtor | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { DeviceOrientationEvent?: unknown })
    .DeviceOrientationEvent;
  return typeof c === "function" ? (c as PermissionCtor) : null;
}

function motionCtor(): PermissionCtor | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { DeviceMotionEvent?: unknown })
    .DeviceMotionEvent;
  return typeof c === "function" ? (c as PermissionCtor) : null;
}

export function useDeviceMotion(opts: {
  engineRef: RefObject<LegacyFluidEngine | null>;
  /** The layer's "Motion" setting (absent = OFF — see law 2). */
  enabled: boolean;
  /** LegacyFluid's room activity clock: tilt and shake are real
   *  activity, so ambient life yields to them like it yields to
   *  touch (feeding the clock is all this hook does about it). */
  onActivity: () => void;
  /** A confirmed shake gesture. LegacyFluid sends + renders it. */
  onShake: () => void;
}): RefObject<MotionStats> {
  const { engineRef, enabled, onActivity, onShake } = opts;
  const statsRef = useRef<MotionStats>({
    state: "off",
    tiltX: 0,
    tiltY: 0,
    shakes: 0,
    lastShakeAt: null,
  });
  const [granted, setGranted] = useState(false);
  const callbacksRef = useRef({ onActivity, onShake });
  callbacksRef.current = { onActivity, onShake };

  // The gesture-gated permission request. Registered whenever the
  // canvas is mounted so the menu's "Enable tilt" button can reach
  // it; the call chain from onPress to requestPermission() is
  // direct (no timers), which is what iOS requires. Both event
  // families carry their own request on iOS — ask for each.
  useEffect(() => {
    const request = async (): Promise<boolean> => {
      let ok = true;
      for (const ctor of [orientationCtor(), motionCtor()]) {
        if (ctor && typeof ctor.requestPermission === "function") {
          try {
            const res = await ctor.requestPermission();
            if (res !== "granted") ok = false;
          } catch {
            ok = false;
          }
        }
      }
      if (ok) {
        setGranted(true);
        setMotionPublicState({ permission: "granted" });
      } else {
        setMotionPublicState({ permission: "denied" });
      }
      return ok;
    };
    registerMotionRequestHandler(request);
    return () => registerMotionRequestHandler(null);
  }, []);

  useEffect(() => {
    const stats = statsRef.current;
    if (!enabled) {
      stats.state = "off";
      return;
    }
    const orient = orientationCtor();
    const motion = motionCtor();
    if (!orient && !motion) {
      stats.state = "unavailable";
      const p: MotionPermission = "unavailable";
      setMotionPublicState({ permission: p });
      return;
    }
    const needsRequest =
      (orient && typeof orient.requestPermission === "function") ||
      (motion && typeof motion.requestPermission === "function");
    if (needsRequest && !granted) {
      stats.state = "needs-permission";
      setMotionPublicState({ permission: "needs-request" });
      return;
    }
    setMotionPublicState({
      permission: needsRequest ? "granted" : "not-required",
    });
    stats.state = "on";

    // --- live sensing ------------------------------------------------
    // Raw samples land in refs only. Nothing below this line ever
    // leaves the device (law 1): the refs feed a smoothed vector, a
    // splat, a shake decision — and are gone.
    const raw = { beta: NEUTRAL_BETA_DEG, gamma: 0, seen: false };
    const tilt = { x: 0, y: 0 };
    let lastAccel: { x: number; y: number; z: number } | null = null;
    let jolts: number[] = [];

    const onOrientation = (ev: DeviceOrientationEvent) => {
      if (typeof ev.beta !== "number" || typeof ev.gamma !== "number") {
        return;
      }
      raw.beta = ev.beta;
      raw.gamma = ev.gamma;
      raw.seen = true;
    };

    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a || typeof a.x !== "number" || typeof a.y !== "number" || typeof a.z !== "number") {
        return;
      }
      if (lastAccel) {
        const dx = a.x - lastAccel.x;
        const dy = a.y - lastAccel.y;
        const dz = a.z - lastAccel.z;
        const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (delta > SHAKE_JOLT_DELTA) {
          const now = Date.now();
          jolts = jolts.filter((t) => now - t < SHAKE_WINDOW_MS);
          jolts.push(now);
          const last = stats.lastShakeAt ?? 0;
          if (jolts.length >= 2 && now - last > SHAKE_DEBOUNCE_MS) {
            jolts = [];
            stats.shakes += 1;
            stats.lastShakeAt = now;
            callbacksRef.current.onActivity();
            callbacksRef.current.onShake();
          }
        }
      }
      lastAccel = { x: a.x, y: a.y, z: a.z };
    };

    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);

    let raf = 0;
    let lastSplatAt = 0;
    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      // Idle contract: a hidden tab applies nothing and schedules
      // nothing beyond this frame check — sensors rest when the
      // surface does.
      if (typeof document !== "undefined" && document.hidden) return;
      if (!raw.seen) return;
      // Lying flat on a desk (beta ≈ 0, gamma ≈ 0) is a resting
      // phone, not a command to pour the pool uphill: read it as
      // neutral. Without this, every table would tilt the world.
      const flat = Math.abs(raw.gamma) < 10 && raw.beta < 15;
      const targetX = flat ? 0 : clamp(raw.gamma / TILT_RANGE_DEG, -1, 1);
      const targetY = flat
        ? 0
        : clamp((raw.beta - NEUTRAL_BETA_DEG) / TILT_RANGE_DEG, -1, 1);
      tilt.x += (targetX - tilt.x) * 0.1;
      tilt.y += (targetY - tilt.y) * 0.1;
      stats.tiltX = tilt.x;
      stats.tiltY = tilt.y;
      if (
        Math.abs(tilt.x) < TILT_DEAD_ZONE &&
        Math.abs(tilt.y) < TILT_DEAD_ZONE
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastSplatAt < TILT_SPLAT_MS) return;
      lastSplatAt = now;
      const engine = engineRef.current;
      if (!engine) return;
      const hue = getIdentitySnapshot().self?.hue ?? 205;
      // Push from the high side toward the low side: the splat
      // sits up-slope of center and drives dye down-slope, so the
      // pool reads as leaning WITH the device. Force lives in the
      // same space as every other splatAt caller (touch, ambient).
      engine.splatAt(
        0.5 - tilt.x * 0.16,
        0.5 - tilt.y * 0.16,
        tilt.x * TILT_FORCE,
        tilt.y * TILT_FORCE,
        hueDyeColor(hue, 0.6)
      );
      callbacksRef.current.onActivity();
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("devicemotion", onMotion);
      window.cancelAnimationFrame(raf);
      stats.tiltX = 0;
      stats.tiltY = 0;
    };
  }, [enabled, granted, engineRef]);

  return statsRef;
}
