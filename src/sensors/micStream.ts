/**
 * Mic stream — Slice 58: ONE owner for the microphone's
 * permission life, and the fix for why Slice 50's grant
 * persistence was not FELT on device.
 *
 * Terrell (Nov 3): "I also don't like that the mic isn't
 * automatically requested and that permission persisted."
 * The audit behind this module, against the tree as it stood:
 *
 * 1. NOTHING ASKED FIRST. The only mic asks in the app were
 *    buried behind the first tap on the compose mic button.
 *    The ask existed; you had to go looking for it.
 *    → ensureMicAccess() below is called on the FIRST entry
 *      into a voice-capable context (the HUD's compose bar
 *      mounting with the session), framed in product language
 *      by the caller. One ask, up front, ghostie-voiced.
 *
 * 2. THE MEMORY NEVER HEARD THE COMMON PATH. Slice 50's grant
 *    memory learned outcomes only from getUserMedia seams
 *    (voiceCapture's capture path, by window event). On
 *    Chrome/Android the compose bar rides SpeechRecognition —
 *    whose permission outcome was recorded NOWHERE. The
 *    memory sat at "unknown" for the microphone on the most
 *    common path in the app, so nothing could consult it and
 *    every session re-derived permission from scratch.
 *    → noteRecognitionOutcome() is now called by the voice
 *      surfaces when a recognition session first hears, and
 *      when it reports the mic refused: the recognizer's
 *      truth feeds the same memory.
 *
 * 3. EVERY SURFACE RE-ACQUIRED. Tap-to-talk starts a fresh
 *    recognizer (or a fresh getUserMedia stream) per tap, per
 *    surface; nothing owned the permission state across them.
 *    On a platform that scopes its grant per session, each
 *    re-acquisition is another chance to be asked again —
 *    which reads, correctly, as "it doesn't persist."
 *    → This module is the single owner of the permission
 *      question: grant state is consulted BEFORE any ask,
 *      concurrent asks share one in-flight probe, and the
 *      Permissions API is WATCHED (where it exists) so a
 *      grant changed in the browser's own settings is learned
 *      without any new ask at all.
 *
 * 4. A GESTURE-STARVED ASK IS NOT A DENIAL. On iOS Safari a
 *    getUserMedia call made before any user interaction can
 *    reject NotAllowedError without the user ever seeing a
 *    prompt. Recording that as "denied" poisons the memory
 *    with a refusal nobody made. The probe below checks
 *    navigator.userActivation where the platform offers it:
 *    a NotAllowedError with no activation on record is
 *    reported "unavailable" (ask again after the first
 *    touch — the auto-request hook does exactly that), and
 *    only an activated refusal is remembered as denied.
 *
 * HONEST LIMITS — what stays platform-owned, by construction:
 * - The browser/OS owns the grant itself. Chrome keeps a
 *   per-site answer (and says so via the Permissions API);
 *   iOS Safari's per-site memory is the OS's business and
 *   some contexts re-ask per session no matter what the app
 *   remembers. This module guarantees the APP never adds a
 *   second ask on top of the platform's, and never re-asks
 *   in-app once an outcome is known — it cannot and does not
 *   claim to override the browser.
 * - A remembered "denied" is a memory, not a lock: the
 *   automatic ask will not nag, but surfaces keep their own
 *   enable affordances (the mic button asks again when its
 *   person taps it — the platform decides what happens then).
 * - The permission probe asks for the mic and lets go the
 *   moment the answer lands: tracks are stopped immediately.
 *   Asking to hear is not listening; nothing is captured,
 *   recorded, or kept by a probe.
 *
 * Powered by Nirvana
 */

import {
  ensureHardwareGrants,
  hardwareGrantState,
  rememberHardwareGrant,
} from "./hardwareGrants";

export type MicAccessOutcome =
  /** The mic may be used; the platform has said yes (or remembers it). */
  | "granted"
  /** The person (not the platform's gesture rule) refused. */
  | "denied"
  /** No mic could be reached right now (none found, or the ask
   *  landed before any user interaction and must be retried). */
  | "unavailable"
  /** This browser cannot ask for a microphone at all. */
  | "unsupported";

let probeInFlight: Promise<MicAccessOutcome> | null = null;
let watchStarted = false;

