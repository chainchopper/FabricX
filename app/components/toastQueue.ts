/**
 * toastQueue — Slice 44: the pure queue discipline behind the
 * one toast slot.
 *
 * The old ToastProvider kept an array and a single shared
 * timer: every show() reset the timer for the WHOLE queue, the
 * first toast could sit up indefinitely under a stream of
 * events, and when it finally left, the next toast inherited an
 * opacity of 0 with no timer of its own — toasts overlapped,
 * stuck, or never appeared. Terrell's rule (Nov 2, 2026):
 * toasts take ONE slot, and a new toast waits its turn — they
 * never stack on each other or on other UI.
 *
 * The discipline, as pure functions (the provider only adds
 * Animated transitions and timers):
 * - At most ONE visible toast; the rest wait in FIFO order.
 * - Waiting is capped (TOAST_MAX_WAITING). Past the cap the
 *   OLDEST WAITING toast is dropped — the visible one is never
 *   preempted, and the newest information is never the thing
 *   thrown away.
 * - Re-showing the message that is already visible is a
 *   no-op here; the provider treats it as a timer refresh, so
 *   a repeating status ("Peers disconnected" flapping) holds
 *   its one slot instead of queueing copies of itself.
 *
 * No imports — this module is bundled and driven directly by
 * scripts/chrome-check.mjs.
 */

export type ToastItem = { id: number; message: string };

export type ToastQueueState = {
  visible: ToastItem | null;
  waiting: ToastItem[];
};

/** How long one toast holds the slot before the next is served. */
export const TOAST_DISPLAY_MS = 2600;

/** Waiting-room cap; see the drop rule in the header. */
export const TOAST_MAX_WAITING = 3;

export function createToastQueue(): ToastQueueState {
  return { visible: null, waiting: [] };
}

export function enqueueToast(
  state: ToastQueueState,
  item: ToastItem
): ToastQueueState {
  if (!state.visible) {
    return { visible: item, waiting: state.waiting };
  }
  if (state.visible.message === item.message) {
    // Already on screen: the provider refreshes its timer.
    return state;
  }
  if (state.waiting.some((t) => t.message === item.message)) {
    // Already in line: one copy is enough.
    return state;
  }
  const waiting = [...state.waiting, item];
  while (waiting.length > TOAST_MAX_WAITING) waiting.shift();
  return { visible: state.visible, waiting };
}

/** The visible toast's turn ended: serve the next in line. */
export function advanceToast(state: ToastQueueState): ToastQueueState {
  if (state.waiting.length === 0) {
    return { visible: null, waiting: [] };
  }
  const [next, ...rest] = state.waiting;
  return { visible: next, waiting: rest };
}
