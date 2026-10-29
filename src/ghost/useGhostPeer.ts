/**
 * useGhostPeer — React lifecycle for the Fabric ghost (see GhostPeer.ts
 * for the brain itself).
 *
 * - Creates the GhostPeer once this user's persistent identity is known.
 *   Identity (generated friendly name + signature hue + temperament
 *   seed) and the manual on/off preference live together in AsyncStorage
 *   under `fabric_ghost_v1`; a first-run identity is generated and
 *   persisted immediately, so the same ghost greets you next visit.
 * - LifePacket binding (Slice 9): on a FRESH install — no stored
 *   `fabric_ghost_v1` identity — the ghost is BORN FROM the user's
 *   LifePacket: its seed derives deterministically from the human
 *   identity seed (see deriveGhostIdentity below), so the ghost is
 *   provably the child of this device's packet. A stored ghost
 *   identity is NEVER re-derived or rewritten: ghosts that already
 *   exist (Biscuit, Boop, Ziggy, …) keep the seed, name, and hue
 *   they were born with — migration is a no-op for them by design.
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
 * - Brain routing (Ghost Brain build): the peer's deliberation hook
 *   fires with a scenario snapshot whenever context meaningfully
 *   changed (10s floor); this hook routes it by the user's tier
 *   preference (fabric_ghost_brain_v1). On-device (default): the
 *   distilled decision table in GhostBrain.ts decides locally — no
 *   network. Spark-cloud (opt-in): the scenario goes to the AI
 *   Services configured model through the composer's own loader
 *   (loadLLMConfig + LLMService); the reply is validated against the
 *   dataset decision contract, and an invalid/failed/slow reply
 *   changes nothing. Cloud tier picked with no cloud model
 *   resolved (Cleanup 2's shared resolution: no user-saved model
 *   and no build-time-locked Fanalogy cloud): the table decides
 *   and the outcome is published as the on-device brain at work —
 *   never a silent fake, and never a complaint about a key. Every
 *   outcome is published to the ghost store's `brain`
 *   field for the AI Services row and the diag panel. This replaces
 *   the old 45s one-word mood-bias poll; setMoodBias survives as the
 *   steering seam deliberation itself uses.
 * - Tools (Slice 23): every routed decision passes the ghost tool
 *   registry's gate (ghostTools.ts) as the last step of the bias
 *   chain — personality, then stamina, then the tool gate — and a
 *   gated decision is published as its refusal, never applied.
 *   The canvas also supplies the fabric-awareness read
 *   (getFabricContext) the peer stamps into each scenario, and the
 *   draw sink (onDrawRecipe) for the DRAW tool's performances.
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
import { loadLLMConfig } from "../ai/PatternComposer";
import { ensureLocalIdentity } from "../identity/identityStore";
import {
  GhostPeer,
  ghostPeerIdFor,
  isGhostPeerId,
  type GhostIdentity,
  type GhostVerbAskId,
} from "./GhostPeer";
import {
  applyPersonalityBias,
  applyStaminaBias,
  consultSparkBrain,
  decideOnDevice,
  parseGhostPersonality,
  STAMINA_TIRED_BELOW,
  type GhostDecision,
  type GhostFabricContext,
  type GhostScenario,
} from "./GhostBrain";
import { ghostToolRefusal } from "./ghostTools";
import type { Recipe } from "../ai/RecipeCore";
import { computeGhostVitals } from "./ghostVitals";
import { getGhostBrainTier } from "./ghostBrainPref";
import { getGhostPersonality } from "./ghostPersonalityPref";
import { subscribeGhostSharedSettings } from "./ghostSharedPref";
import {
  FABRIC_GHOST_SESSION_EVENT,
  FABRIC_GHOST_TOGGLE_EVENT,
  setGhostPublicState,
  type GhostBrainStatus,
} from "./ghostStore";
import type { GhostSfxKind } from "./useGhostSfx";

export const GHOST_PREF_KEY = "fabric_ghost_v1";

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
  /**
   * Fabric awareness (Slice 23): the canvas's read of where the
   * ghost is — active fabric, canvas kind, session role, host
   * rules resolved for this participant. Read fresh at every
   * snapshot; the scenario carries it to both brain tiers.
   */
  getFabricContext?: () => GhostFabricContext | null;
  /**
   * The DRAW tool's sink (Slice 23): render + ship a recipe the
   * ghost chose to draw (LegacyFluid plays it locally and sends
   * it on the recipe transport under the ghost's peer id).
   */
  onDrawRecipe?: (recipe: Recipe) => void;
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

