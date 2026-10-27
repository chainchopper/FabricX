/**
 * useGhostPeer — React lifecycle for the Fabric ghost (see GhostPeer.ts
 * for the brain itself).
 *
 * - Creates the GhostPeer once this user's persistent identity is known.
 *   Identity (generated friendly name + signature hue + temperament
 *   seed) and the manual on/off preference live together in AsyncStorage
 *   under `fabric_ghost_v1`; a first-run identity is generated and
 *   persisted immediately, so the same ghost greets you next visit.
 * - Feeds it the human-peer count (with people connected, the ghost
 *   shifts to its crowd role — or session, once summoned).
 * - Applies the ACTIVE layer's ghost feature toggle ("Ghost in this
 *   layer", stored per layer id): the brain runs only when the
 *   per-user preference AND the layer toggle are both on.
 * - Translates HUD window events into brain calls: the indicator's
 *   toggle (FABRIC_GHOST_TOGGLE_EVENT) and Summon/Dismiss
 *   (FABRIC_GHOST_SESSION_EVENT) — the same event pattern the VerbBar
 *   uses to reach the canvas.
 * - Publishes presence / temperament / room ghost count to the ghost
 *   store for the HUD indicator.
 * - Optional LLM link: while the ghost is active, at most once every
 *   45 s, if an LLM is configured AND enabled in `fabric_ai_config_v1`,
 *   ask it for a one-word behavior bias from the allowlist
 *   [heart, cheer, tickle, drift, mirror]. Parsed defensively; any
 *   failure, timeout, or off-list answer is ignored and the local rules
 *   carry on alone. No streaming, no chat UI.
 *
 * The caller (LegacyFluid) supplies the sinks: `inject` renders the
 * ghost on this client through the multi-user hook's injection seam,
 * and `broadcast` sends under the ghost's own peer id so session
 * participants render it through the normal remote path.
 *
 * Powered by Nirvana
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { FluidInteraction } from "../types/fluid";
import { getJSON, setJSON } from "../../app/utils/storage";
import { getLLMService } from "../services/LLMService";
import {
  GhostPeer,
  ghostPeerIdFor,
  isGhostPeerId,
  GHOST_MOOD_BIASES,
  type GhostIdentity,
  type GhostMoodBias,
} from "./GhostPeer";
import {
  FABRIC_GHOST_SESSION_EVENT,
  FABRIC_GHOST_TOGGLE_EVENT,
  setGhostPublicState,
} from "./ghostStore";
import type { GhostSfxKind } from "./useGhostSfx";

export const GHOST_PREF_KEY = "fabric_ghost_v1";
const AI_CONFIG_KEY = "fabric_ai_config_v1";
const LLM_POLL_MS = 45_000;

export interface GhostIdentityFull extends GhostIdentity {
  /** The ghost's persistent friendly name (generated once, then kept). */
  name: string;
}

interface GhostPref {
  enabled: boolean;
  identity: GhostIdentityFull;
}

export interface UseGhostPeerOptions {
  /** This client's human user id (from useFluidMultiUser). */
  ownerId: string;
  /** Render one of the ghost's interactions on THIS client. */
  inject: (interaction: FluidInteraction) => void;
  /** Broadcast one of the ghost's interactions under its ghost peer id. */
  broadcast: (
    interaction: Omit<FluidInteraction, "userId" | "timestamp">
  ) => void;
  /** Number of connected HUMAN peers (ghost ids never counted). */
  humanPeers: number;
  /**
   * The active layer's ghost feature toggle ("Ghost in this layer",
   * THIS LAYER settings, persisted per layer id by the settings
   * mirror). Default true. When false the local ghost does not run
   * in this layer at all, whatever the per-user preference says.
   */
  layerEnabled?: boolean;
  /** Semantic sound events from the brain (see useGhostSfx). */
  onSfx?: (kind: GhostSfxKind) => void;
}

