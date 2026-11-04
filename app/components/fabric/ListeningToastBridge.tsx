/**
 * ListeningToastBridge — Slice 67: the wire between the
 * listening notice and the ONE toast slot.
 *
 * Terrell (Nov 4, 2026, ~4:31 PM ET): voice was supposed to
 * live "in settings with a toast reminder" — not as a mic
 * menu squatting on the canvas. Slice 67 removes the canvas
 * bar in Natural (the default); this toast is the reminder
 * half of that sentence.
 *
 * The notice (src/sensory/listeningNotice) is a pure module:
 * it fires exactly once per install, the first time the
 * natural listener is genuinely live. This bridge (mounted
 * once in _layout, beside the haptics bridge, inside the
 * toast provider) turns a firing into the toast:
 *
 * - The copy is product language and names the ghostie —
 *   the name IS the wake phrase, so the reminder teaches
 *   the one thing a new person needs: say its name, then
 *   just talk. It also says where voice lives now:
 *   Settings.
 * - No action, no buttons: there is nothing to decide. It
 *   holds a little longer than a plain status toast so it
 *   can actually be read, then it leaves.
 * - It rides the same one-slot queue as every toast
 *   (Slice 44 discipline, via useToast): if the haptics
 *   toast or any other holds the slot, this one waits its
 *   turn in the same FIFO — they never stack, never collide.
 *
 * Powered by Nirvana
 */

import React, { useEffect } from "react";
import { useToast } from "../Toast";
import { getGhostPublicState } from "../../../src/ghost/ghostStore";
import { subscribeListeningNotice } from "../../../src/sensory/listeningNotice";

/** The toast's words, given who's listening (pinned by scripts/mic-clutter-check.mjs). */
export function listeningToastMessage(ghostName: string | null): string {
  const who = ghostName ?? "Your ghostie";
  return `${who} is listening for its name — say it, then just talk. Voice is set in Settings.`;
}

/** Long enough to read; it has no action to hunt for. */
export const LISTENING_TOAST_DISPLAY_MS = 5000;

export function ListeningToastBridge() {
  const { show } = useToast();

  useEffect(
    () =>
      subscribeListeningNotice(() => {
        let name: string | null = null;
        try {
          name = getGhostPublicState().ghostName;
        } catch {
          // No store yet: the generic wording still teaches it.
        }
        show(listeningToastMessage(name), {
          displayMs: LISTENING_TOAST_DISPLAY_MS,
        });
      }),
    [show]
  );

  return null;
}
