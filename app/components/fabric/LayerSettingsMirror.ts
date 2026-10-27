/**
 * LayerSettingsMirror — per-layer settings storage (F doctrine).
 *
 * Doctrine rule 4: settings have two scopes and they are never conflated.
 * Universal settings live in their own stores (fabric_prefs_v1,
 * fabric_ai_config_v1, fabric_ghost_v1). A LAYER's settings live under a
 * key namespaced by that layer's own id:
 *
 *   fabric_layer_settings_v1:<layerId>   ->  ExperienceConfig
 *
 * There is deliberately NO registry of layer ids here: any id the
 * ExperienceContext can activate — stock, community, plugin, a million
 * of them — gets its own slot the first time it runs, and its settings
 * are restored when it is activated again. The ExperienceContext's
 * global fabric_experience_state_v1 snapshot remains the "last session"
 * record; this mirror is the per-layer source the menu reads/writes.
 *
 * The component renders nothing. It:
 *  1. on layer activation, loads that layer's stored config (if any)
 *     and applies it through updateConfig;
 *  2. after that load settles, writes config changes back under the
 *     active layer's key — and only that layer's key.
 * Write-after-load ordering matters: activation first resets the config
 * to the layer's defaults, and those defaults must never clobber the
 * stored settings before they are read.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef } from "react";
import { useExperience } from "../../context/ExperienceContext";
import { getJSON, setJSON } from "../../utils/storage";
import type { ExperienceConfig } from "../../../src/types/experience";

export const LAYER_SETTINGS_PREFIX = "fabric_layer_settings_v1:";

export function layerSettingsKey(layerId: string): string {
  return `${LAYER_SETTINGS_PREFIX}${layerId}`;
}

export default function LayerSettingsMirror() {
  const { state, updateConfig } = useExperience();
  const activeId = state.activeExperience?.id ?? null;
  const configRef = useRef(state.experienceConfig);
  configRef.current = state.experienceConfig;
  /** Layer whose stored settings have finished loading. */
  const loadedForRef = useRef<string | null>(null);
  const updateRef = useRef(updateConfig);
  updateRef.current = updateConfig;

  // 1) Load the newly active layer's stored settings.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    loadedForRef.current = null;
    getJSON<ExperienceConfig | null>(layerSettingsKey(activeId), null)
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          // Apply only this layer's own sections; updateConfig merges
          // common/specific shallowly, which is the established semantic.
          updateRef.current(saved);
        }
        loadedForRef.current = activeId;
      })
      .catch(() => {
        if (!cancelled) loadedForRef.current = activeId;
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // 2) Persist changes under the ACTIVE layer's key only, and only
  // after that layer's stored settings have been read.
  useEffect(() => {
    if (!activeId) return;
    if (loadedForRef.current !== activeId) return;
    void setJSON(layerSettingsKey(activeId), state.experienceConfig);
  }, [activeId, state.experienceConfig]);

  return null;
}
