/**
 * HapticsToastBridge — Slice 61: the wire between the ONE
 * vibration gate and the ONE toast slot.
 *
 * Terrell (Nov 3, ~10:52 PM): "if the ghostie tries to use
 * haptics and it's toggled off in settings a toast should come
 * momentarily to allow me to enable it."
 *
 * The gate (src/sensory/vibration) is a pure module: when the
 * settings switch suppresses a felt touch — and the device
 * could actually have vibrated — it raises its once-a-session
 * suppression notice. This bridge (mounted once in _layout,
 * inside both the toast and preferences providers) turns that
 * notice into the toast:
 *
 * - The copy is product language, no settings jargon.
 * - **Enable** flips the ONE preference through the same
 *   setter the Settings rows use (PreferencesContext's
 *   setHapticsEnabled) — one store, so the Settings switch
 *   reflects the flip the moment it happens, and the context's
 *   mirror re-opens the gate. The suppressed pulse is NOT
 *   replayed: its moment passed; the next touch will land.
 * - However the toast leaves — Enable pressed or its turn
 *   simply running out — the notice settles, and the gate
 *   stays silent for the rest of the session. A fresh session
 *   may ask again; this one won't nag.
 *
 * The gate doesn't know who asked for the vibration — a
 * ghostie's reach, a remote touch, your own tap are the same
 * suppression — so neither does this toast.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef } from "react";
import { useToast } from "../Toast";
import { usePreferences } from "../../context/PreferencesContext";
import {
  settleHapticSuppressionNotice,
  subscribeHapticSuppression,
} from "../../../src/sensory/vibration";

/** The toast's words (pinned by scripts/haptics-toast-check.mjs). */
export const HAPTICS_OFF_MESSAGE =
  "Your ghostie tried to get your attention — haptics are off.";

/** The toast's action (pinned by scripts/haptics-toast-check.mjs). */
export const HAPTICS_ENABLE_LABEL = "Enable";

/**
 * Longer than the standard toast turn: an actionable toast
 * must live long enough to be read and tapped.
 */
export const HAPTICS_TOAST_DISPLAY_MS = 6000;

export function HapticsToastBridge() {
  const { show } = useToast();
  const prefs = usePreferences();
  // The subscription is installed once; the press handler
  // reads the latest preferences through the ref so the
  // effect never re-subscribes on a prefs identity change.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(
    () =>
      subscribeHapticSuppression(() => {
        show(HAPTICS_OFF_MESSAGE, {
          displayMs: HAPTICS_TOAST_DISPLAY_MS,
          action: {
            label: HAPTICS_ENABLE_LABEL,
            onPress: () => {
              // The same setter Settings uses — one store.
              // The suppressed pulse is NOT replayed (see
              // header): the moment passed.
              prefsRef.current.setHapticsEnabled(true);
            },
          },
          onSettle: (how) =>
            settleHapticSuppressionNotice(
              how === "action" ? "enabled" : "dismissed"
            ),
        });
      }),
    [show]
  );

  return null;
}
