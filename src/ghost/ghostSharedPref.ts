/**
 * Ghost shared settings — storage + live snapshot (Slice 20).
 *
 * The persisted half of ghostShared.ts: the record lives under
 * fabric_ghost_shared_v1 (this device only, like every ghost
 * preference), and a module-level snapshot + pub/sub in the
 * ghostStore pattern keeps every reader — the Ghostie Home's
 * toggles, useGhostPeer's gate feed, LegacyFluid's follow
 * resolution — reading the same current value without prop
 * drilling across the single persistent canvas.
 *
 * The snapshot starts at the defaults (all on: the ghost as it
 * has always behaved) and is corrected by the async storage load
 * the moment this module is first used; a stored record replaces
 * it wholesale through the sanitizer, so a legacy or garbled
 * record can never produce a half-valid settings object.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import { getJSON, setJSON } from "../../app/utils/storage";
import {
  DEFAULT_GHOST_SHARED_SETTINGS,
  sanitizeGhostSharedSettings,
  type GhostSharedSettings,
} from "./ghostShared";

export const GHOST_SHARED_KEY = "fabric_ghost_shared_v1";

let snapshot: GhostSharedSettings = { ...DEFAULT_GHOST_SHARED_SETTINGS };
let loadStarted = false;
const listeners = new Set<(s: GhostSharedSettings) => void>();

function publish(next: GhostSharedSettings): void {
  snapshot = next;
  listeners.forEach((l) => l({ ...snapshot }));
}

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  getJSON<unknown>(GHOST_SHARED_KEY, null)
    .then((raw) => {
      // Only a real stored record replaces the defaults; an absent
      // key leaves the snapshot exactly as the ghost has always run.
      if (raw !== null && raw !== undefined) {
        publish(sanitizeGhostSharedSettings(raw));
      }
    })
    .catch(() => {
      // Storage hiccup: defaults stand. Best-effort by design.
    });
}

/** The current settings, synchronously (defaults until the load lands). */
export function getGhostSharedSnapshot(): GhostSharedSettings {
  ensureLoaded();
  return { ...snapshot };
}

/** The current settings, awaited from storage. */
export async function getGhostSharedSettings(): Promise<GhostSharedSettings> {
  try {
    const raw = await getJSON<unknown>(GHOST_SHARED_KEY, null);
    if (raw === null || raw === undefined) {
      return { ...DEFAULT_GHOST_SHARED_SETTINGS };
    }
    return sanitizeGhostSharedSettings(raw);
  } catch {
    return { ...DEFAULT_GHOST_SHARED_SETTINGS };
  }
}

/** Persist a full settings object and publish it to every reader. */
export function setGhostSharedSettings(next: GhostSharedSettings): void {
  const clean = sanitizeGhostSharedSettings(next);
  publish(clean);
  void setJSON(GHOST_SHARED_KEY, clean).catch(() => undefined);
}

/** Patch one switch: read the snapshot, flip the key, persist. */
export function updateGhostSharedSettings(
  patch: Partial<GhostSharedSettings>
): void {
  setGhostSharedSettings({ ...getGhostSharedSnapshot(), ...patch });
}

export function subscribeGhostSharedSettings(
  fn: (s: GhostSharedSettings) => void
): () => void {
  ensureLoaded();
  listeners.add(fn);
  fn({ ...snapshot });
  return () => {
    listeners.delete(fn);
  };
}

/** React reader: re-renders whenever any ghost shared switch flips. */
export function useGhostSharedSettings(): GhostSharedSettings {
  const [settings, setSettings] = useState<GhostSharedSettings>(() =>
    getGhostSharedSnapshot()
  );
  useEffect(() => subscribeGhostSharedSettings(setSettings), []);
  return settings;
}