/** "ghos" — the domain salt separating the ghost lineage from the packet's own stream. */
const GHOST_DERIVE_SALT = 0x67686f73;

/**
 * The LifePacket binding derivation (Slice 9), stated exactly:
 *
 *   ghostSeed = first 32-bit draw of mulberry32(identitySeed XOR 0x67686f73)
 *   ghost name = GHOST_NAMES[first draw of mulberry32(ghostSeed)]
 *   ghost hue  = second draw of mulberry32(ghostSeed), ×360
 *
 * — the same name/hue draw order generateIdentity uses, so a bound
 * ghost is an ordinary ghost identity in every other respect. The
 * function is pure: the same LifePacket seed always bears the same
 * ghost seed, on any device, forever. The ghost's name and hue stay
 * its OWN (drawn from the ghost stream, never copied from the
 * human's), and the human seed itself is never stored in the ghost
 * record or sent anywhere — only the derived ghost seed persists,
 * in the same fabric_ghost_v1 record as before.
 */
export function deriveGhostIdentity(identitySeed: number): GhostIdentityFull {
  const stream = mulberry32((identitySeed ^ GHOST_DERIVE_SALT) | 0);
  const seed = Math.floor(stream() * 0xffffffff) >>> 0;
  const rng = mulberry32(seed);
  return {
    seed,
    name: GHOST_NAMES[Math.floor(rng() * GHOST_NAMES.length)],
    hue: Math.floor(rng() * 360),
  };
}

/**
 * First-run identity: derive from the user's LifePacket when it can
 * be loaded (the normal fresh-install path — Slice 6's identity is
 * ensured by the chrome long before the canvas settles), falling
 * back to the pre-Slice-9 random generation only if the packet is
 * somehow unavailable, so a storage hiccup can never leave a user
 * ghostless.
 */
