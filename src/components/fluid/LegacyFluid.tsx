import React, { useCallback, useEffect, useRef, useState } from "react";
import { LegacyFluidEngine } from "./LegacyFluidEngine";
import { useExperience } from "../../contexts/ExperienceContext";
import { useFluidMultiUser } from "../../hooks/useFluidMultiUser";
import {
  FABRIC_VERB_EVENT,
  getVerbById,
  verbInteraction,
  type SensoryVerb,
} from "../../sensory/verbs";
import {
  FABRIC_COMPOSE_EVENT,
  FABRIC_COMPOSE_STATE_EVENT,
  FABRIC_COMPOSE_STOP_EVENT,
  FABRIC_PLAY_PATTERN_EVENT,
  getHapticPattern,
  hueToRgb,
  type Pattern,
  type PatternStep,
} from "../../ai/PatternComposer";
import {
  FABRIC_COMPOSE_SOURCE_EVENT,
  FABRIC_PLAY_RECIPE_EVENT,
  composeWithShapesDetailed,
} from "../../ai/RecipeComposer";
import {
  recipeBus,
  recipePlayer,
  type RecipeSplat,
} from "../../ai/RecipePlayer";
import {
  validateRecipe,
  type Recipe,
} from "../../ai/RecipeCore";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../../session/sessionStore";
import { patternPlayer } from "../../ai/PatternPlayer";
import { useAudioCues } from "../../../app/hooks/useAudioCues";
import type { FluidInteraction } from "../../types/fluid";
import { useGhostPeer } from "../../ghost/useGhostPeer";
import {
  ghostPeerIdFor,
  ghostVerbAsk,
  isGhostHeartbeatRequest,
  isGhostPeerId,
} from "../../ghost/GhostPeer";
import type { GhostFabricContext } from "../../ghost/GhostBrain";
import { useGhostSfx, hueFromColor } from "../../ghost/useGhostSfx";
import { resolveGhostLayerEnabled } from "../../ghost/ghostShared";
import { useGhostSharedSettings } from "../../ghost/ghostSharedPref";
import {
  getHostArrivedFabric,
  getSessionFabricState,
} from "../../session/fabricStore";
import {
  setGhostPublicState,
  getGhostPublicState,
  FABRIC_PET_GHOST_EVENT,
  FABRIC_VOICE_UNHEARD_EVENT,
  FABRIC_WARM_WELCOME_EVENT,
} from "../../ghost/ghostStore";
import {
  getRewardsSnapshot,
  recordAgentAnswer,
  recordHeartSent,
  recordPetGiven,
} from "../../rewards/rewardsStore";
import { getPeerProfileExtras } from "../../identity/profileStore";
import {
  getSignalingService,
  type SignalingConnectionState,
} from "../../services/SignalingService";
import {
  getActiveTransportPath,
  type TransportPath,
} from "../../services/WebRTCManager";
import {
  getIdentitySnapshot,
  getPeerIdentity,
  subscribeIdentity,
  tintColorTowardHue,
  hueDyeColor,
} from "../../identity/identityStore";
import { useAmbientLife, type AmbientLifeStats } from "./useAmbientLife";
import {
  useDeviceMotion,
  type MotionStats,
} from "../../sensors/useDeviceMotion";
import { noteBus } from "../../../shared/utils/noteBus";
import { getAudioContextState } from "../../audio/sharedAudio";

interface LegacyFluidProps {
  /**
   * Fires once the WebGL engine has actually initialized. Used by
   * ExperienceRenderer to set the background-ready flag honestly
   * (on engine init, not on component mount).
   */
  onReady?: () => void;
}

type EngineStats = ReturnType<LegacyFluidEngine["getStats"]>;

/**
 * Hotfix 1.5 diagnostics gate — same convention the modern UI pass
 * uses for its FPS meter: ?diag=1 in the URL, or the
 * fabric_diagnostics_v1 localStorage flag. The panel below is the
 * shared ground truth for canvas debugging: one screenshot shows
 * the engine's format, its own measured FPS, how many input events
 * the canvas element actually received, how many local vs
 * remote/ghost splats were applied, and the last engine error.
 * Hotfix 1.6 adds the signaling resolution — connection state and the
 * resolved signaling URL (or "none") — so a "stuck in Local mode"
 * report explains itself from the same screenshot.
 * It renders pointerEvents:"none" — after this project's history,
 * a debug layer that could eat a touch is not a debug layer.
 */
function diagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("diag") === "1") {
      return true;
    }
    return window.localStorage.getItem("fabric_diagnostics_v1") === "1";
  } catch {
    return false;
  }
}

