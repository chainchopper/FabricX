/**
 * listeningNotice — Slice 67: the one-time "your ghostie is
 * listening" orientation notice.
 *
 * Terrell (Nov 4, 2026, ~4:31 PM ET): "There is still a mic
 * menu as if we hadn't already basically gotten rid of that
 * clutter and put it in settings with a toast reminder."
 *
 * Voice's home is Settings (the Voice input row, Slices
 * 58/65) — but a person who has never opened Settings meets
 * Natural mode (the default) with no surface at all: the
 * ghostie just starts hearing its name. Exactly ONE
 * orientation moment is owed, and it rides the same
 * discipline as the haptics-off toast (Slice 61): a momentary
 * toast through the ONE toast slot, in product language,
 * that never nags.
 *
 * Scope: ONCE PER INSTALL — deliberately not per session.
 * The haptics toast re-arms per session because it answers a
 * live suppressed action; this notice is orientation, and
 * orientation taught once is taught. The flag is persisted
 * the moment the notice fires (before the toast is even
 * rendered): a crash or a missed glance can never turn it
 * into a repeat. Remounts and fabric switches within the
 * session are silent for the same reason — the in-memory
 * state flips at fire time, ahead of the storage write.
 *
 * The trigger is honesty-gated by the caller: ComposeBar
 * raises this ONLY when the natural listener is genuinely
 * live (the wake loop's mic is hot). Blocked (gesture rule)
 * and unsupported (no recognizer) never raise it — the toast
 * never claims listening that isn't happening.
 *
 * Pure module + a storage read/write of its OWN record, in
 * the voiceMode/vibration pattern, so the headless check can
 * drive it directly. It knows nothing about toasts; the
 * bridge (ListeningToastBridge) turns a firing into one.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";

/** This notice's own persisted record — nobody else's key. */
export const LISTENING_NOTICE_KEY = "fabric_listening_notice_v1";

/**
 * unknown — the persisted flag hasn't been read yet;
 * armed   — not yet shown on this install;
 * fired   — shown (this session's firing is in flight/done);
 * settled — already shown on a previous launch; silent.
 */
export type ListeningNoticeState = "unknown" | "armed" | "fired" | "settled";

let state: ListeningNoticeState = "unknown";
let loadStarted = false;
/** A genuine arm arrived before the flag read resolved. */
let pendingArm = false;
const listeners = new Set<() => void>();

function fire(): void {
  state = "fired";
  // Persist FIRST (see header): the orientation counts as
  // delivered from this moment, whatever happens to the toast.
  void setJSON(LISTENING_NOTICE_KEY, { shown: true }).catch(() => {
    // Storage refused the write: the in-memory state still
    // holds for this session, and a later launch may ask
    // once more — the honest failure direction is a possible
    // repeat, never a stuck nag loop.
  });
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener must never break an input surface.
    }
  });
}

/**
 * One-time lazy read of the persisted flag. ComposeBar calls
 * this on mount; the note path calls it too, so an early arm
 * is never lost to a slow read.
 */
export function ensureListeningNotice(): void {
  if (loadStarted) return;
  loadStarted = true;
  void (async () => {
    try {
      const saved = await getJSON<{ shown?: unknown } | null>(
        LISTENING_NOTICE_KEY,
        null
      );
      if (state !== "unknown") return; // a test reset raced us
      state = saved && saved.shown === true ? "settled" : "armed";
    } catch {
      // Storage unavailable: treat as never shown — the
      // in-memory state still guarantees once per session.
      if (state === "unknown") state = "armed";
    }
    if (state === "armed" && pendingArm) {
      pendingArm = false;
      fire();
    }
  })();
}

/**
 * The natural listener just went genuinely live (the caller
 * gates this on the wake loop's hot mic). Fires the notice
 * the first time EVER on this install; every later call —
 * this session or any future one — is a no-op.
 */
export function noteNaturalListeningArmed(): void {
  ensureListeningNotice();
  if (state === "armed") {
    fire();
  } else if (state === "unknown") {
    pendingArm = true;
  }
  // "fired" / "settled": the orientation already happened.
}

/** The toast bridge subscribes; returns the unsubscribe. */
export function subscribeListeningNotice(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Synchronous read for the check and honest state reporting. */
export function listeningNoticeState(): ListeningNoticeState {
  return state;
}

/** Test-only reset (module state; storage is the check's own shim). */
export function resetListeningNoticeForTests(): void {
  state = "unknown";
  loadStarted = false;
  pendingArm = false;
  listeners.clear();
}
