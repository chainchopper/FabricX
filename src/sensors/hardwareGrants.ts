/**
 * Hardware grants — Slice 50: the app remembers what the device
 * already said yes to.
 *
 * Terrell (Nov 3): "device granted access to hardware should
 * persist where applicable." Before this module, nothing in the
 * app remembered a grant: every surface re-derived permission
 * from scratch, and the motion flow in particular re-asked on
 * every fresh session because useDeviceMotion started from
 * "unknown" each mount. Now there is one memory:
 *
 * - fabric_hw_grants_v1 records the last known outcome per kind
 *   (camera / microphone / motion): "granted" or "denied",
 *   written at the moment a real request resolves (a getUserMedia
 *   success or denial, an iOS motion request's answer).
 * - hardwareGrantState(kind) answers with the LIVE truth where
 *   the platform offers one — navigator.permissions.query for
 *   camera/microphone (Chromium) — and falls back to the stored
 *   record everywhere else. A "prompt" answer from the live API
 *   means undecided, which falls through to the record, then to
 *   "unknown".
 * - Callers consult the memory BEFORE asking: a standing grant
 *   means no in-app re-prompt (motion goes straight to
 *   listening; camera/mic flows skip their ask state).
 *
 * HONEST LIMITS, by platform construction:
 * - Safari (macOS + iOS) does not expose camera/microphone to
 *   navigator.permissions.query — the query throws and the
 *   stored record is the only memory. The browser's own
 *   per-site grant still applies underneath: getUserMedia on an
 *   already-granted site resolves without a prompt either way.
 * - Motion has no Permissions API name at all. iOS Safari keeps
 *   its own per-site answer for DeviceOrientation/Motion events;
 *   where an iOS version forgets per session, the OS prompt is
 *   the platform's, not ours to suppress — the memory still
 *   spares the in-app ask state, and the Enable tilt button
 *   remains the gesture that re-asks.
 * - A remembered "denied" is a memory, not a lock: surfaces may
 *   still offer their enable affordance (the user can have
 *   changed the browser's site settings since).
 *
 * This module stores grant STATE only — never a sensor reading,
 * a frame, or a sound (the motionState privacy law, applied to
 * all three kinds).
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";

export const HW_GRANTS_KEY = "fabric_hw_grants_v1";

export type HardwareKind = "camera" | "microphone" | "motion";
export type HardwareGrantState = "granted" | "denied" | "unknown";

type GrantRecord = Partial<Record<HardwareKind, "granted" | "denied">>;

let record: GrantRecord = {};
let loadPromise: Promise<void> | null = null;
const listeners = new Set<(r: GrantRecord) => void>();

function publish(): void {
  const snap = { ...record };
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      // A listener must never break a permission flow.
    }
  });
}

/** Load the stored record once (idempotent). */
export function ensureHardwareGrants(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const saved = await getJSON<GrantRecord | null>(HW_GRANTS_KEY, null);
      if (saved && typeof saved === "object") {
        const next: GrantRecord = {};
        (Object.keys(saved) as HardwareKind[]).forEach((k) => {
          if (saved[k] === "granted" || saved[k] === "denied") {
            next[k] = saved[k];
          }
        });
        record = next;
        publish();
      }
    } catch {
      // Storage unavailable: the memory is empty for this session.
    }
  })();
  return loadPromise;
}

/**
 * Record the outcome of a real request the moment it resolves.
 * Called by the getUserMedia seams (camera/microphone) and the
 * iOS motion request handler — never speculatively.
 */
export function rememberHardwareGrant(
  kind: HardwareKind,
  state: "granted" | "denied"
): void {
  void ensureHardwareGrants();
  if (record[kind] === state) return;
  record = { ...record, [kind]: state };
  publish();
  void (async () => {
    try {
      await setJSON(HW_GRANTS_KEY, record);
    } catch {
      // Best-effort: the in-memory record still holds this session.
    }
  })();
}

/** The stored answer, synchronously (kicks the one-time load). */
export function knownHardwareGrant(kind: HardwareKind): HardwareGrantState {
  void ensureHardwareGrants();
  return record[kind] ?? "unknown";
}

export function subscribeHardwareGrants(
  fn: (r: GrantRecord) => void
): () => void {
  listeners.add(fn);
  void ensureHardwareGrants();
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The live Permissions API answer for camera/microphone, where
 * the platform exposes one. Null when the API is absent, the
 * name is unknown to it (Safari), or the state is "prompt"
 * (undecided is not a grant and not a denial).
 */
async function queryLivePermission(
  kind: "camera" | "microphone"
): Promise<HardwareGrantState | null> {
  try {
    const nav = (globalThis as { navigator?: unknown }).navigator as
      | { permissions?: { query?: unknown } }
      | undefined;
    const query = nav?.permissions?.query;
    if (typeof query !== "function") return null;
    const status = (await (
      query as (d: { name: string }) => Promise<{ state?: string }>
    ).call(nav!.permissions, { name: kind })) as { state?: string };
    if (status?.state === "granted") return "granted";
    if (status?.state === "denied") return "denied";
    return null;
  } catch {
    return null;
  }
}

/**
 * The best current answer for a kind: the platform's live truth
 * where it exists (camera/microphone via permissions.query),
 * otherwise the stored record, otherwise "unknown". Motion is
 * record-only — the Permissions API has no name for it.
 */
export async function hardwareGrantState(
  kind: HardwareKind
): Promise<HardwareGrantState> {
  await ensureHardwareGrants();
  if (kind === "camera" || kind === "microphone") {
    const live = await queryLivePermission(kind);
    if (live !== null) return live;
  }
  return knownHardwareGrant(kind);
}

/**
 * The window-event intake. Some reporters cannot import this
 * module — voiceCapture's zero-import graph is load-bearing
 * (its headless check bundles it bare) — so outcomes may also
 * arrive as a "fabric:hw-grant" CustomEvent with detail
 * { kind, state }, the app's standing VerbBar pattern. Any
 * module importing this one registers the listener for the
 * room (the canvas's motion hook always does). Malformed
 * details are ignored field-by-field, like any wire input.
 */
export const HW_GRANT_EVENT = "fabric:hw-grant";

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener(HW_GRANT_EVENT, (ev: Event) => {
    const detail = (ev as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object") return;
    const { kind, state } = detail as Record<string, unknown>;
    if (
      (kind === "camera" || kind === "microphone" || kind === "motion") &&
      (state === "granted" || state === "denied")
    ) {
      rememberHardwareGrant(kind, state);
    }
  });
}

/** Test-only reset (not storage). */
export function resetHardwareGrantsForTests(): void {
  record = {};
  loadPromise = null;
  listeners.clear();
}