export default function LegacyFluid({ onReady }: LegacyFluidProps = {}) {
  // Hotfix 1.3: engine failures used to be swallowed by a console.warn —
  // the shell loaded, the canvas stayed blank, and nobody was told.
  // Surface them as a small dismissible notice on the canvas layer and
  // on the fabric:engine-error window event (the same event-bus style
  // as fabric:background-ready).
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineErrorDismissed, setEngineErrorDismissed] = useState(false);
  // Hotfix 1.5: diagnostics panel state (null unless diag mode is on).
  const [diagStats, setDiagStats] = useState<EngineStats | null>(null);
  // Hotfix 1.6: signaling resolution shown in the same panel — the
  // resolved URL (null in local mode) and the live connection state.
  const [diagSig, setDiagSig] = useState<{
    url: string | null;
    state: SignalingConnectionState;
  } | null>(null);
  // Slice 7: ambient-life state for the same panel (see below).
  const [diagAmbient, setDiagAmbient] = useState<AmbientLifeStats | null>(null);
  // Hotfix 1.8: the shared audio context's live state, same poll —
  // "audio running" in a field screenshot proves the app's side of
  // the iPhone-silence question (a running context with notes
  // sounding on another device means any remaining silence is the
  // device's channel — e.g. the hardware mute switch routing
  // WebAudio to the ringer path — not the app; see sharedAudio).
  const [diagAudio, setDiagAudio] = useState<string>("…");
  // Hotfix 2.0: the interaction path this device is on — "path
  // relay" in a field screenshot is the whole hostile-network story
  // in two words: P2P could not open, the signaling relay is
  // carrying the room, and sync is alive anyway.
  const [diagPath, setDiagPath] = useState<TransportPath>("—");
  // Slice 12: device-motion state for the same panel — permission,
  // live tilt vector, shake count. A field report about tilt can be
  // settled from one screenshot (?diag=1) instead of a phone call:
  // "motion needs-permission" IS the diagnosis.
  const [diagMotion, setDiagMotion] = useState<MotionStats | null>(null);
  // Ghost Brain: last deliberation outcome from the ghost store
  // (tier · decision · age), polled with the rest of the panel.
  const [diagBrain, setDiagBrain] = useState<string>("—");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LegacyFluidEngine | null>(null);

  // Multi-user sync for the live canvas (Slice 1). Previously this hook
  // was only wired into the orphaned FluidFabric component, so the canvas
  // people actually see never synced. Local input is still rendered by
  // the engine itself; the hook only broadcasts it and surfaces remote
  // interactions, which we render via engine.splatAt below.
  const { state } = useExperience();
  const roomId =
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.roomId as string) || "main";
  const {
    userId,
    remoteInteractions,
    sendInteraction,
    sendRecipe,
    sendRecipeAs,
    injectRemoteInteraction,
    humanPeers,
  } = useFluidMultiUser(roomId);
  const audioCues = useAudioCues();
  const ghostSfx = useGhostSfx();

  // Latest-callback refs so the engine hook and window listener never
  // capture stale closures.
  const sendRef = useRef(sendInteraction);
  sendRef.current = sendInteraction;
  const sendRecipeRef = useRef(sendRecipe);
  sendRecipeRef.current = sendRecipe;
  const sendGhostRecipeRef = useRef(sendRecipeAs);
  sendGhostRecipeRef.current = sendRecipeAs;
  const cuesRef = useRef(audioCues);
  cuesRef.current = audioCues;
  const sfxRef = useRef(ghostSfx);
  sfxRef.current = ghostSfx;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const seenRef = useRef<Set<string>>(new Set());

  // ---- Share & Session (Slice 5) ------------------------------------
  // The session store is published by useFluidMultiUser (mode, host,
  // driver, and this client's enforcement results). Here it drives
  // two things: the engine's local-input switch (a view-only guest's
  // canvas is a pure audience surface) and the verb gate below.
  // Broadcast enforcement itself lives in the hook's sendInteraction
  // — every send path (engine input, verbs, patterns, the ghost)
  // funnels through it, so nothing here can leak a gated splat.
  const sessionRef = useRef<SessionPublicState>(getSessionPublicState());
  useEffect(() => {
    return subscribeSessionState((s) => {
      sessionRef.current = s;
      if (engineRef.current) {
        engineRef.current.localInputEnabled = s.inputEnabled;
      }
    });
  }, []);

  // ---- Who's Who (Slice 6) -------------------------------------------
  // The participant identity drives the engine's pointer color: your
  // press paints in your signature hue. The subscription also covers
  // menu edits (a new hue repaints the very next press) and the
  // identity's async first load. Peer hues are read per-interaction
  // in the render path below — no state needs to live here.
  useEffect(() => {
    return subscribeIdentity((snap) => {
      if (engineRef.current) {
        engineRef.current.localHue = snap.self ? snap.self.hue : null;
      }
    });
  }, []);
  // Per-sender stroke-onset tracking for the peer voice (see the
  // render path): a participant's sound fires when a stroke STARTS,
  // not per splat — drawing is continuous, voices are events.
  const peerStrokeRef = useRef<Map<string, number>>(new Map());

  // ---- Ghost (Slice 2) -------------------------------------------------
  // The ghost is a local agent peer with its own peer id
  // ("ghost:<userId>"). Its interactions are injected through the SAME
  // remote-interaction path human remotes take (injectRemoteInteraction
  // -> remoteInteractions -> splatAt + effects below), never rendered
  // through a fork. When summoned into a session, the same interactions
  // are ALSO broadcast under the ghost peer id so every participant
  // renders them through their own normal remote path.
  // Per-layer ghost feature toggle ("Ghost in this layer", THIS LAYER
  // settings): the value lives in the active layer's own config, which
  // the settings mirror loads and persists per layer id
  // (fabric_layer_settings_v1:<layerId>). Absent means on — the ghost
  // is a default feature of a layer until that layer opts out.
  //
  // Slice 20 adds the primary's "Follow the host's fabric" switch
  // (Your Ghostie › shared settings): with follow OFF, a layer this
  // device was host-MOVED into (the follower's arrival note) does
  // not get the ghost — the ghostie stays with fabrics its primary
  // chose. The layer's own toggle stays sovereign either way; the
  // resolver in ghostShared.ts is the whole rule.
  const ghostShared = useGhostSharedSettings();
  const ghostLayerEnabled = resolveGhostLayerEnabled({
    storedEnabled:
      ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
        ?.ghostEnabled as boolean | undefined) !== false,
    followHostFabric: ghostShared.followHostFabric,
    arrivedViaHost:
      state.activeExperience?.id != null &&
      getHostArrivedFabric() === state.activeExperience.id,
  });

  // ---- Ambient life (Slice 7, "Alive") --------------------------------
  // The idle contract (src/types/experience.ts) requires every layer
  // to declare its idle behavior; the base fluid declares `ambient`.
  // The per-layer toggle lives in the same specific config as the
  // ghost toggle ("Ambient life", THIS LAYER settings), persisted per
  // layer id by the settings mirror. Absent means on — a layer may
  // opt out of being alive, never the reverse.
  const ambientLayerEnabled =
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.ambientEnabled as boolean | undefined) !== false;

  // The room's last REAL activity — the ambient driver's idle clock.
  // Every genuine input path feeds it below: local pointer input
  // (the engine observer), remote + ghost interactions (the render
  // path), verbs, pattern steps, and notes (noteBus). Ambient splats
  // themselves deliberately never touch it: breathing is what the
  // canvas does in activity's ABSENCE, and because every real thing
  // moves this clock, ambient yields to all of them instantly and
  // for free — including the ghost, whose gestures arrive through
  // the render path like any peer's. The driver (useAmbientLife)
  // renders locally through engine.splatAt only: it never sends,
  // never calls a ghost API, and cannot eat the ghost's budget.
  const activityRef = useRef(Date.now());
  const markActivity = useCallback(() => {
    activityRef.current = Date.now();
  }, []);
  const ambientStatsRef = useAmbientLife({
    engineRef,
    activityRef,
    enabled: ambientLayerEnabled,
  });

  // Notes are room life too: a played note (local or a peer's)
  // resets the idle clock, so the canvas never starts breathing
  // over the top of a performance.
  useEffect(() => noteBus.on(() => markActivity()), [markActivity]);

  // ---- Motion (Slice 12, "The Body's Sensors") ---------------------
  // The phone's gyro/tilt — the Oct 26 inventory's last unwired
  // sense — as a PER-LAYER feature ("Motion", THIS LAYER settings),
  // persisted in the same specific config as the ghost/ambient
  // toggles. UNLIKE those two, absent means OFF: sensors are the
  // body, and a layer starts still until its owner asks the body in.
  const motionLayerEnabled =
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.motionEnabled as boolean | undefined) === true;

  // The shake burst, shared by the local shake and the remote
  // render path so a shake looks identical on every screen: a
  // radial bloom — a ring of pushes exhaling from the center in
  // the shaker's hue, brighter and harder than an ambient bloom
  // (this one was DONE by someone, on purpose).
  const renderShakeBurst = useCallback(
    (x: number, y: number, color: { r: number; g: number; b: number }) => {
      const engine = engineRef.current;
      if (!engine) return;
      const ring = 8;
      for (let k = 0; k < ring; k++) {
        const ang = (k / ring) * Math.PI * 2;
        const mag = 150 + (k % 2) * 40;
        engine.splatAt(
          x + Math.cos(ang) * 0.05,
          y + Math.sin(ang) * 0.05,
          Math.cos(ang) * mag,
          Math.sin(ang) * mag,
          color
        );
      }
      engine.splatAt(x, y, 0, -60, color);
    },
    []
  );

  // A confirmed local shake (thresholded + debounced inside the
  // sensor hook): render the burst here, and send ONE event
  // through the ordinary funnel — session gating, hue stamp, and
  // sequencing all apply exactly as they do to a verb. The funnel
  // also ticks this phone's haptics (pressure > 0.7), so the
  // shaker feels their own shake land. Raw motion data is NOT
  // part of the payload; the event is all that travels.
  const fireShake = useCallback(() => {
    const hue = getIdentitySnapshot().self?.hue ?? 205;
    const color = hueDyeColor(hue, 0.95);
    renderShakeBurst(0.5, 0.5, color);
    sendRef.current({
      kind: "shake",
      position: { x: 0.5, y: 0.5 },
      force: { x: 0, y: 0 },
      pressure: 0.85,
      color,
    });
    ghostRef.current.noteUserActivity();
  }, [renderShakeBurst]);

  // Tilt steering + shake detection. Local only: the hook applies
  // tilt to THIS device's engine and reports shakes via fireShake;
  // its raw samples never leave the device (see the hook's laws).
  // Tilt marks activity through the same clock touch uses, so
  // ambient life yields to a leaning pool like it yields to a hand.
  const motionStatsRef = useDeviceMotion({
    engineRef,
    enabled: motionLayerEnabled,
    onActivity: markActivity,
    onShake: fireShake,
  });
  const ghostPeerIdRef = useRef("");
  ghostPeerIdRef.current = ghostPeerIdFor(userId);
  const broadcastGhost = useCallback(
    (payload: Omit<FluidInteraction, "userId" | "timestamp">) => {
      sendRef.current(payload, ghostPeerIdRef.current);
    },
    []
  );
  const ghostSelfHueRef = useRef(200);
  // Fabric awareness (Slice 23): the ghost's scenario snapshot and
  // its peer-side draw gate read where it is from THIS component's
  // own truths — the active experience (id + canvas kind), the
  // session store's role, and the fabric store's session rules.
  // The rules are resolved for THIS participant exactly as the
  // send funnel resolves them (fabricGate): a guest is bound by
  // the host's rules; a host is never bound by their own guest
  // rules; an open room has no rules at all.
  const experienceRef = useRef(state.activeExperience);
  experienceRef.current = state.activeExperience;
  const getGhostFabricContext = useCallback((): GhostFabricContext | null => {
    const exp = experienceRef.current;
    const s = sessionRef.current;
    const rules =
      s.role === "guest"
        ? getSessionFabricState().rules
        : { draw: true, verbs: true, notes: true };
    return {
      layer_id: exp?.id ?? "default-fluid",
      canvas:
        exp?.canvas === "stage3d"
          ? "stage3d"
          : exp?.type === "sam-see"
            ? "camera"
            : "fluid",
      role: s.role,
      in_session: s.role !== "open",
      rules,
    };
  }, []);
  // The DRAW tool's sink (Slice 23): the ghost hands over a built,
  // validated recipe; this canvas renders it (as itself — the
  // shared recipe player, so a ghost drawing takes the stage the
  // same way a composed one does) and ships it on the recipe
  // transport under the ghost's own peer id, through the same
  // draw gate every recipe send obeys. The real sink is assigned
  // below, once playRecipe exists; the wrapper is stable for the
  // ghost hook's option refs.
  const ghostDrawSinkRef = useRef<(recipe: Recipe) => void>(() => {});
  const onGhostDrawRecipe = useCallback((recipe: Recipe) => {
    ghostDrawSinkRef.current(recipe);
  }, []);
  const ghost = useGhostPeer({
    ownerId: userId,
    inject: injectRemoteInteraction,
    broadcast: broadcastGhost,
    humanPeers,
    layerEnabled: ghostLayerEnabled,
    getFabricContext: getGhostFabricContext,
    onDrawRecipe: onGhostDrawRecipe,
    onSfx: (kind) => {
      // Own ghost: sounds are pitched from its signature hue.
      sfxRef.current.play(kind, ghostSelfHueRef.current);
    },
  });
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  useEffect(() => {
    if (ghost.identity) ghostSelfHueRef.current = ghost.identity.hue;
  }, [ghost.identity]);

  // Per-ghost render-path tracking for visiting ghosts' sounds: last
  // position (sniff proximity), signature hue learned from their splat
  // colors, and activity bursts (play/chase onset).
  const ghostPosRef = useRef<Map<string, { x: number; y: number }>>(
    new Map()
  );
  const ghostHueRef = useRef<Map<string, number>>(new Map());
  const ghostBurstRef = useRef<
    Map<string, { count: number; start: number; lastCue: number }>
  >(new Map());

  /**
   * Slice 24: the Signature Heart motif (double-ring) — drawn
   * around a heart's landing point when its SENDER has the
   * motif equipped. Two concentric rings of small splats in the
   * heart's own color: a signature, not a bigger heart.
   */
  const renderSignatureHeartRing = (
    engine: LegacyFluidEngine,
    x: number,
    y: number,
    color: { r: number; g: number; b: number }
  ) => {
    for (const ringR of [0.034, 0.054]) {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        engine.splatAt(
          x + Math.cos(a) * ringR,
          y + Math.sin(a) * ringR,
          Math.cos(a) * 24,
          Math.sin(a) * 24,
          color,
          0.5
        );
      }
    }
  };

  /**
   * Slice 24: an equipped trail renders on a ghost's movement —
   * for the local ghost from this device's rewards record, for a
   * visiting ghost from its owner's announce (Slice 21's trail
   * field). Pure rendering: extra fading splats behind the
   * ghost's own, in the ghost's own color. The ghost's budget
   * paid for its movement; the trail is how that movement LOOKS
   * here, and costs the ghost nothing — expression, not volume.
   */
  const renderGhostTrail = (
    engine: LegacyFluidEngine,
    ghostUserId: string,
    i: FluidInteraction,
    prev: { x: number; y: number } | undefined
  ) => {
    const owner = ghostUserId.startsWith("ghost:")
      ? ghostUserId.slice("ghost:".length)
      : ghostUserId;
    const style =
      owner === userId
        ? getRewardsSnapshot().equipped.trail
        : (getPeerProfileExtras(owner)?.trail ?? null);
    if (!style || !i.color) return;
    const { x, y } = i.position;
    const color = i.color;
    if (style === "ribbon") {
      if (!prev) return;
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        engine.splatAt(
          prev.x + (x - prev.x) * t,
          prev.y + (y - prev.y) * t,
          0,
          0,
          color,
          0.8 - k * 0.18
        );
      }
    } else if (style === "sparkle") {
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.012 + Math.random() * 0.02;
        engine.splatAt(x + Math.cos(a) * r, y + Math.sin(a) * r, 0, -12, color, 0.4);
      }
    } else if (style === "petals") {
      for (let k = 0; k < 3; k++) {
        engine.splatAt(
          x + (Math.random() - 0.5) * 0.03,
          y + 0.014 + k * 0.012,
          6 * (Math.random() - 0.5),
          10,
          color,
          0.9 - k * 0.2
        );
      }
    } else if (style === "comet") {
      if (!prev) return;
      const dx = x - prev.x;
      const dy = y - prev.y;
      for (let k = 1; k <= 4; k++) {
        engine.splatAt(x - dx * k * 0.55, y - dy * k * 0.55, 0, 0, color, 0.85 - k * 0.16);
      }
    }
  };

  /** Slice 24: the Second Voice applies to MY ghost on MY device. */
  const sfxVoiceFor = (ghostUserId: string): "standard" | "second" =>
    ghostUserId === ghostPeerIdFor(userId) &&
    getRewardsSnapshot().equipped.voice
      ? "second"
      : "standard";

  const playVerbEffects = (verb: SensoryVerb, withSplat: boolean) => {
    if (withSplat) {
      const engine = engineRef.current;
      if (engine) {
        // A small two-way burst in the verb's color at canvas center.
        engine.splatAt(0.5, 0.5, 140, 70, verb.color);
        engine.splatAt(0.5, 0.5, -140, -50, verb.color);
        // Slice 24: my own hearts wear my Signature Heart motif
        // when I've earned and equipped it.
        if (
          verb.id === "heart" &&
          getRewardsSnapshot().equipped.heartMotif === "double-ring"
        ) {
          renderSignatureHeartRing(engine, 0.5, 0.5, verb.color);
        }
      }
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(verb.vibration);
    }
    const cue = cuesRef.current[verb.audioCue];
    if (typeof cue === "function") cue();
  };

  // ---- Agent Shapes (Slice 15) ---------------------------------------
  // A recipe renders HERE, on the same splat seam pattern splats use
  // (engine.splatAt, locally). It never renders by broadcasting its
  // splats: the sender ships ONE fabric-recipe message and every
  // device cooks its own copy. dispatchRecipeSplat is the player's
  // sink — a playing recipe is real room activity (Slice 7's clock
  // moves, ambient stands down) and the ghost brain hears it like
  // any performance.
  const dispatchRecipeSplat = useCallback(
    (splat: RecipeSplat) => {
      markActivity();
      const color = hueToRgb(splat.hue, 0.85);
      engineRef.current?.splatAt(
        splat.x,
        splat.y,
        splat.forceX,
        splat.forceY,
        color,
        splat.radiusScale
      );
      ghostRef.current.noteUserActivity();
    },
    [markActivity]
  );

  /**
   * Play a recipe on this canvas. `send` is true for locally
   * originated playback (a fresh composition, a Studio replay):
   * the hook's sendRecipe ships the one compact message under the
   * session gate, so a gated guest's replay renders here and goes
   * nowhere — the recipe mirror of pattern-step semantics. `send`
   * is false for recipes that ARRIVED from a peer: rendering only,
   * never re-broadcast (no echo, ever).
   */
  const playRecipe = useCallback(
    (recipe: Recipe, opts: { send: boolean; defaultHue?: number }) => {
      patternPlayer.stop();
      recipePlayer.play(recipe, dispatchRecipeSplat, {
        defaultHue: opts.defaultHue,
      });
      if (opts.send) sendRecipeRef.current(recipe);
    },
    [dispatchRecipeSplat]
  );
  const playRecipeRef = useRef(playRecipe);
  playRecipeRef.current = playRecipe;
  // Slice 23: the ghost's draw sink, now that playRecipe exists —
  // render the ghost's recipe here (send: false; the transport
  // send below is the ghost's own, under its peer id).
  ghostDrawSinkRef.current = (recipe: Recipe) => {
    playRecipeRef.current(recipe, {
      send: false,
      defaultHue: ghostSelfHueRef.current,
    });
    sendGhostRecipeRef.current(recipe, ghostPeerIdRef.current);
  };

  // Inbound recipes: the hook validated them and handed them over
  // on the recipe bus. The sender's signature hue (when a step
  // doesn't carry its own) is the dye default — a peer's shapes
  // arrive in the peer's color, like their strokes do (Slice 6).
  useEffect(
    () =>
      recipeBus.subscribe((recipe, from) => {
        playRecipeRef.current(recipe, {
          send: false,
          defaultHue: getPeerIdentity(from)?.hue,
        });
      }),
    []
  );

  /**
   * Effects for a ghost-authored interaction on the render path. The
   * splat itself is rendered by the caller exactly like any remote.
   * Consent: if the user turned their ghost off, a visiting ghost's
   * sensations are muted locally (its splats still render — presence
   * visible, sensations optional). Sounds come from the ghost SFX layer
   * (hue-pitched, rate-limited) instead of the generic UI cues.
   */
  const handleGhostRenderFx = (i: FluidInteraction) => {
    const hue = ghostHueRef.current.get(i.userId) ?? 28;
    // Slice 24: the acting ghost's voice on this device — the
    // Second Voice power-up applies to my own ghost, here only.
    const voice = sfxVoiceFor(i.userId);
    if (!i.verb) {
      if (i.color) {
        ghostHueRef.current.set(i.userId, hueFromColor(i.color));
      }
      // Sniff heuristic: a small soft splat landing right next to a
      // DIFFERENT ghost is a greeting sniff — chirp for the sniffer.
      if (i.pressure <= 0.36) {
        ghostPosRef.current.forEach((pos, otherId) => {
          if (otherId === i.userId) return;
          const dx = pos.x - i.position.x;
          const dy = pos.y - i.position.y;
          if (dx * dx + dy * dy < 0.07 * 0.07) {
            sfxRef.current.play("sniff", hue, { distance: 0.3, voice });
          }
        });
      }
      const prevGhostPos = ghostPosRef.current.get(i.userId);
      ghostPosRef.current.set(i.userId, {
        x: i.position.x,
        y: i.position.y,
      });
      // Slice 24: the ghost's equipped trail, rendered behind its
      // movement (see renderGhostTrail — rendering only).
      if (engineRef.current) {
        renderGhostTrail(engineRef.current, i.userId, i, prevGhostPos);
      }
      // Play/chase onset: a burst of splats after quiet reads as play.
      const now = Date.now();
      const burst = ghostBurstRef.current.get(i.userId) ?? {
        count: 0,
        start: now,
        lastCue: 0,
      };
      if (now - burst.start > 600) {
        burst.count = 0;
        burst.start = now;
      }
      burst.count += 1;
      if (burst.count === 4 && now - burst.lastCue > 4_000) {
        burst.lastCue = now;
        sfxRef.current.play("play", hue, { distance: 0.3, voice });
      }
      ghostBurstRef.current.set(i.userId, burst);
      return;
    }

    const verb = getVerbById(i.verb);
    // Muted when the user turned their ghost off (preference) or when
    // this layer has the ghost feature off (per-layer toggle).
    if (!verb || !ghostRef.current.enabled || !ghostLayerEnabled) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(verb.vibration);
    }
    if (verb.id === "purr") {
      sfxRef.current.startPurr(hue, voice);
    } else if (verb.id === "heart") {
      sfxRef.current.play("heart", hue, { voice });
    } else if (verb.id === "cheer") {
      sfxRef.current.play("play", hue, { voice });
    } else if (verb.id === "tickle") {
      sfxRef.current.play("mirror", hue, { voice });
    }
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    let engine: LegacyFluidEngine | null = null;
    const reportEngineError = (message: string) => {
      setEngineError(message);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("fabric:engine-error", { detail: message })
        );
      }
    };
    try {
      engine = new LegacyFluidEngine(canvasRef.current, containerRef.current);
    } catch (err) {
      // WebGL unavailable — leave onReady unfired; ExperienceRenderer's
      // fallback timeout still sets the ready flag. Hotfix 1.3: also
      // tell the user (notice below) instead of only the console.
      console.warn("[LegacyFluid] Engine failed to initialize:", err);
      reportEngineError("The canvas engine couldn't start on this device.");
      return;
    }
    engineRef.current = engine;
    // Slice 5: honor the current session input gate from birth (a
    // view-only guest who reloads mid-session starts disabled).
    engine.localInputEnabled = sessionRef.current.inputEnabled;
    // Slice 6: same from-birth honesty for the identity hue (the
    // subscription above keeps it current from then on).
    engine.localHue = getIdentitySnapshot().self?.hue ?? null;
    // Hotfix 2.4: same from-birth honesty for the See layer's
    // compositing — entering the app ON See starts with the camera
    // already beneath a transparent fluid (the watcher below keeps
    // it current across switches; the canvas never remounts).
    engine.transparentBackdrop = experienceRef.current?.id === "sam-see";
    engine.onError = reportEngineError;
    engine.onLocalInteraction = (interaction) => {
      // Hotfix 1.9: engine stroke points opt into the funnel's
      // ~30ms coalescing window (hard hold cap 50ms) — this is the
      // one high-rate stream in the app; verbs, pattern steps and
      // ghost gestures keep their immediate event path.
      const full = sendRef.current(interaction, undefined, { batch: true });
      // Slice 7: a real local touch — the ambient driver stands down.
      markActivity();
      // Slice 24 (Pet Whisperer): a stroke landing on a sensed
      // OTHER ghostie is a pet given, counted by ghostie. The
      // owner's own GhostPeer decides separately whether it
      // LANDS as one (its courtesy gates) — this counter is the
      // petter's truth: my hand, their ghostie. The sniff
      // heuristic's radius is the touch radius.
      ghostPosRef.current.forEach((pos, gid) => {
        if (gid === ghostPeerIdFor(userId)) return;
        const dx = pos.x - full.position.x;
        const dy = pos.y - full.position.y;
        if (dx * dx + dy * dy < 0.07 * 0.07) recordPetGiven(gid);
      });
      // Feed the local user's touch to the ghost brain (it mirrors,
      // answers rhythms, notices petting, startles, sleeps/wakes).
      ghostRef.current.noteLocalInteraction(full);
    };
    onReadyRef.current?.();
    return () => {
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  // Hotfix 2.4: the See layer's compositing follows the active
  // experience — on See, the fluid renders transparent over the
  // camera background; everywhere else it paints its own opaque
  // backdrop exactly as before. A flag flip on the one persistent
  // engine, never a remount.
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.transparentBackdrop =
        state.activeExperience?.id === "sam-see";
    }
  }, [state.activeExperience?.id]);

  // Hotfix 1.5: poll the engine's telemetry while diagnostics mode
  // is on (see diagEnabled above). Zero cost when off — the effect
  // returns before creating the interval.
  // Hotfix 1.6: the same poll also reads the signaling singleton (the
  // instance useWebRTC already created; getSignalingService() returns
  // it without side effects) so the panel can show the resolved URL
  // and connection state next to the engine numbers.
  useEffect(() => {
    if (!diagEnabled()) return;
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (engine) setDiagStats(engine.getStats());
      const sig = getSignalingService();
      setDiagSig({ url: sig.getServerUrl(), state: sig.getState() });
      // Slice 7: is the canvas breathing on its own, waiting for
      // quiet, switched off by the layer, or rested by the ladder?
      setDiagAmbient({ ...ambientStatsRef.current });
      // Hotfix 1.8: shared audio context state, same screenshot.
      setDiagAudio(getAudioContextState());
      // Hotfix 2.0: p2p / relay / p2p+relay / —, same screenshot.
      setDiagPath(getActiveTransportPath());
      // Slice 12: sensor state, same screenshot (see above).
      setDiagMotion({ ...motionStatsRef.current });
      // Ghost Brain: which brain decided last, what, and how long ago.
      const brain = getGhostPublicState().brain;
      setDiagBrain(
        brain
          ? `${brain.tierLabel} · ${brain.lastText} · ${Math.max(0, Math.round((Date.now() - brain.lastAt) / 1000))}s ago`
          : "—"
      );
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Outgoing sensory verbs: the VerbBar dispatches FABRIC_VERB_EVENT.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVerb = (ev: Event) => {
      // Slice 5: a view-only guest's verbs are disabled outright —
      // no send (the hook would gate it anyway) and no local splat:
      // an audience member's tap must not paint even their own
      // canvas with a verb burst. Mirror guests fall through: their
      // verb renders locally and the send gate keeps it home.
      if (!sessionRef.current.inputEnabled) return;
      const verb = getVerbById((ev as CustomEvent<string>).detail);
      if (!verb) return;
      markActivity();
      sendRef.current(verbInteraction(verb));
      playVerbEffects(verb, true);
      ghostRef.current.noteUserActivity();
      // Slice 24 (Heartfelt): a heart that actually LEAVES this
      // device (the session mode gate lets it send) toward the
      // humans present counts toward the badge — one per
      // recipient per minute, deduped in the rewards reducer, so
      // leaning on the button earns nothing extra. Composed
      // pattern hearts (dispatchStep) are performances, not
      // hand-sent hearts, and never arrive here.
      if (verb.id === "heart" && sessionRef.current.canSend) {
        const s = getSessionPublicState();
        const recipients = [
          ...s.guestIds,
          ...(s.hostId && s.hostId !== userId ? [s.hostId] : []),
        ].filter((id) => id !== userId);
        recordHeartSent(recipients, userId);
      }
    };
    window.addEventListener(FABRIC_VERB_EVENT, onVerb as EventListener);
    return () => window.removeEventListener(FABRIC_VERB_EVENT, onVerb as EventListener);
  }, []);

  // Slice 21: petting a peer's ghostie from their profile card.
  // The card dispatches FABRIC_PET_GHOST_EVENT with the primary's
  // userId; the answer is the ordinary pet path and nothing else:
  // three gentle strokes swept across the ghost's last-sensed
  // position on THIS canvas, sent through the funnel like any
  // hand stroke (mode gate + draw rule inside sendInteraction)
  // and rendered locally the way pattern splats render. On the
  // primary's device, their GhostPeer registers the strokes as
  // remote pets — or refuses them under their "Accept pets from
  // others" setting. If the ghost isn't sensed here (not out, or
  // gone stale), there is nowhere honest for a pet to land and
  // the request simply does nothing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const onPetGhost = (ev: Event) => {
      if (!sessionRef.current.inputEnabled) return;
      const ownerId = (ev as CustomEvent<string>).detail;
      if (typeof ownerId !== "string" || !ownerId || ownerId === userId) return;
      const pos = ghostRef.current.otherGhostPosition(
        ghostPeerIdFor(ownerId)
      );
      if (!pos) return;
      markActivity();
      const hue = getIdentitySnapshot().self?.hue ?? 205;
      const color = hueDyeColor(hue, 0.95);
      for (let k = 0; k < 3; k++) {
        const sweep = k / 2 - 0.5; // -0.5 .. 0.5 across the ghost
        const interaction: Omit<FluidInteraction, "userId" | "timestamp"> = {
          position: {
            x: clamp01(pos.x + sweep * 0.07),
            y: clamp01(pos.y + Math.sin(k * 1.7) * 0.012),
          },
          force: { x: k === 1 ? 90 : 40, y: 0 },
          pressure: 0.55,
          color,
        };
        const full = sendRef.current(interaction);
        engineRef.current?.splatAt(
          interaction.position.x,
          interaction.position.y,
          interaction.force.x,
          interaction.force.y,
          color
        );
        ghostRef.current.noteLocalInteraction(full);
      }
      // Slice 24 (Pet Whisperer): the pet was given — count the
      // ghostie (distinctness is the badge; the reducer keeps
      // the set).
      recordPetGiven(ghostPeerIdFor(ownerId));
      ghostRef.current.noteUserActivity();
    };
    window.addEventListener(FABRIC_PET_GHOST_EVENT, onPetGhost as EventListener);
    return () => window.removeEventListener(FABRIC_PET_GHOST_EVENT, onPetGhost as EventListener);
  }, []);

  // Slice 24: Warm Welcome. The rewards feed dispatches
  // FABRIC_WARM_WELCOME_EVENT when a guest joins this client's
  // hosted session and the power-up is earned; the answer is the
  // ghost's own warmWelcome — a greeting that spends from its
  // ordinary emit budget and simply doesn't happen when the
  // budget (or the ghost) can't pay. The verb is the primary's
  // chosen greeting, carried in the event detail.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onWarmWelcome = (ev: Event) => {
      const verb = (ev as CustomEvent<string>).detail;
      if (verb !== "heart" && verb !== "cheer" && verb !== "tickle") return;
      ghostRef.current.warmWelcome(verb);
    };
    window.addEventListener(FABRIC_WARM_WELCOME_EVENT, onWarmWelcome as EventListener);
    return () => window.removeEventListener(FABRIC_WARM_WELCOME_EVENT, onWarmWelcome as EventListener);
  }, []);

  // Hotfix 2.5: the browser refused the compose bar's microphone.
  // The moment gets the same living answer as an unshapeable ask
  // (Hotfix 2.4) — the ghost's puzzlement, its curious ear-tilt —
  // when a ghost is present to perform it. expressPuzzlement is
  // presence-gated and budget-counted like any act; with no ghost
  // out, the bar's caption carries the moment alone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVoiceUnheard = () => {
      ghostRef.current.expressPuzzlement();
    };
    window.addEventListener(FABRIC_VOICE_UNHEARD_EVENT, onVoiceUnheard);
    return () => window.removeEventListener(FABRIC_VOICE_UNHEARD_EVENT, onVoiceUnheard);
  }, []);

  // ---- Pattern composer (Slice 4) --------------------------------------
  // The HUD's ComposeBar dispatches FABRIC_COMPOSE_EVENT with a
  // plain-language prompt. Composition lives here because this
  // component owns the transport: PatternComposer turns the prompt
  // into a validated Pattern (Muse Spark via the existing LLMService
  // config, or a built-in offline pattern), and patternPlayer
  // dispatches its steps through the sinks below —
  //   verb steps:  sendInteraction(verbInteraction) + playVerbEffects,
  //                the exact path the VerbBar uses, so every peer feels
  //                the verb's vibration + cue through their remote path.
  //   splat steps: sendInteraction + a local engine.splatAt with the
  //                same fields, so this canvas renders what peers
  //                render from the broadcast interaction.
  //   haptic steps: local navigator.vibrate only. The transport has
  //                no haptic-only payload (a verb-less interaction
  //                would paint dye on peers); verbs are the broadcast
  //                haptic channel.
  // Playback state is relayed to the HUD on FABRIC_COMPOSE_STATE_EVENT;
  // FABRIC_COMPOSE_STOP_EVENT cancels globally via the shared player.
  //
  // Slice 15 extends the same effect with the second vocabulary:
  // drawing prompts compose into Recipes (composeWithShapes), which
  // render through the recipe player + dispatchRecipeSplat above and
  // broadcast as ONE fabric-recipe transport message — the splats
  // are cooked locally on every device, never shipped.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const publishState = (name: string | null) => {
      window.dispatchEvent(
        new CustomEvent(FABRIC_COMPOSE_STATE_EVENT, { detail: name })
      );
    };
    patternPlayer.setStateListener(publishState);
    // Slice 15: recipes report through the same state channel — the
    // HUD's "Playing: <name>" + Stop cover both vocabularies, and
    // starting one performance stops the other (below).
    recipePlayer.setStateListener(publishState);

    const dispatchStep = (step: PatternStep) => {
      // Slice 7: a composed/performed pattern is real activity —
      // ambient life stands down while the room is being played to.
      markActivity();
      if (step.kind === "verb") {
        const verb = step.verbId ? getVerbById(step.verbId) : undefined;
        if (!verb) return;
        sendRef.current(verbInteraction(verb));
        playVerbEffects(verb, true);
      } else if (step.kind === "splat") {
        const color = hueToRgb(step.hue ?? 200, step.intensity);
        const interaction: Omit<FluidInteraction, "userId" | "timestamp"> = {
          position: { x: step.x ?? 0.5, y: step.y ?? 0.5 },
          force: { x: 0, y: -((step.radius ?? 0.3) * 220) },
          pressure: step.intensity,
          color,
        };
        sendRef.current(interaction);
        engineRef.current?.splatAt(
          interaction.position.x,
          interaction.position.y,
          interaction.force.x,
          interaction.force.y,
          color
        );
      } else {
        const haptic = getHapticPattern(step.hapticId);
        if (haptic && typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(haptic);
        }
      }
      ghostRef.current.noteUserActivity();
    };

    const onCompose = (ev: Event) => {
      const prompt = (ev as CustomEvent<string>).detail;
      if (typeof prompt !== "string" || !prompt.trim()) return;
      void (async () => {
        // Slice 17: a heartbeat request addressed to the ghost is
        // answered BY the ghost, not by the generic interpreter. It
        // performs through GhostPeer's own emit machinery (budgets,
        // presence gates and session broadcast rules unchanged) at
        // a tempo derived from its live temperament + arousal. The
        // brain line records the answer via the peer's performance
        // callback. If the ghost is off or cannot act, the generic
        // interpreter still gets the request.
        if (
          isGhostHeartbeatRequest(
            prompt,
            ghostRef.current.identity?.name ?? null
          )
        ) {
          const bpm = ghostRef.current.answerHeartbeat();
          if (bpm !== null) {
            // Slice 24 (Pattern Mind): an answer was performed.
            recordAgentAnswer();
            window.dispatchEvent(
              new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
                detail: "ghost",
              })
            );
            publishState(
              `${ghostRef.current.identity?.name ?? "Ghost"}'s heartbeat · ${bpm} BPM`
            );
            return;
          }
        }

        // Slice 23 ("say-it"): a verb named TO the ghost — "tickle,
        // Boop" — is performed BY the ghost as its own act (the
        // verb-perform tool), through GhostPeer's verb machinery:
        // the shared verb clock, the session degrade, the emit
        // budgets. Not the generic interpreter, and not a macro —
        // the ghost decides how its verbs go out, like everything
        // else it does. If the ghost is off or cannot act, the
        // generic interpreter still gets the request, as with the
        // heartbeat route above. Heartbeat asks never reach here:
        // ghostVerbAsk excludes them by construction.
        const verbAsk = ghostVerbAsk(
          prompt,
          ghostRef.current.identity?.name ?? null
        );
        if (verbAsk) {
          const performed = ghostRef.current.answerVerb(verbAsk);
          if (performed) {
            // Slice 24 (Pattern Mind): an answer was performed.
            recordAgentAnswer();
            window.dispatchEvent(
              new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
                detail: "ghost",
              })
            );
            publishState(
              `${ghostRef.current.identity?.name ?? "Ghost"} · ${performed} on request`
            );
            return;
          }
        }

        // Slice 15/17: one entry, two performance vocabularies —
        // composeWithShapes asks a resolved cloud model to invent
        // the answer, degrades to generative built-in performances,
        // and otherwise routes drawing prompts to recipes and the
        // rest to the Slice 4 pattern path.
        const outcome = await composeWithShapesDetailed(prompt);
        const result = outcome.result;
        if (!result) {
          // Hotfix 2.4 (the living fallback): a request nobody could
          // shape is answered by the fabric's LIFE, never by an
          // error caption — the "beyond the interpreter" strings are
          // gone from user-facing copy. The local ghost performs
          // puzzlement through its own emit machinery (curious
          // drift toward the asker + a question-ripple in its hue;
          // budget-counted and presence-gated like any act, and it
          // never pretends to perform the ask). When the ghost is
          // off or cannot act, the fabric itself ripples once,
          // gently, in the user's hue. The source event carries
          // which happened (and the ghost's name) so the bar can
          // caption the moment in-world. Successful interpretations
          // keep their honest source credits, untouched above.
          const puzzled = ghostRef.current.expressPuzzlement();
          if (!puzzled) {
            const hue = getIdentitySnapshot().self?.hue ?? 200;
            engineRef.current?.splatAt(0.5, 0.47, 0, -42, hueToRgb(hue, 0.5), 0.8);
            engineRef.current?.splatAt(0.5, 0.47, 26, -18, hueToRgb(hue, 0.3), 0.5);
          }
          window.dispatchEvent(
            new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
              detail: {
                source: "puzzled",
                ghostName: puzzled
                  ? (ghostRef.current.identity?.name ?? null)
                  : null,
              },
            })
          );
          publishState(null);
        } else if (result.kind === "recipe") {
          // Slice 24 (Pattern Mind): an answer was performed.
          recordAgentAnswer();
          window.dispatchEvent(
            new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
              detail: result.recipe.source,
            })
          );
          playRecipeRef.current(result.recipe, {
            send: true,
            defaultHue: getIdentitySnapshot().self?.hue,
          });
        } else {
          // Slice 24 (Pattern Mind): an answer was performed.
          recordAgentAnswer();
          window.dispatchEvent(
            new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
              detail: result.pattern.source,
            })
          );
          recipePlayer.stop();
          patternPlayer.play(result.pattern, dispatchStep);
        }
      })();
    };
    // Slice 5 "Share live": play an already-composed Pattern into
    // the room. Same dispatchStep as a fresh composition, so verb /
    // splat steps broadcast through sendInteraction — under session
    // enforcement, the host's shared pattern reaches every guest,
    // while a gated guest's replay stays on their own canvas.
    const onPlayPattern = (ev: Event) => {
      const p = (ev as CustomEvent<Pattern>).detail;
      if (!p || typeof p.name !== "string" || !Array.isArray(p.steps)) return;
      recipePlayer.stop();
      patternPlayer.play(p, dispatchStep);
    };
    // Slice 15: play an already-validated Recipe (Studio replay,
    // menu share-live). Re-validated at the door anyway — nothing
    // unvalidated renders, whatever handed it over. Renders locally
    // and ships the one gated recipe message (playRecipe, send).
    const onPlayRecipe = (ev: Event) => {
      const raw = (ev as CustomEvent<Recipe>).detail;
      if (!raw || typeof raw !== "object") return;
      const recipe = validateRecipe(
        raw,
        raw.source === "builtin" ? "builtin" : "llm"
      );
      if (!recipe) return;
      playRecipeRef.current(recipe, {
        send: true,
        defaultHue: getIdentitySnapshot().self?.hue,
      });
    };
    const onStop = () => {
      patternPlayer.stop();
      recipePlayer.stop();
    };
    window.addEventListener(FABRIC_COMPOSE_EVENT, onCompose as EventListener);
    window.addEventListener(FABRIC_COMPOSE_STOP_EVENT, onStop);
    window.addEventListener(FABRIC_PLAY_PATTERN_EVENT, onPlayPattern as EventListener);
    window.addEventListener(FABRIC_PLAY_RECIPE_EVENT, onPlayRecipe as EventListener);
    return () => {
      window.removeEventListener(FABRIC_COMPOSE_EVENT, onCompose as EventListener);
      window.removeEventListener(FABRIC_COMPOSE_STOP_EVENT, onStop);
      window.removeEventListener(FABRIC_PLAY_PATTERN_EVENT, onPlayPattern as EventListener);
      window.removeEventListener(FABRIC_PLAY_RECIPE_EVENT, onPlayRecipe as EventListener);
      patternPlayer.stop();
      patternPlayer.setStateListener(null);
      recipePlayer.stop();
      recipePlayer.setStateListener(null);
    };
  }, []);

  // Incoming remote interactions -> splats (+ verb haptics/audio).
  // Ghost-authored interactions (including this client's own ghost,
  // injected locally) take the same splat path; only their effects and
  // the brain feed differ.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    remoteInteractions.forEach((i: FluidInteraction) => {
      // Hotfix 1.9: dedupe on the sender's sequence when present —
      // (userId, timestamp) collided for two pointers landing in
      // the same millisecond, silently dropping the second point.
      // Older senders carry no seq and keep the timestamp key.
      const key = `${i.userId}:${i.seq ?? i.timestamp}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      // Bound the set between the hook's window drains: with seq
      // keys a long session could otherwise grow it point by point
      // (the clear below only fires on an empty window). 4096 keys
      // is far beyond any 1s window's population.
      if (seenRef.current.size > 4096) seenRef.current.clear();
      // Slice 7: anything genuinely arriving — a peer's stroke, a
      // verb, a pattern splat, a ghost's gesture (they all enter
      // through this path) — is real activity; ambient yields.
      markActivity();
      const isGhost = isGhostPeerId(i.userId);
      // Slice 6: a human sender's splats are TINTED by their
      // signature hue — the stamp on the interaction when present,
      // else the hue learned from their announce. The tint rotates
      // the splat's own color part-way toward the hue at its own
      // intensity (never a flat replace), so a person's strokes are
      // recognizably theirs while composed patterns keep their art.
      // Ghost splats are untouched: a ghost's color IS its identity,
      // already hue-true from its brain.
      let splatColor = i.color;
      if (!isGhost) {
        const hue =
          typeof i.hue === "number"
            ? i.hue
            : getPeerIdentity(i.userId)?.hue;
        if (typeof hue === "number") {
          splatColor = i.color
            ? tintColorTowardHue(i.color, hue)
            : hueDyeColor(hue);
          // The peer voice: fire on stroke onset (first splat after
          // a quiet gap from this sender), pitched by their hue.
          // Verbs keep their own dedicated cues below; this is the
          // sound of a hand arriving on the shared canvas.
          if (!i.verb) {
            const now = Date.now();
            const last = peerStrokeRef.current.get(i.userId) ?? 0;
            peerStrokeRef.current.set(i.userId, now);
            if (now - last > 700) sfxRef.current.playPeer(hue);
          }
        }
      }
      // Slice 12: a peer's shake arrives as ONE event (kind:
      // "shake") — render it as what it was: a radial bloom in the
      // shaker's hue at the event's center, plus a short vibration
      // so the room FEELS the shake, not just sees it. Only the
      // event ever crossed the wire; the sender's raw motion data
      // stayed on their phone. Ghost ids never originate it (the
      // sensor hook is a local human input), and an unknown future
      // kind falls through to the plain splat below, unharmed.
      if (i.kind === "shake" && !isGhost) {
        renderShakeBurst(
          i.position.x,
          i.position.y,
          splatColor ?? hueDyeColor(205, 0.95)
        );
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(60);
        }
        ghostRef.current.noteRemoteInteraction(i);
        return;
      }
      engine.splatAt(i.position.x, i.position.y, i.force.x, i.force.y, splatColor, i.radiusScale ?? 1);
      // Slice 24: a remote human's heart wears THEIR Signature
      // Heart motif when their announce says they've equipped it
      // — the ring is drawn here, on the receiving canvas, keyed
      // on the sender the verb event already carries.
      if (!isGhost && i.verb === "heart" && splatColor) {
        if (getPeerProfileExtras(i.userId)?.motif === "double-ring") {
          renderSignatureHeartRing(engine, i.position.x, i.position.y, splatColor);
        }
      }
      if (isGhost) {
        setGhostPublicState({ sessionGhostLastSeenAt: Date.now() });
        // Other ghosts feed the brain's social perception; the brain
        // itself ignores this client's own ghost id here.
        ghostRef.current.noteRemoteInteraction(i);
        handleGhostRenderFx(i);
      } else {
        // In session mode the ghost brain hears every human peer too,
        // so a summoned ghost reacts to anyone, not just its owner.
        ghostRef.current.noteRemoteInteraction(i);
        if (i.verb) {
          const verb = getVerbById(i.verb);
          if (verb) playVerbEffects(verb, false);
        }
      }
    });
    // The hook prunes remote entries after ~1s; once drained, reset the
    // dedupe set so it cannot grow without bound.
    if (remoteInteractions.length === 0) seenRef.current.clear();
  }, [remoteInteractions]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "transparent",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
      />
      {/* Hotfix 1.5: diagnostics telemetry panel (diag mode only).
          pointerEvents none by design — it observes the input path,
          it must never join it. */}
      {diagStats ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            zIndex: 6,
            pointerEvents: "none",
            background: "rgba(2,8,23,0.88)",
            border: "1px solid rgba(34,211,238,0.45)",
            borderRadius: 10,
            padding: "8px 10px",
            color: "#e5e7eb",
            fontSize: 11,
            lineHeight: 1.55,
            fontFamily: "monospace",
            whiteSpace: "pre",
          }}
        >
          {`FABRIC ENGINE · diag