const GHOST_NAMES = [
  "Mochi",
  "Biscuit",
  "Noodle",
  "Pico",
  "Miso",
  "Waffles",
  "Pickle",
  "Suki",
  "Boop",
  "Momo",
  "Taro",
  "Ziggy",
  "Nori",
  "Bean",
  "Soba",
  "Chai",
];

/** Same PRNG family as the brain, so identity derives from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateIdentity(): GhostIdentityFull {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const rng = mulberry32(seed);
  return {
    seed,
    name: GHOST_NAMES[Math.floor(rng() * GHOST_NAMES.length)],
    hue: Math.floor(rng() * 360),
  };
}

interface AIConfigShape {
  llm?: {
    provider: string;
    apiKey: string;
    endpoint: string;
    model: string;
    enabled: boolean;
  };
}

export function useGhostPeer(options: UseGhostPeerOptions) {
  const [enabled, setEnabled] = useState(true);
  const [identity, setIdentity] = useState<GhostIdentityFull | null>(null);
  const peerRef = useRef<GhostPeer | null>(null);
  const enabledRef = useRef(true);
  const identityRef = useRef<GhostIdentityFull | null>(null);

  // Sinks via refs: the brain is created once and never captures stale
  // closures (same pattern as LegacyFluid's sendRef).
  const injectRef = useRef(options.inject);
  injectRef.current = options.inject;
  const broadcastRef = useRef(options.broadcast);
  broadcastRef.current = options.broadcast;
  const onSfxRef = useRef(options.onSfx);
  onSfxRef.current = options.onSfx;
  const humanPeersRef = useRef(options.humanPeers);
  humanPeersRef.current = options.humanPeers;
  const layerEnabledRef = useRef(options.layerEnabled !== false);
  layerEnabledRef.current = options.layerEnabled !== false;

  const persist = useCallback(
    (nextEnabled: boolean, id: GhostIdentityFull) => {
      void setJSON(GHOST_PREF_KEY, {
        enabled: nextEnabled,
        identity: id,
      } satisfies GhostPref).catch(() => undefined);
    },
    []
  );

  // Load (or create) the persistent preference + identity, then build
  // the brain exactly once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let pref: GhostPref | null = null;
      try {
        pref = await getJSON<GhostPref | null>(GHOST_PREF_KEY, null);
      } catch {
        pref = null;
      }
      if (cancelled) return;
      const id =
        pref?.identity && typeof pref.identity.seed === "number"
          ? pref.identity
          : generateIdentity();
      const en = pref?.enabled !== false;
      identityRef.current = id;
      enabledRef.current = en;
      setIdentity(id);
      setEnabled(en);
      if (!pref?.identity) persist(en, id);
      setGhostPublicState({ enabled: en, ghostName: id.name });

      const peer = new GhostPeer({
        peerId: ghostPeerIdFor(options.ownerId),
        identity: id,
        injectLocal: (i) => injectRef.current(i),
        broadcast: (i) => broadcastRef.current(i),
        onPresenceChange: (presence, mode) => {
          setGhostPublicState({
            presence,
            sessionRole: mode === "session" ? "host" : "none",
          });
        },
        onTemperamentChange: (temperament) => {
          setGhostPublicState({ temperament });
        },
        onGhostsChange: (otherGhostCount) => {
          setGhostPublicState({ otherGhostCount });
        },
        onSfx: (kind) => onSfxRef.current?.(kind),
      });
      peer.setEnabled(en && layerEnabledRef.current);
      setGhostPublicState({ layerEnabled: layerEnabledRef.current });
      // The brain is born after an async storage load — bring it up to
      // date with the room as it is right now.
      peer.setHumansPresent(humanPeersRef.current > 0);
      setGhostPublicState({ temperament: peer.getTemperament() });
      peerRef.current = peer;
    })();
    return () => {
      cancelled = true;
      peerRef.current?.destroy();
      peerRef.current = null;
    };
    // ownerId is stable for the life of the canvas (useMemo in the
    // multi-user hook), so this runs exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Room rule: humans connected -> crowd role (or, in session mode,
  // the session ends when everyone leaves).
  const { humanPeers } = options;
  useEffect(() => {
    peerRef.current?.setHumansPresent(humanPeers > 0);
  }, [humanPeers]);

  // Per-layer feature gate: the brain's effective enabled state is
  // the per-user preference AND the active layer's toggle. Switching
  // layers re-applies it (each layer's stored setting was loaded by
  // the settings mirror before this value changes).
  const layerEnabled = options.layerEnabled !== false;
  useEffect(() => {
    setGhostPublicState({ layerEnabled });
    peerRef.current?.setEnabled(enabledRef.current && layerEnabled);
  }, [layerEnabled]);

  // HUD controls travel as window events (VerbBar pattern).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onToggle = (ev: Event) => {
      const detail = (ev as CustomEvent<boolean>).detail;
      const next = typeof detail === "boolean" ? detail : !enabledRef.current;
      enabledRef.current = next;
      setEnabled(next);
      peerRef.current?.setEnabled(next && layerEnabledRef.current);
      setGhostPublicState({ enabled: next });
      const id = identityRef.current;
      if (id) persist(next, id);
    };
    const onSession = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail === "summon") peerRef.current?.summon();
      else if (detail === "dismiss") peerRef.current?.dismiss();
    };
    window.addEventListener(FABRIC_GHOST_TOGGLE_EVENT, onToggle as EventListener);
    window.addEventListener(FABRIC_GHOST_SESSION_EVENT, onSession as EventListener);
    return () => {
      window.removeEventListener(FABRIC_GHOST_TOGGLE_EVENT, onToggle as EventListener);
      window.removeEventListener(FABRIC_GHOST_SESSION_EVENT, onSession as EventListener);
    };
  }, [persist]);

  // Optional LLM mood-bias poll — graceful in every failure mode.
  useEffect(() => {
    const id = setInterval(() => {
      void (async () => {
        const peer = peerRef.current;
        if (!peer || !enabledRef.current) return;
        const presence = peer.getPresence();
        if (presence !== "present" && presence !== "summoned") return;
        let config: AIConfigShape | null = null;
        try {
          config = await getJSON<AIConfigShape | null>(AI_CONFIG_KEY, null);
        } catch {
          return;
        }
        const llm = config?.llm;
        if (!llm || !llm.enabled || llm.provider === "none" || !llm.apiKey) {
          return; // unconfigured/disabled: local rules only
        }
        try {
          const service = getLLMService({
            provider: llm.provider as "openai" | "anthropic" | "custom" | "none",
            apiKey: llm.apiKey,
            endpoint: llm.endpoint,
            model: llm.model,
          });
          const res = await service.chat(
            [
              {
                role: "system",
                content:
                  "You steer a friendly canvas ghost. Reply with exactly ONE word from this list: heart, cheer, tickle, drift, mirror. No punctuation, no other text.",
              },
              {
                role: "user",
                content: `The ghost currently feels ${peer.getTemperament()}. Pick its next behavior bias.`,
              },
            ],
            { maxTokens: 4, temperature: 0.9 }
          );
          const word = (res.text || "")
            .toLowerCase()
            .replace(/[^a-z]/g, "") as GhostMoodBias;
          if ((GHOST_MOOD_BIASES as readonly string[]).includes(word)) {
            peer.setMoodBias(word);
          }
        } catch {
          // LLM unreachable/misconfigured: local behavior is unaffected.
        }
      })();
    }, LLM_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const noteLocalInteraction = useCallback((i: FluidInteraction) => {
    peerRef.current?.noteInteraction(i, "local");
  }, []);

  const noteRemoteInteraction = useCallback((i: FluidInteraction) => {
    if (isGhostPeerId(i.userId)) {
      peerRef.current?.noteGhostSighting(i);
    } else {
      peerRef.current?.noteInteraction(i, "remote");
    }
  }, []);

  const noteUserActivity = useCallback(() => {
    peerRef.current?.noteUserActivity();
  }, []);

  return {
    enabled,
    identity,
    noteLocalInteraction,
    noteRemoteInteraction,
    noteUserActivity,
  };
}
