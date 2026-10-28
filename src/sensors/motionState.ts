/**
 * Motion (Slice 12, "The Body's Sensors") public-state store.
 *
 * A tiny module-level pub/sub in the ghostStore pattern: the canvas
 * layer (LegacyFluid, via useDeviceMotion) publishes the sensor
 * permission state, and the F menu's THIS LAYER section reads it to
 * know whether it must offer the "Enable tilt" affordance. Controls
 * travel the other way through a registered handler: iOS requires
 * DeviceOrientationEvent.requestPermission() to be called from
 * inside a genuine user gesture, so the menu button's onPress calls
 * requestMotionPermission() here, which delegates to the handler
 * the sensor hook registered when it mounted. No handler (native
 * shell, SSR, canvas unmounted) → the request is a no-op and the
 * menu simply doesn't offer the button.
 *
 * PRIVACY: this store carries permission STATE only — never a
 * sensor reading. Raw motion data never leaves useDeviceMotion,
 * never enters a store, and never touches a transport.
 *
 * Powered by Nirvana
 */

export type MotionPermission =
  | "unknown" // hook hasn't reported yet
  | "not-required" // platform grants on listen (Android / desktop)
  | "needs-request" // iOS-style: a gesture-gated request is required
  | "granted"
  | "denied"
  | "unavailable"; // no orientation/motion sensors or APIs at all

export interface MotionPublicState {
  permission: MotionPermission;
}

type Listener = (state: MotionPublicState) => void;

let state: MotionPublicState = { permission: "unknown" };
const listeners = new Set<Listener>();
let requestHandler: (() => Promise<boolean>) | null = null;

export function getMotionPublicState(): MotionPublicState {
  return state;
}

export function setMotionPublicState(next: Partial<MotionPublicState>): void {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function subscribeMotionState(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Called by useDeviceMotion on mount; cleared on unmount. */
export function registerMotionRequestHandler(
  handler: (() => Promise<boolean>) | null
): void {
  requestHandler = handler;
}

/**
 * Ask for motion permission. MUST be called synchronously from a
 * user-gesture handler (the menu button's onPress) for the iOS
 * request to be honored — the delegation here is a direct call, no
 * timers or promises in between, so the gesture context survives.
 * Resolves true when sensors are (now) flowing.
 */
export function requestMotionPermission(): Promise<boolean> {
  if (!requestHandler) return Promise.resolve(false);
  return requestHandler();
}