format  ${diagStats.format}
fps     ${diagStats.fps} (engine loop) · dpr ${diagStats.dpr} · rung ${diagStats.degradeRung}
input   ${diagStats.inputEvents} events → ${diagStats.pointerSplats} local splats
api     ${diagStats.apiSplats} remote/ghost splats
error   ${diagStats.lastError ?? "—"}
signal  ${diagSig ? `${diagSig.state} · ${diagSig.url ?? "none"}` : "…"}
path    ${diagPath}
audio   ${diagAudio}
who     ${(() => {
            const snap = getIdentitySnapshot();
            const named = Object.values(snap.peers)
              .map((p) => `${p.name || "?"}·${p.hue}°`)
              .join(", ");
            return `you ${snap.self ? `${snap.self.name}·${snap.self.hue}°` : "…"}${named ? ` | peers ${named}` : ""}`;
          })()}
ambient ${diagAmbient ? `${diagAmbient.state} · ${diagAmbient.breaths} breaths · ${diagAmbient.gestures} gestures` : "…"}
motion  ${diagMotion ? `${diagMotion.state} · tilt ${diagMotion.tiltX.toFixed(2)},${diagMotion.tiltY.toFixed(2)} · ${diagMotion.shakes} shakes` : "…"}
brain   ${diagBrain}`}
        </div>
      ) : null}
      {/* Hotfix 1.3: visible, dismissible engine-failure notice, styled
          to match the HUD (ExperienceHUD: rgba(2,8,23) panel, cyan
          border, #e5e7eb text). Only ever renders after a real engine
          failure — init throw or a persistently failing frame loop. */}
      {engineError && !engineErrorDismissed ? (
        <div
          role="alert"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 5,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "rgba(2,8,23,0.88)",
            border: "1px solid rgba(34,211,238,0.45)",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          <span style={{ flex: 1, color: "#e5e7eb", fontSize: 12, lineHeight: 1.45 }}>
            {engineError} The fluid background is off — controls still work,
            and peers will still feel your verbs.
          </span>
          <button
            type="button"
            aria-label="Dismiss canvas warning"
            onClick={() => setEngineErrorDismissed(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#93c5fd",
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
              padding: 2,
            }}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
