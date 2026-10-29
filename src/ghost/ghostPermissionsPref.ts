/**
 * Ghostie card permissions — storage + live snapshot (Slice 22).
 *
 * The persisted half of ghostPermissions.ts, in the exact pattern
 * ghostSharedPref.ts established: the record lives under
 * fabric_ghost_permissions_v1 (this device only), and a
 * module-level snapshot + pub/sub keeps every reader — the Ghostie
 * Home's switches, the profile store's announce inputs — reading
 * the same current value.
 *
 * The snapshot starts at the defaults (all OFF: an unpublished
 * ghostie) and is corrected by the async storage load the moment
 * this module is first used; a stored record replaces it
 * wholesale through the sanitizer.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import { getJSON, setJSON } from "../../app/utils/storage";
import {
  DEFAULT_GHOST_PERMISSIONS,
  sanitizeGhostPermissions,
  type GhostPermissions,
} from "./ghostPermissions";

export const GHOST_PERMISSIONS_KEY = "fabric_ghost_permissions_v1";

let snapshot: GhostPermissions = { ...DEFAULT_GHOST_PERMISSIONS };
let loadStarted = false;
const listeners = new Set<(s: GhostPermissions) => void>();

function publish(next: GhostPermissions): void {
  snapshot = next;
  listeners.forEach((l) => l({ ...snapshot }));
}

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  getJSON<unknown>(GHOST_PERMISSIONS_KEY, null)
    .then((raw) => {
      if (raw !== null && raw !== undefined) {
        publish(sanitizeGhostPermissions(raw));
      }
    })
    .catch(() => {
      // Storage hiccup: defaults stand. Best-effort by design.
    });
}

/** The current permissions, synchronously (defaults until load). */
export function getGhostPermissionsSnapshot(): GhostPermissions {
  ensureLoaded();
  return { ...snapshot };
}

/** Persist a full permissions object and publish it to readers. */
export function setGhostPermissions(next: GhostPermissions): void {
  const clean = sanitizeGhostPermissions(next);
  publish(clean);
  void setJSON(GHOST_PERMISSIONS_KEY, clean).catch(() => undefined);
}

/** Patch one switch: read the snapshot, flip the key, persist. */
export function updateGhostPermissions(
  patch: Partial<GhostPermissions>
): void {
  setGhostPermissions({ ...getGhostPermissionsSnapshot(), ...patch });
}

export function subscribeGhostPermissions(
  fn: (s: GhostPermissions) => void
): () => void {
  ensureLoaded();
  listeners.add(fn);
  fn({ ...snapshot });
  return () => {
    listeners.delete(fn);
  };
}

/** React reader: re-renders whenever a permission flips. */
export function useGhostPermissions(): GhostPermissions {
  const [permissions, setPermissions] = useState<GhostPermissions>(() =>
    getGhostPermissionsSnapshot()
  );
  useEffect(() => subscribeGhostPermissions(setPermissions), []);
  return permissions;
}