async function generateBoundIdentity(): Promise<GhostIdentityFull> {
  try {
    const human = await ensureLocalIdentity();
    if (human && typeof human.seed === "number") {
      return deriveGhostIdentity(human.seed);
    }
  } catch {
    // Fall through to the unbound generation below.
  }
  return generateIdentity();
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
  const getFabricContextRef = useRef(options.getFabricContext);
  getFabricContextRef.current = options.getFabricContext;
  const onDrawRecipeRef = useRef(options.onDrawRecipe);
  onDrawRecipeRef.current = options.onDrawRecipe;

  const persist = useCallback(
    (nextEnabled: boolean, id: GhostIdentityFull) => {
      void setJSON(GHOST_PREF_KEY, {
        enabled: nextEnabled,
        identity: id,
      } satisfies GhostPref).catch(() => undefined);
    },
    []
  );

  // ---------------------------------------------------------------
  // Brain routing. The peer fires onDeliberate with a snapshot; the
  // tier preference picks the brain; every outcome is published to
  // the ghost store so AI Services + diag show what actually decided.
  // ---------------------------------------------------------------
  const describeDecision = (d: GhostDecision): string =>
    `decided: ${d.intent}${d.pattern_id ? ` · ${d.pattern_id}` : ""}${d.draw_shape ? ` · ${d.draw_shape}` : ""} · linger ${d.linger_s}s`;

  const publishBrain = (status: GhostBrainStatus): void => {
    setGhostPublicState({ brain: status });
  };

  // Vitals (Slice 22): the card's readings, computed from the
  // peer's live journals and published to the ghost store. Deduped
  // by value — a reading that hasn't moved doesn't re-render the
  // room. Refreshed on an interval, at birth, and at every
  // deliberation (the moments the inputs actually change).
  const vitalsKeyRef = useRef("");
  const publishVitals = useCallback((): void => {
    const peer = peerRef.current;
    if (!peer) return;
    try {
      const v = computeGhostVitals(peer.getVitalsSnapshot());
      const key = `${v.health}|${v.stamina}|${v.vigor}|${v.why.health}|${v.why.stamina}|${v.why.vigor}`;
      if (key === vitalsKeyRef.current) return;
      vitalsKeyRef.current = key;
      setGhostPublicState({ vitals: v });
    } catch {
      // Vitals must never hurt the ghost; the card reads "not yet".
    }
  }, []);
  const publishVitalsRef = useRef(publishVitals);
  publishVitalsRef.current = publishVitals;
  const vitalsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const routeDeliberation = useCallback(
    async (scenario: GhostScenario): Promise<void> => {
      const peer = peerRef.current;
      if (!peer || !enabledRef.current) return;
      try {
        // Stamina (Slice 22): the ghost's energy reading, computed
        // from the same snapshot the card shows. On the table paths
        // it biases the decision toward rest when drained (named
        // in the brain line, like Personality); on the Spark path
        // it rides as plain-words context. A bias, never a budget.
        publishVitalsRef.current();
        const stamina = computeGhostVitals(peer.getVitalsSnapshot()).stamina;
        const withBiases = (raw: GhostDecision) => {
          const p = applyPersonalityBias(raw, scenario, traits);
          const st = applyStaminaBias(p.decision, stamina);
          const notes: string[] = [];
          if (p.steeredBy.length) {
            notes.push(`personality: ${p.steeredBy.join("; ")}`);
          }
          if (st.steeredBy.length) {
            notes.push(`stamina: ${st.steeredBy.join("; ")}`);
          }
          return {
            decision: st.decision,
            suffix: notes.length ? ` · ${notes.join(" · ")}` : "",
          };
        };
        // Tool gate (Slice 23): the registry's final word, after
        // the biases (chain: personality -> stamina -> tool gate).
        // A decision whose tool this scenario's fabric forbids is
        // NOT applied, and the refusal — not a fake "decided" — is
        // what the brain line reports. On the table paths the
        // brain itself never selects a forbidden tool, so this is
        // the guarantee's second lock; on the Spark path it backs
        // the validator's identical refusal.
        const applyGated = (
          decision: GhostDecision,
          source: "spark" | "table",
          tierLabel: string,
          suffix: string
        ): void => {
          const refusal = ghostToolRefusal(decision.intent, scenario);
          if (refusal) {
            publishBrain({
              source,
              tierLabel,
              lastText: refusal,
              lastAt: Date.now(),
            });
            return;
          }
          peerRef.current?.applyBrainDecision(decision, source);
          publishBrain({
            source,
            tierLabel,
            lastText: describeDecision(decision) + suffix,
            lastAt: Date.now(),
          });
        };
        // Personality (Slice 20): the primary's words for their
        // ghostie, read fresh each deliberation (at most 1/10s).
        // On the Spark tier they ride as context in the consult;
        // on the table paths they steer via the legible bias map.
        // Either way they act WITHIN the hard invariants — see
        // GhostBrain.ts's Personality section for the table stakes.
        const personality = await getGhostPersonality();
        const traits = parseGhostPersonality(personality);
        const tier = await getGhostBrainTier();
        if (tier === "spark-cloud") {
          const config = await loadLLMConfig();
          if (!config) {
            // Cloud tier picked but no cloud model resolved (no
            // user-saved model, and this build carries no locked-in
            // Fanalogy cloud): the on-device table decides. The
            // published state is simply the on-device brain at work
            // (Cleanup 2) — never a complaint about a missing key.
            const raw = decideOnDevice(scenario).decision;
            const { decision, suffix } = withBiases(raw);
            applyGated(decision, "table", "On-device brain", suffix);
            return;
          }
          const service = getLLMService(config);
          // The validator inside the consult enforces the tool
          // gate against this scenario; when THAT is why a reply
          // died, it names the refusal here so the brain line can
          // say what the fabric said.
          let gateRefusal: string | null = null;
          const decision = await consultSparkBrain(
            scenario,
            (messages, opts) =>
              service.chat(messages, opts).then((r) => r.text),
            6_000,
            personality,
            stamina,
            (text) => {
              gateRefusal = text;
            }
          );
          if (decision) {
            applyGated(
              decision,
              "spark",
              "Spark",
              (personality ? " · personality heard" : "") +
                (stamina < STAMINA_TIRED_BELOW
                  ? ` · stamina ${stamina} — rest favored`
                  : "")
            );
          } else {
            // Failed / invalid / timed out: nothing was applied —
            // and when the fabric's gate is what refused the reply,
            // the line says that instead of shrugging.
            publishBrain({
              source: "spark",
              tierLabel: "Spark",
              lastText: gateRefusal ?? "no usable reply — reflexes only",
              lastAt: Date.now(),
            });
          }
          return;
        }
        const raw = decideOnDevice(scenario).decision;
        const { decision, suffix } = withBiases(raw);
        applyGated(decision, "table", "On-device table", suffix);
      } catch {
        // Routing must never break the ghost; reflexes carry on.
      }
    },
    []
  );
  const routeRef = useRef(routeDeliberation);
  routeRef.current = routeDeliberation;

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
      // A stored ghost identity is used EXACTLY as stored — the
      // Slice 9 binding only births ghosts that don't exist yet.
      const id =
        pref?.identity && typeof pref.identity.seed === "number"
          ? pref.identity
          : await generateBoundIdentity();
      if (cancelled) return;
      const en = pref?.enabled !== false;
      identityRef.current = id;
      enabledRef.current = en;
      setIdentity(id);
      setEnabled(en);
      if (!pref?.identity) persist(en, id);
      setGhostPublicState({ enabled: en, ghostName: id.name, ghostHue: id.hue });

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
        ghostName: id.name,
        onPerformance: (label) => {
          publishBrain({
            source: "table",
            tierLabel: "On-device ghost",
            lastText: label,
            lastAt: Date.now(),
          });
        },
        onDeliberate: (scenario) => {
          void routeRef.current(scenario);
        },
        getFabricContext: () => getFabricContextRef.current?.() ?? null,
        onDrawRecipe: (recipe) => {
          onDrawRecipeRef.current?.(recipe);
        },
      });
      peer.setEnabled(en && layerEnabledRef.current);
      setGhostPublicState({ layerEnabled: layerEnabledRef.current });
      // The brain is born after an async storage load — bring it up to
      // date with the room as it is right now.
      peer.setHumansPresent(humanPeersRef.current > 0);
      setGhostPublicState({ temperament: peer.getTemperament() });
      peerRef.current = peer;
      // Vitals (Slice 22): first reading at birth, then a slow
      // refresh — the inputs drift (rest accrues, journals age)
      // even when nothing deliberates.
      publishVitalsRef.current();
      vitalsTimerRef.current = setInterval(
        () => publishVitalsRef.current(),
        5_000
      );
    })();
    return () => {
      cancelled = true;
      if (vitalsTimerRef.current) {
        clearInterval(vitalsTimerRef.current);
        vitalsTimerRef.current = null;
      }
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

  // Shared settings (Slice 20): feed the peer the primary's
  // "how my ghostie is with others" switches — the stored record
  // when it loads, and every toggle in Your Ghostie the moment it
  // flips. The peer gates greetings/approaches and remote pets
  // on these; followHostFabric resolves at the layer gate instead.
  useEffect(
    () =>
      subscribeGhostSharedSettings((s) => {
        peerRef.current?.setSharedSettings(s);
      }),
    []
  );

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

  /** Slice 17: ask this ghost to perform its heartbeat. */
  const answerHeartbeat = useCallback((): number | null => {
    return peerRef.current?.answerHeartbeat() ?? null;
  }, []);

  /** Slice 23: ask this ghost to perform a named verb ("say-it"). */
  const answerVerb = useCallback(
    (verbId: GhostVerbAskId): GhostVerbAskId | null => {
      return peerRef.current?.answerVerb(verbId) ?? null;
    },
    []
  );

  /**
   * Slice 21: where another ghost was last sensed on this canvas
   * (the profile card's pet aim). Null when unseen or stale.
   */
  const otherGhostPosition = useCallback(
    (peerId: string): { x: number; y: number } | null => {
      return peerRef.current?.otherGhostPosition(peerId) ?? null;
    },
    []
  );

  return {
    enabled,
    identity,
    noteLocalInteraction,
    noteRemoteInteraction,
    noteUserActivity,
    answerHeartbeat,
    answerVerb,
    otherGhostPosition,
  };
}
