/**
 * useAutoMicRequest — Slice 58: the mic asks FIRST.
 *
 * Terrell (Nov 3): "the mic isn't automatically requested."
 * Before this hook, the only microphone ask in the app sat
 * behind the first tap on the compose mic button. The compose
 * bar mounts with the session HUD on every voice-capable
 * fabric — so its mount IS the first entry into a
 * voice-capable context, and this hook fires the one
 * proactive ask there (micStream.ensureMicAccess, which
 * consults the grant memory before ever touching the
 * platform: a known answer means NO ask happens at all).
 *
 * The framing is product language, in the ghostie's voice:
 * while the platform's prompt is on its way, the bar says who
 * is asking and why ("{name} is asking to hear you…"). The
 * browser's own prompt is the platform's UI — the app adds no
 * second ask on top of it, ever: this hook runs once per
 * mount, its retry is armed only for the gesture-starved case
 * (the first attempt landed before any user interaction —
 * iOS Safari's rule — and even then it fires on the FIRST
 * touch anywhere, not on a hunt for the mic button).
 *
 * Outcomes the bar can show:
 * - granted (or already known): silence. Nothing to say.
 * - denied: one honest line, left standing. The automatic
 *   path never asks again; the mic button remains the
 *   person's own door to ask with.
 * - unsupported: silence — a browser that cannot ask is
 *   captioned by the voice paths themselves when used.
 *
 * Powered by Nirvana
 */

import { useEffect, useRef, useState } from "react";
import { hardwareGrantState } from "../../sensors/hardwareGrants";
import {
  ensureMicAccess,
  watchMicPermission,
  type MicAccessOutcome,
} from "../../sensors/micStream";

export interface AutoMicRequest {
  /** The in-world framing line, or null when there is none. */
  primer: string | null;
}

export function useAutoMicRequest(opts: {
  ghostName: string | null;
}): AutoMicRequest {
  const [primer, setPrimer] = useState<string | null>(null);
  const nameRef = useRef(opts.ghostName);
  nameRef.current = opts.ghostName;
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    let retryArmed = false;
    let onFirstTouch: (() => void) | null = null;

    const who = () => nameRef.current ?? "Your ghostie";
    const framing = () =>
      `${who()} is asking to hear you — your browser may show a microphone question.`;
    const deniedLine = () =>
      `The browser said no to the mic, so ${who()} can't hear you yet. The mic button can ask again.`;

    const applyOutcome = (outcome: MicAccessOutcome) => {
      if (cancelled) return;
      if (outcome === "granted" || outcome === "unsupported") {
        setPrimer(null);
      } else if (outcome === "denied") {
        setPrimer(deniedLine());
      }
      // "unavailable" outside the retry flow: leave whatever
      // framing is up; the voice paths caption their own use.
    };

    void (async () => {
      watchMicPermission();
      const known = await hardwareGrantState("microphone");
      if (cancelled || known !== "unknown") {
        // The memory already speaks for this device: no ask,
        // no framing, no prompt — persistence you can feel.
        return;
      }
      setPrimer(framing());
      const outcome = await ensureMicAccess();
      if (cancelled) return;
      if (outcome === "unavailable" && !retryArmed) {
        // The ask landed before any user interaction existed
        // (the gesture-starved platform case). Arm ONE retry
        // on the first touch anywhere on the page.
        retryArmed = true;
        setPrimer(`Tap anywhere once, and ${who()} will ask to hear you.`);
        onFirstTouch = () => {
          if (onFirstTouch) {
            window.removeEventListener("pointerdown", onFirstTouch);
            onFirstTouch = null;
          }
          void ensureMicAccess().then(applyOutcome);
        };
        window.addEventListener("pointerdown", onFirstTouch);
        return;
      }
      applyOutcome(outcome);
    })();

    return () => {
      cancelled = true;
      if (onFirstTouch) {
        window.removeEventListener("pointerdown", onFirstTouch);
        onFirstTouch = null;
      }
    };
    // Mount once: the ask is a door ritual, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { primer };
}