function nav(): {
  mediaDevices?: { getUserMedia?: unknown };
  permissions?: { query?: unknown };
  userActivation?: { hasBeenActive?: boolean };
} | null {
  const n = (globalThis as { navigator?: unknown }).navigator;
  return n && typeof n === "object"
    ? (n as {
        mediaDevices?: { getUserMedia?: unknown };
        permissions?: { query?: unknown };
        userActivation?: { hasBeenActive?: boolean };
      })
    : null;
}

function stopStream(stream: unknown): void {
  try {
    const tracks =
      (stream as { getTracks?: () => unknown[] } | null)?.getTracks?.() ?? [];
    for (const t of tracks) {
      try {
        (t as { stop?: () => void })?.stop?.();
      } catch {
        // One bad track must not strand the others.
      }
    }
  } catch {
    // Nothing to stop.
  }
}

/**
 * Watch the Permissions API for microphone changes (Chromium):
 * a grant flipped in the browser's site settings is mirrored
 * into the app's memory the moment it changes, so the app's
 * picture of the world never waits for a fresh ask. Idempotent;
 * a no-op where the API or the "microphone" name is absent
 * (Safari) — the stored record rules there, as Slice 50 built.
 */
export function watchMicPermission(): void {
  if (watchStarted) return;
  watchStarted = true;
  void (async () => {
    try {
      const query = nav()?.permissions?.query;
      if (typeof query !== "function") return;
      const status = (await (
        query as (d: { name: string }) => Promise<{
          state?: string;
          onchange?: (() => void) | null;
        }>
      ).call(nav()!.permissions, { name: "microphone" })) as {
        state?: string;
        onchange?: (() => void) | null;
      };
      const sync = () => {
        if (status.state === "granted") {
          rememberHardwareGrant("microphone", "granted");
        } else if (status.state === "denied") {
          rememberHardwareGrant("microphone", "denied");
        }
      };
      sync();
      status.onchange = sync;
    } catch {
      // No live truth on this platform: the record stands.
    }
  })();
}

/**
 * A recognition session's outcome, reported by the voice
 * surfaces: the recognizer heard (the platform let it — that
 * IS the grant, on the path where no getUserMedia ever runs),
 * or it reported the mic refused. This is how the common
 * path feeds the grant memory it used to bypass.
 */
export function noteRecognitionOutcome(
  outcome: "granted" | "denied"
): void {
  rememberHardwareGrant("microphone", outcome);
}

/**
 * The one proactive ask — called on first entry into a
 * voice-capable context, and retried once after the first
 * user interaction when the first attempt landed before any
 * activation existed.
 *
 * Consults the memory FIRST: a known grant resolves without
 * touching getUserMedia (no prompt, no stream, nothing hot);
 * a known refusal resolves "denied" without nagging (the
 * automatic ask never re-asks; surfaces keep manual doors).
 * Only an unknown state probes — once, shared by every
 * concurrent caller — and the probe's stream is released the
 * moment the answer lands.
 */
export async function ensureMicAccess(): Promise<MicAccessOutcome> {
  await ensureHardwareGrants();
  watchMicPermission();
  const known = await hardwareGrantState("microphone");
  if (known === "granted") return "granted";
  if (known === "denied") return "denied";
  if (probeInFlight) return probeInFlight;
  probeInFlight = (async (): Promise<MicAccessOutcome> => {
    const getUserMedia = nav()?.mediaDevices?.getUserMedia;
    if (typeof getUserMedia !== "function") return "unsupported";
    try {
      const stream = await (
        getUserMedia as (c: unknown) => Promise<unknown>
      ).call(nav()!.mediaDevices, { audio: true });
      // The answer was yes. Remember it, then LET GO — a
      // permission probe is not a listening session.
      rememberHardwareGrant("microphone", "granted");
      stopStream(stream);
      return "granted";
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        // Gesture-starved asks (iOS Safari before any touch)
        // reject with this same name while no prompt was ever
        // shown. Where the platform reports activation, a
        // refusal with none on record is not a refusal.
        const activation = nav()?.userActivation;
        if (activation && activation.hasBeenActive === false) {
          return "unavailable";
        }
        rememberHardwareGrant("microphone", "denied");
        return "denied";
      }
      // No device, an over-constrained ask, or a platform
      // hiccup: not a refusal, and nothing is remembered.
      return "unavailable";
    }
  })();
  try {
    return await probeInFlight;
  } finally {
    probeInFlight = null;
  }
}

/** Test-only reset (not storage). */
export function resetMicStreamForTests(): void {
  probeInFlight = null;
  watchStarted = false;
}
