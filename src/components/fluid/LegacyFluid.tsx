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
  loadLLMConfig,
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
  ghostNoteAsk,
  ghostPeerIdFor,
  ghostUtteranceClaim,
  ghostVerbAsk,
  isGhostHeartbeatRequest,
  isGhostPeerId,
} from "../../ghost/GhostPeer";
import type { GhostFabricContext } from "../../ghost/GhostBrain";
import { isGhostNoteLayer } from "../../ghost/GhostBrain";
import { useGhostSfx, hueFromColor } from "../../ghost/useGhostSfx";
import { publishGhostMusicPhrase } from "../../ghost/ghostMusicStore";
import { performForgeDecision } from "../forge/forgePerformer";
import { fetchFirstMusicPackSeed } from "../../ghost/midiPhrase";
import { vibrate } from "../../sensory/vibration";
import { resolveGhostLayerEnabled } from "../../ghost/ghostShared";
import { useGhostSharedSettings } from "../../ghost/ghostSharedPref";
import {
  getHostArrivedFabric,
  getSessionFabricState,
} from "../../session/fabricStore";
import {
  setGhostPublicState,
  getGhostPublicState,
  FABRIC_GHOST_ENCOUNTER_EVENT,
  FABRIC_PET_GHOST_EVENT,
  FABRIC_VOICE_ATTENTION_EVENT,
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
  hueCss,
  hueDyeColor,
} from "../../identity/identityStore";
import { useAmbientLife, type AmbientLifeStats } from "./useAmbientLife";
import {
  useDeviceMotion,
  type MotionStats,
} from "../../sensors/useDeviceMotion";
import {
  FABRIC_SEE_HIGHLIGHT_EVENT,
  boxCenter,
  imageBoxToCanvas,
  parseSeeAct,
  ringFitFor,
  touchRadiusFor,
  type SeeAct,
} from "../../sam/seeActs";
import { segmentPhrase } from "../../sam/segmentation";
import { noteGroundingWanted } from "../../sam/deviceGrounding";
import { getSamCameraSnapshot } from "../../sam/samCameraStore";
import { noteBus } from "../../../shared/utils/noteBus";
import { getAudioContextState } from "../../audio/sharedAudio";
import {
  FABRIC_GESTURE_EVENT,
  FABRIC_HAND_INPUT_EVENT,
  FABRIC_HAND_SIGN_EVENT,
  getHandsSnapshot,
  subscribeHands,
  type GestureDetail,
  type HandInputDetail,
  type HandSignDetail,
} from "../../hands/handsStore";
import {
  ensureControllerLoaded,
  getControllerSnapshot,
  subscribeController,
  tiltInteractionFor,
  type ControllerSnapshot,
} from "../../sensors/controllerStore";
import ControllerSurface from "./ControllerSurface";
import {
  getFluidBackdropSnapshot,
  subscribeFluidBackdrop,
} from "./fluidBackdropStore";
import GenxLayer from "../genx/GenxLayer";
import PlaygroundLayer from "../playground/PlaygroundLayer";
import { subscribeGenx } from "../../genx/genxStore";

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
  // Slice 44 (chrome discipline): the engine-failure notice
  // fades/rises in over 280ms (the tokens' base motion step)
  // instead of popping, and it no longer sits in the HUD's
  // bottom band — see its style below.
  const [engineNoticeIn, setEngineNoticeIn] = useState(false);
  useEffect(() => {
    if (engineError && !engineErrorDismissed) {
      const raf = requestAnimationFrame(() => setEngineNoticeIn(true));
      return () => cancelAnimationFrame(raf);
    }
    setEngineNoticeIn(false);
    return undefined;
  }, [engineError, engineErrorDismissed]);
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
    sendGenx,
    sendChorale,
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

  // Slice 34 (Layer B3): this device's controller stance. The
  // store is the truth (device-local, persisted); the ref mirrors
  // it for the callbacks below, which are built once and must see
  // the CURRENT role at fire time, not at build time.
  const [controllerSnap, setControllerSnap] = useState<ControllerSnapshot>(
    () => getControllerSnapshot()
  );
  useEffect(() => {
    ensureControllerLoaded();
    return subscribeController(setControllerSnap);
  }, []);
  const isController = controllerSnap.role === "controller";
  const controllerRef = useRef(false);
  controllerRef.current = isController;

  // A confirmed local shake (thresholded + debounced inside the
  // sensor hook): render the burst here, and send ONE event
  // through the ordinary funnel — session gating, hue stamp, and
  // sequencing all apply exactly as they do to a verb. The funnel
  // also ticks this phone's haptics (pressure > 0.7), so the
  // shaker feels their own shake land. Raw motion data is NOT
  // part of the payload; the event is all that travels.
  // Slice 34: a CONTROLLER's shake is for the room — it sends
  // through the same funnel but does not bloom on its own dark
  // surface (the other screens render it via the remote path).
  const fireShake = useCallback(() => {
    const hue = getIdentitySnapshot().self?.hue ?? 205;
    const color = hueDyeColor(hue, 0.95);
    if (!controllerRef.current) {
      renderShakeBurst(0.5, 0.5, color);
    }
    sendRef.current({
      kind: "shake",
      position: { x: 0.5, y: 0.5 },
      force: { x: 0, y: 0 },
      pressure: 0.85,
      color,
    });
    ghostRef.current.noteUserActivity();
  }, [renderShakeBurst]);

  // Slice 34 (Layer B3): a controller's lean, delivered to the
  // room. The interaction carries Slice 12's own tilt geometry
  // (controllerStore.tiltInteractionFor), so receiving screens
  // render the lean exactly as the controller's own splat would
  // have looked; the send funnel applies session gating, hue
  // stamp and sequencing like any human input, and the local
  // ghost hears it as this participant's activity. Nothing is
  // rendered locally — the controller's surface is the readout
  // (ControllerSurface), not the canvas.
  const fireTilt = useCallback((tiltX: number, tiltY: number) => {
    const hue = getIdentitySnapshot().self?.hue ?? 205;
    const color = hueDyeColor(hue, 0.6);
    const full = sendRef.current(tiltInteractionFor(tiltX, tiltY, color));
    if (full) ghostRef.current.noteLocalInteraction(full);
  }, []);

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
    controller: isController,
    onTilt: fireTilt,
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
  // Slice 31: the ghost's NOTE sink rides the same indirection —
  // the peer is constructed before the note-bus plumbing below
  // exists, so the stable wrapper forwards to a ref the real
  // sink is assigned into. ghostOwnNoteRef is the sink's
  // self-guard: while it names a note, that note's bus emission
  // is the ghost's own playing (the call-and-response forwarder
  // further down must not journal it as a human's).
  const ghostNoteSinkRef = useRef<
    (note: string, velocity: number, durationMs: number) => void
  >(() => {});
  const onGhostNote = useCallback(
    (note: string, velocity: number, durationMs: number) => {
      ghostNoteSinkRef.current(note, velocity, durationMs);
    },
    []
  );
  const ghostOwnNoteRef = useRef<string | null>(null);
  const ghostNoteOffTimersRef = useRef<Map<ReturnType<typeof setTimeout>, string>>(
    new Map()
  );
  const ghost = useGhostPeer({
    ownerId: userId,
    inject: injectRemoteInteraction,
    broadcast: broadcastGhost,
    humanPeers,
    layerEnabled: ghostLayerEnabled,
    getFabricContext: getGhostFabricContext,
    onDrawRecipe: onGhostDrawRecipe,
    onNote: onGhostNote,
    onMusicPhrase: (phrase) => {
      // Slice 68: a phrase the brain authored, complete — hand
      // it to the renderer untouched (see ghostMusicStore).
      publishGhostMusicPhrase(phrase);
    },
    onChoraleFrame: (frame) => {
      // Slice 70: a chorale beacon frame, published on change
      // by the ghost's machine — put it on the session wire.
      sendChorale(frame);
    },
    onForgeDecision: (decision) => {
      // Slice B: a validated forge decision — perform it
      // against the live Forge scene through the seam. The
      // ghost hosted HERE (on the fluid) can never be gated
      // INTO a forge act — the manifest refuses forge intents
      // on every non-Forge fabric at the validator and the
      // router — so this sink fires only for a peer whose
      // fabric context is the Forge; the performer itself
      // no-ops honestly when no Forge scene is mounted.
      performForgeDecision(decision);
    },
    onSfx: (kind, sfxCtx) => {
      // Own ghost: sounds are pitched from its signature hue.
      // Slice 47: the peer's articulation context (the causing
      // decision's intensity, the ghost's temperament + stamina,
      // a heartbeat's tempo) rides into the voice, so the sound
      // is generated from the moment, not replayed.
      sfxRef.current.play(kind, ghostSelfHueRef.current, {
        articulation: sfxCtx,
      });
    },
  });
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  useEffect(() => {
    if (ghost.identity) ghostSelfHueRef.current = ghost.identity.hue;
  }, [ghost.identity]);

  // Slice 68: the Generative-music standing request. While the
  // toggle is on and the ghost is present in this layer, the
  // layer's music framing — the human's chosen scale, the
  // pattern control (now a hint the brain weighs), and the
  // tempo — stands in the peer, and the brain authors phrases
  // against it on its phrase clock. Toggle off, or the ghost
  // out of the layer, clears the request: no request, no
  // phrases, and the renderer stays silent rather than faking
  // a performance nobody authored.
  const musicSpecific = state.experienceConfig?.specific as
    | Record<string, unknown>
    | undefined;
  const musicEnabled = Boolean(musicSpecific?.musicEnabled ?? false);
  const musicScale =
    typeof musicSpecific?.musicScale === "string"
      ? musicSpecific.musicScale
      : "ionian";
  const musicPattern =
    typeof musicSpecific?.musicPattern === "string"
      ? musicSpecific.musicPattern
      : "up";
  const musicTempo = Number.isFinite(musicSpecific?.musicTempo)
    ? Number(musicSpecific?.musicTempo)
    : 100;
  useEffect(() => {
    ghostRef.current.setMusicStanding(
      musicEnabled && ghostLayerEnabled
        ? {
            scale: musicScale,
            patternHint: musicPattern,
            tempoBpm: musicTempo,
          }
        : null
    );
  }, [musicEnabled, musicScale, musicPattern, musicTempo, ghostLayerEnabled]);

  // Slice 70: the chorale opt-in. Willingness follows the
  // music toggle — turning Generative music on for this room
  // is already the deliberate act — and "Sing with other
  // ghosties" (specific.choraleEnabled, resting ON) is the
  // opt-out. Not willing, the ghostie is silent AND invisible
  // to other ghosties: no frames out, heard frames ignored.
  const choraleOptOut = musicSpecific?.choraleEnabled === false;
  useEffect(() => {
    ghostRef.current.setChoraleWilling(
      musicEnabled && ghostLayerEnabled && !choraleOptOut
    );
  }, [musicEnabled, ghostLayerEnabled, choraleOptOut]);

  // Slice 68: the MIDI pack seam — the first bundled pack's
  // seed phrase loads once (packs are static assets) and waits
  // in the peer for the brain to quote and vary. Best-effort:
  // no pack loaded, no quote — phrases are still authored.
  const musicPackLoadedRef = useRef(false);
  useEffect(() => {
    if (!musicEnabled || musicPackLoadedRef.current) return;
    musicPackLoadedRef.current = true;
    let cancelled = false;
    void fetchFirstMusicPackSeed().then((seed) => {
      if (!cancelled && seed) {
        ghostRef.current.setMusicPackNotes(seed.notes);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [musicEnabled]);

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
    // Slice 50: through the ONE vibration gate (the settings
    // switch now governs the felt touches, not just UI taps).
    vibrate(verb.vibration);
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
  // Slice 31: the ghost's note sink — the note goes on the shared
  // noteBus, the pipeline human keys use: it sounds through the
  // soundfont on this device, lights the key on the Piano layer,
  // streams into the fluid, and rides the note transport to the
  // room under the session's notes gate (Slice 5 modes + Slice
  // 19 fabric rules, inside sendNote). The bus emission is
  // synchronous, so the self-guard is exact: it is set for the
  // duration of the emit and cleared immediately after, and the
  // forwarder below reads it in the same tick. The note-off is
  // timed here (the bus's own convention: whoever turns a note
  // on turns it off); pending offs flush on unmount so a ghost
  // note can never ring forever.
  ghostNoteSinkRef.current = (note, velocity, durationMs) => {
    ghostOwnNoteRef.current = note;
    noteBus.emitNoteOn(note, velocity);
    ghostOwnNoteRef.current = null;
    const timer = setTimeout(() => {
      ghostNoteOffTimersRef.current.delete(timer);
      noteBus.emitNoteOff(note);
    }, durationMs);
    ghostNoteOffTimersRef.current.set(timer, note);
  };
  useEffect(() => {
    const timers = ghostNoteOffTimersRef.current;
    return () => {
      timers.forEach((note, timer) => {
        clearTimeout(timer);
        noteBus.emitNoteOff(note);
      });
      timers.clear();
    };
  }, []);

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
    vibrate(verb.vibration);
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
    // Slice 62: same honesty for the fluid's own photo/camera
    // backdrop — a cold load onto a live backdrop starts
    // transparent over the picture, never opaque over it.
    engine.transparentBackdrop =
      experienceRef.current?.id === "sam-see" ||
      getHandsSnapshot().cameraLive ||
      getFluidBackdropSnapshot().live;
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
        state.activeExperience?.id === "sam-see" ||
        getHandsSnapshot().cameraLive ||
        getFluidBackdropSnapshot().live;
    }
  }, [state.activeExperience?.id]);

  // Slice 28: Hands brings its own camera to layers that don't
  // have one — when its stream is live on the fluid, the same
  // compositing applies (camera behind, fluid over), so the flag
  // follows the hands store too. A subscription, not a render: the
  // canvas never remounts for a camera starting or stopping.
  useEffect(() => {
    return subscribeHands((s) => {
      if (engineRef.current) {
        engineRef.current.transparentBackdrop =
          experienceRef.current?.id === "sam-see" ||
          s.cameraLive ||
          getFluidBackdropSnapshot().live;
      }
    });
  }, []);

  // Slice 62: the fluid's own backdrop (FluidBackdrop) — a photo
  // or a live camera the user put behind the liquid canvas. While
  // the backdrop store says a picture is live beneath the canvas,
  // the same compositing applies (picture behind, fluid over), so
  // the flag follows that store too. The store says live ONLY
  // while a picture is actually on screen: a camera that was
  // denied or never started leaves the flag false and the canvas
  // paints its own opaque backdrop, exactly as before.
  useEffect(() => {
    return subscribeFluidBackdrop(() => {
      if (engineRef.current) {
        engineRef.current.transparentBackdrop =
          experienceRef.current?.id === "sam-see" ||
          getHandsSnapshot().cameraLive ||
          getFluidBackdropSnapshot().live;
      }
    });
  }, []);

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

  // Slice 28: Hands. The camera-gesture engine (src/hands) asks on
  // the window, and the answer is this funnel — deliberately the
  // same shape as every other input path: session gate first, then
  // sendInteraction (which stamps identity and enforces the mode +
  // fabric draw rules), a local engine.splatAt with the same
  // fields, and a note to the ghost. A hand-touch is a touch: the
  // ONLY difference the fluid can see is the interaction's
  // source: "hand" tag. Stroke force uses the engine's own pointer
  // math (delta * SPLAT_FORCE 6000, pressure from the same clamp),
  // so a drawn line feels identical whether a finger or a fingertip
  // in the air drew it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    const onHandInput = (ev: Event) => {
      const d = (ev as CustomEvent<HandInputDetail>).detail;
      if (!d || d.source !== "hand") return;
      // A view-only guest's hand is an audience hand: no painting,
      // exactly like their verbs and strokes.
      if (!sessionRef.current.inputEnabled) return;
      markActivity();
      const hue = getIdentitySnapshot().self?.hue ?? 205;
      const color = hueDyeColor(hue, 0.95);
      const engine = engineRef.current;

      if (d.kind === "stroke") {
        const fx = d.dx * 6000;
        const fy = d.dy * 6000;
        const pressure = d.pinched
          ? Math.max(0.85, Math.min(1, Math.hypot(fx, fy) / 250))
          : Math.min(1, Math.max(0.25, Math.hypot(fx, fy) / 250));
        const interaction: Omit<FluidInteraction, "userId" | "timestamp"> = {
          position: { x: clamp01(d.x), y: clamp01(d.y) },
          force: { x: fx, y: fy },
          pressure,
          color,
          radiusScale: d.pinched ? 1.6 : 1,
          source: "hand",
        };
        const full = sendRef.current(interaction, undefined, { batch: true });
        engine?.splatAt(
          interaction.position.x,
          interaction.position.y,
          fx,
          fy,
          color,
          interaction.radiusScale
        );
        ghostRef.current.noteLocalInteraction(full);
      } else if (d.kind === "push") {
        // A broad impulse along the palm's motion: three splats
        // strung along the vector, one broadcast interaction with
        // the same force so peers feel the same shove.
        const fx = d.dx * 150;
        const fy = d.dy * 150;
        const interaction: Omit<FluidInteraction, "userId" | "timestamp"> = {
          position: { x: clamp01(d.x), y: clamp01(d.y) },
          force: { x: fx, y: fy },
          pressure: 0.8,
          color,
          radiusScale: 2.0,
          source: "hand",
        };
        const full = sendRef.current(interaction);
        for (const k of [-1, 0, 1]) {
          engine?.splatAt(
            clamp01(d.x + d.dx * 0.05 * k),
            clamp01(d.y + d.dy * 0.05 * k),
            fx,
            fy,
            color,
            2.0
          );
        }
        ghostRef.current.noteLocalInteraction(full);
      } else if (d.kind === "clear") {
        // A soft clearing wave: a gentle ring exhaling from the
        // hand point (the shake bloom's geometry at a whisper of
        // its force), plus one wide zero-force broadcast so peers
        // get the same soft bloom.
        const interaction: Omit<FluidInteraction, "userId" | "timestamp"> = {
          position: { x: clamp01(d.x), y: clamp01(d.y) },
          force: { x: 0, y: 0 },
          pressure: 0.5,
          color,
          radiusScale: 2.4,
          source: "hand",
        };
        const full = sendRef.current(interaction);
        const ring = 8;
        for (let k = 0; k < ring; k++) {
          const ang = (k / ring) * Math.PI * 2;
          engine?.splatAt(
            clamp01(d.x + Math.cos(ang) * 0.05),
            clamp01(d.y + Math.sin(ang) * 0.05),
            Math.cos(ang) * 60,
            Math.sin(ang) * 60,
            color,
            0.9
          );
        }
        engine?.splatAt(interaction.position.x, interaction.position.y, 0, 0, color, 2.4);
        ghostRef.current.noteLocalInteraction(full);
      } else if (d.kind === "grab") {
        // Slice 34 (B2): a pinch-grab — the hand has closed on the
        // fluid at the fingertip and is holding it. The held point
        // is rendered as a sustained, slightly wide splat that
        // travels with the hand (move force from the grab delta,
        // the stroke math), broadcast through the same funnel so
        // the hold and its travel land on every screen; release
        // exhales one soft wide splat where the hand let go.
        const releasing = d.phase === "end";
        const fx = d.dx * 6000;
        const fy = d.dy * 6000;
        const interaction: Omit<FluidInteraction, "userId" | "timestamp"> = {
          position: { x: clamp01(d.x), y: clamp01(d.y) },
          force: { x: fx, y: fy },
          pressure: releasing ? 0.3 : 0.75,
          color,
          radiusScale: releasing ? 2.2 : 1.8,
          source: "hand",
        };
        const full = sendRef.current(interaction, undefined, {
          batch: d.phase === "move",
        });
        engine?.splatAt(
          interaction.position.x,
          interaction.position.y,
          fx,
          fy,
          color,
          interaction.radiusScale
        );
        ghostRef.current.noteLocalInteraction(full);
      }
    };

    // A recognized sign is a stimulus for the ghost, not an input
    // on the fluid — it is forwarded ungated (the ghost is a local
    // peer; a guest waving at their own ghostie harms nothing) and
    // lands in its event journal, where deliberation reads it.
    const onHandSign = (ev: Event) => {
      const d = (ev as CustomEvent<HandSignDetail>).detail;
      if (!d || d.source !== "hand") return;
      ghostRef.current.noteHandSign(d.sign);
    };

    // Slice 34 (Layer B1): a gesture TOKEN is a sense for the
    // ghost, forwarded ungated for the same reason as the sign —
    // the reading lands in the scenario digest's `gestures` field
    // (GhostPeer.noteGesture), where both brain tiers deliberate
    // over it alongside words, verbs and scene. Tokens never touch
    // the fluid here: a wave is something the ghost READS, not a
    // splat the hand makes.
    const onGesture = (ev: Event) => {
      const d = (ev as CustomEvent<GestureDetail>).detail;
      if (!d || d.source !== "hand") return;
      ghostRef.current.noteGesture({
        token: d.token,
        hand: d.hand,
        confidence: d.confidence,
        held_s: d.held_s,
      });
    };

    window.addEventListener(FABRIC_HAND_INPUT_EVENT, onHandInput as EventListener);
    window.addEventListener(FABRIC_HAND_SIGN_EVENT, onHandSign as EventListener);
    window.addEventListener(FABRIC_GESTURE_EVENT, onGesture as EventListener);
    return () => {
      window.removeEventListener(FABRIC_HAND_INPUT_EVENT, onHandInput as EventListener);
      window.removeEventListener(FABRIC_HAND_SIGN_EVENT, onHandSign as EventListener);
      window.removeEventListener(FABRIC_GESTURE_EVENT, onGesture as EventListener);
    };
  }, []);

  // Slice 36 ("The Fold"): the compute field's digest is a sense
  // for the ghost, forwarded on change like the gesture tokens —
  // it lands in the scenario's `genx` field (GhostPeer.noteGenx),
  // where fold progress, node arrivals and shard stalls inform
  // deliberation. Forwarded only while the Fold is the loaded
  // fabric: elsewhere the sense is absent, and absence is the
  // legacy behavior, byte-for-byte.
  useEffect(() => {
    let lastKey = "";
    return subscribeGenx((snap) => {
      if (experienceRef.current?.id !== "genx-fold") return;
      const s = snap.sense;
      const key = `${s.nodesOnline}|${s.fieldLoad.toFixed(2)}|${s.missionProgress.toFixed(3)}|${s.shardsDone}/${s.shardsTotal}|${s.fahOnline}|${s.stalled}`;
      if (key === lastKey) return;
      lastKey = key;
      ghostRef.current.noteGenx(s);
    });
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

  // Slice 59: Encounters. The discovery service dispatches
  // FABRIC_GHOST_ENCOUNTER_EVENT when someone the primary
  // follows or friended lists a fabric in the lobby (its
  // tracker already spent the discipline: once per encounter,
  // first sync silent, bursts coalesced). The answer is the
  // ghost noticing — a greeting chirp in its own voice via
  // noteEncounter, no room act: the person is around, not here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEncounter = (ev: Event) => {
      const name = (ev as CustomEvent<string>).detail;
      if (typeof name !== "string") return;
      ghostRef.current.noteEncounter(name);
    };
    window.addEventListener(FABRIC_GHOST_ENCOUNTER_EVENT, onEncounter as EventListener);
    return () => window.removeEventListener(FABRIC_GHOST_ENCOUNTER_EVENT, onEncounter as EventListener);
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

  // Slice 58: natural voice's mic state is signaled by the
  // ghostie itself, never by chrome. The name-listener reports
  // its transitions (armed / attending); the ghost answers
  // in-world — a soft halo while it listens for its name, a
  // perk and a brighter glow the moment the name lands.
  // expressAttention is presence-gated and budget-counted like
  // any act; with no ghost out, the moment passes quietly (the
  // listener still hears — there is just nobody to show it).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVoiceAttention = (e: Event) => {
      const detail = (
        e as CustomEvent<{ listening?: boolean; attending?: boolean }>
      ).detail;
      if (!detail?.listening) return;
      ghostRef.current.expressAttention(detail.attending === true);
    };
    window.addEventListener(FABRIC_VOICE_ATTENTION_EVENT, onVoiceAttention);
    return () =>
      window.removeEventListener(FABRIC_VOICE_ATTENTION_EVENT, onVoiceAttention);
  }, []);

  // Slice 31: call-and-response input. While the Piano layer is
  // front, human note-ons on the shared bus — the local user's
  // keys and remote peers' notes alike (both ride the bus, the
  // remote ones flagged as such) — are forwarded to the ghost as
  // a sense (GhostPeer.noteHumanNote): journaled in the dataset's
  // event vocabulary, so deliberation may answer a played note
  // with one of its own. The ghost's own sink emissions are
  // guarded out by ghostOwnNoteRef — the sink sets it for the
  // synchronous duration of its bus emission — so the ghost
  // never mistakes its own playing for a human's and answers
  // itself.
  useEffect(() => {
    const off = noteBus.on((e) => {
      if (e.type !== "on") return;
      if (ghostOwnNoteRef.current === e.note) return;
      // Slice 53: a note layer is wherever the ghost's note
      // tools live — the Piano, and now the Playground (its own
      // key strip plays into the same bus, and the ghost hears
      // those notes exactly as it hears the Piano's).
      if (!isGhostNoteLayer(experienceRef.current?.id)) return;
      ghostRef.current.noteHumanNote(e.note);
    });
    return off;
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
  //   haptic steps: local vibration only (through the Slice 50
  //                gate — the settings switch governs it). The
  //                transport has no haptic-only payload (a
  //                verb-less interaction would paint dye on
  //                peers); verbs are the broadcast haptic channel.
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
        if (haptic) {
          vibrate(haptic);
        }
      }
      ghostRef.current.noteUserActivity();
    };

    // Slice 30 ("See acts"): on the See layer, an act ask closes
    // the loop SAM opened — segment the named thing through the
    // tier seam (cloud SAM 3.1 when configured, the on-device
    // GroundingDINO eyes when ready), then ACT on the region:
    // a touch through the shared funnel in the asker's hue, a
    // ring recipe fitted to the region's box, or (highlight)
    // the outline alone. Addressed to the ghost, the GHOST
    // performs through its Slice 23 machinery — draw gate,
    // budget, cooldown — and when the fabric refuses, nobody
    // performs in its place. No region, no eyes, a resting
    // ghost: the established living fallback answers, never a
    // dev error and never a fabricated region. The act route
    // CLAIMS its asks on the See layer: the generic interpreter
    // must never invent a target for an act it cannot see.
    const rippleInUserHue = () => {
      const hue = getIdentitySnapshot().self?.hue ?? 200;
      engineRef.current?.splatAt(0.5, 0.47, 0, -42, hueToRgb(hue, 0.5), 0.8);
      engineRef.current?.splatAt(0.5, 0.47, 26, -18, hueToRgb(hue, 0.3), 0.5);
    };
    const seeActFallback = (line: string | null) => {
      const puzzled = ghostRef.current.expressPuzzlement();
      if (!puzzled) rippleInUserHue();
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
      publishState(line);
    };
    const performSeeAct = async (act: SeeAct): Promise<void> => {
      const ghostName = ghostRef.current.identity?.name ?? "Ghost";
      const llm = await loadLLMConfig();
      const outcome = await segmentPhrase(act.phrase, {
        cloud: llm ? { apiKey: llm.apiKey, endpoint: llm.endpoint } : null,
      });
      if (outcome.status === "unavailable") {
        // No eyes can serve the ask: note the want (it raises
        // the ONE on-device-eyes consent ask when undecided)
        // and answer in-world, as an unshapeable ask is today.
        noteGroundingWanted();
        seeActFallback(
          "See's eyes are resting on this device — once they're on, that ask works"
        );
        return;
      }
      if (outcome.status === "error") {
        publishState(outcome.message);
        rippleInUserHue();
        return;
      }
      const regions = outcome.regions;
      if (regions.length === 0) {
        seeActFallback(`Couldn't find ${act.phrase} in this frame`);
        return;
      }
      // Show what was found — image space; SamLayer maps it
      // through its cover-fit frame rect like its own results.
      // For a highlight ask this outline IS the whole act.
      window.dispatchEvent(
        new CustomEvent(FABRIC_SEE_HIGHLIGHT_EVENT, {
          detail: {
            regions: regions.map((r) => ({ ...r.box, label: r.label })),
            phrase: act.phrase,
            pulse: act.kind === "highlight",
            lingerMs: act.kind === "highlight" ? 5000 : 0,
          },
        })
      );
      if (act.kind === "highlight") {
        recordAgentAnswer();
        window.dispatchEvent(
          new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
            detail: outcome.tier === "device-grounding" ? "device" : "llm",
          })
        );
        publishState(`There's ${act.phrase} — outlined`);
        return;
      }
      // Map the found box into canvas space through the
      // cover-fit transform, so the act lands where the user
      // SEES the object on their screen.
      const cam = getSamCameraSnapshot();
      const viewportAspect =
        typeof window !== "undefined" && window.innerHeight > 0
          ? window.innerWidth / window.innerHeight
          : 0;
      const target = imageBoxToCanvas(
        regions[0].box,
        cam.aspect,
        viewportAspect
      );
      const center = boxCenter(target);
      const sourceDetail =
        outcome.tier === "device-grounding" ? "device" : "llm";

      if (act.toGhost && act.kind === "touch") {
        const res = ghostRef.current.answerTouchAt(
          center.x,
          center.y,
          touchRadiusFor(target),
          act.phrase
        );
        if (res === "performed") {
          recordAgentAnswer();
          window.dispatchEvent(
            new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
              detail: "ghost",
            })
          );
          publishState(`${ghostName} touched ${act.phrase}`);
        } else if (res === "refused") {
          publishState(
            `${ghostName} wanted to touch — this fabric doesn't allow it`
          );
        } else {
          seeActFallback(null);
        }
        return;
      }
      if (act.toGhost && act.kind === "draw") {
        const fit = ringFitFor(target);
        const res = ghostRef.current.answerDrawAround(
          fit.cx,
          fit.cy,
          fit.scale,
          act.phrase
        );
        if (res === "performed") {
          recordAgentAnswer();
          window.dispatchEvent(
            new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
              detail: "ghost",
            })
          );
          publishState(`${ghostName} drew a circle around ${act.phrase}`);
        } else if (res === "refused") {
          publishState(
            `${ghostName} wanted to draw — this fabric doesn't allow it`
          );
        } else {
          seeActFallback(null);
        }
        return;
      }
      if (act.kind === "touch") {
        // The user's own touch, through the shared funnel —
        // the same dispatchStep a composed splat rides (send +
        // local splat, in the asker's hue).
        dispatchStep({
          kind: "splat",
          x: center.x,
          y: center.y,
          radius: touchRadiusFor(target),
          hue: getIdentitySnapshot().self?.hue ?? 200,
          intensity: 0.85,
          atMs: 0,
        });
        recordAgentAnswer();
        window.dispatchEvent(
          new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
            detail: sourceDetail,
          })
        );
        publishState(`Touched ${act.phrase}`);
        return;
      }
      // The user's own draw: a ring fitted to the region,
      // validated at the door and played through the recipe
      // send path like every shared drawing.
      const fit = ringFitFor(target);
      const hue = getIdentitySnapshot().self?.hue ?? 200;
      const recipe = validateRecipe(
        {
          version: 2,
          name: `Circle around ${act.phrase}`,
          seed: (Date.now() ^ 0x5eed) >>> 0,
          steps: [
            {
              shape: "ring",
              cx: fit.cx,
              cy: fit.cy,
              scale: fit.scale,
              hue: Math.round(hue),
              durationMs: 2600,
              style: "draw",
            },
          ],
        },
        "builtin"
      );
      if (!recipe) {
        seeActFallback(null);
        return;
      }
      recordAgentAnswer();
      window.dispatchEvent(
        new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
          detail: sourceDetail,
        })
      );
      recipePlayer.stop();
      playRecipeRef.current(recipe, { send: true, defaultHue: hue });
      publishState(`Drew a circle around ${act.phrase}`);
    };

    const onCompose = (ev: Event) => {
      // Slice 33: the detail is the prompt text — or, for a voice
      // final that carried the recognizer's confidence, an object
      // { text, confidence, via } (ComposeBar). Every route below
      // consumes the same extracted text; only the utterance
      // route spends the confidence.
      const detail = (ev as CustomEvent<unknown>).detail;
      const detailObj =
        detail && typeof detail === "object"
          ? (detail as { text?: unknown; confidence?: unknown })
          : null;
      const prompt =
        typeof detail === "string"
          ? detail
          : typeof detailObj?.text === "string"
            ? detailObj.text
            : null;
      if (typeof prompt !== "string" || !prompt.trim()) return;
      const heardConfidence =
        typeof detailObj?.confidence === "number" &&
        Number.isFinite(detailObj.confidence)
          ? detailObj.confidence
          : null;
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

        // Slice 31 ("the ghost plays"): a note ask — "play a
        // note", "play middle C", "Boop, play that again", "play
        // an arpeggio" — belongs to the ghost's NOTE tools. The
        // route claims its asks on shape alone (a named note is
        // not something the generic interpreter can perform),
        // and the layer decides the answer: on a note layer
        // (the Piano; the Playground since Slice 53 — the one
        // list is isGhostNoteLayer), the ghost performs through
        // its gates, budget and cooldown; on any other layer
        // the ask gets the in-world redirect — the ghost's
        // puzzlement and a plain line naming where notes live
        // — never an error, and never a composed pattern
        // pretending to be a note.
        const noteAsk = ghostNoteAsk(
          prompt,
          ghostRef.current.identity?.name ?? null
        );
        if (noteAsk) {
          const ghostName = ghostRef.current.identity?.name ?? "Ghost";
          if (!isGhostNoteLayer(experienceRef.current?.id)) {
            seeActFallback(
              `Notes live at the Piano and in the Playground — ${ghostName} can play there`
            );
            return;
          }
          const res =
            noteAsk.kind === "arpeggio"
              ? ghostRef.current.answerArpeggio(noteAsk.descending)
              : noteAsk.kind === "again"
                ? ghostRef.current.answerNoteAgain()
                : ghostRef.current.answerNote(noteAsk.note);
          if (res === "performed") {
            recordAgentAnswer();
            window.dispatchEvent(
              new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
                detail: "ghost",
              })
            );
            publishState(
              noteAsk.kind === "arpeggio"
                ? `${ghostName} played an arpeggio`
                : noteAsk.kind === "again"
                  ? `${ghostName} played it again`
                  : `${ghostName} played ${noteAsk.note ?? "a note"}`
            );
          } else if (res === "refused") {
            publishState(
              `${ghostName} wanted to play — this fabric doesn't allow it`
            );
          } else {
            seeActFallback(null);
          }
          return;
        }

        // Slice 30 ("See acts"): on the See layer, an act ask is
        // answered by SEEING and then ACTING (performSeeAct
        // above) — it never reaches the generic interpreter,
        // which cannot see and must not invent the target.
        const seeAct = parseSeeAct(
          prompt,
          ghostRef.current.identity?.name ?? null
        );
        if (seeAct && experienceRef.current?.id === "sam-see") {
          await performSeeAct(seeAct);
          return;
        }

        // Slice 33 ("Understands"): a claimed utterance — words
        // spoken into the room, not an ask (ghostUtteranceClaim
        // keeps heartbeat / verb / note asks and imperative
        // compose prompts with their owners, and this route sits
        // after all of them anyway) — is HEARD by the ghost. It
        // acknowledges at once (GhostPeer.noteUtterance's beat),
        // then deliberation answers from its live state through
        // the brain tiers — state, temperament, scene and history
        // shape the response, so the same sentence does not earn
        // the same answer twice. A garbled hearing (confidence
        // under the floor) is answered on the spot with the
        // ghost's in-character puzzlement, captioned exactly like
        // Hotfix 2.4's living fallback. When no ghost can hear
        // ("unavailable"), the words fall through to the generic
        // interpreter, as with every ghost route above.
        if (
          ghostUtteranceClaim(
            prompt,
            ghostRef.current.identity?.name ?? null
          )
        ) {
          const ghostName = ghostRef.current.identity?.name ?? "Ghost";
          const heard = ghostRef.current.noteUtterance(prompt, {
            confidence: heardConfidence,
          });
          if (heard === "heard") {
            window.dispatchEvent(
              new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
                detail: "ghost",
              })
            );
            publishState(`${ghostName} heard you`);
            return;
          }
          if (heard === "uncertain") {
            window.dispatchEvent(
              new CustomEvent(FABRIC_COMPOSE_SOURCE_EVENT, {
                detail: { source: "puzzled", ghostName },
              })
            );
            publishState(null);
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
        raw.source === "builtin"
          ? "builtin"
          : raw.source === "device"
            ? "device"
            : "llm"
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
        vibrate(60);
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
            // Slice 44: moved out of the HUD's bottom band (it
            // rendered across the control cluster on every
            // fluid-ground fabric) to the declared alert anchor
            // below the status slot, and it transitions in
            // (280ms, the tokens' base step) instead of popping.
            top: 104,
            zIndex: 5,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "rgba(2,8,23,0.88)",
            border: "1px solid rgba(34,211,238,0.45)",
            borderRadius: 10,
            padding: "8px 10px",
            opacity: engineNoticeIn ? 1 : 0,
            transform: engineNoticeIn
              ? "translateY(0px)"
              : "translateY(8px)",
            transition:
              "opacity 280ms cubic-bezier(0.33, 1, 0.68, 1), transform 280ms cubic-bezier(0.33, 1, 0.68, 1)",
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
      {/* Slice 36 ("The Fold"): the distributed-compute fabric's
          layer — the bounty board, the node card, and the
          microcosm driver ride over the fluid (the layer's
          ground, sam-see precedent) while the Fold is the loaded
          experience. Its settings (lend this device, node
          address) live in THIS LAYER and reach it through the
          layer config, like every other layer's own truths. */}
      {state.activeExperience?.id === "genx-fold" ? (
        <GenxLayer
          userId={userId}
          lendDevice={
            (state.experienceConfig?.specific as Record<string, unknown> | undefined)
              ?.lendDevice === true
          }
          nodeUrl={
            String(
              ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
                ?.genxNodeUrl as string) ?? ""
            )
          }
          sendGenx={sendGenx}
          injectInteraction={injectRemoteInteraction}
        />
      ) : null}
      {/* Slice 53 ("Ghostie Playground"): the ghostie's own
          fabric's layer — its tool tray and key strip ride over
          the fluid (the layer's ground, the sam-see / Fold
          precedent) while the Playground is the loaded
          experience. Every control is a real ghost ask: the
          callbacks are the peer's own ask surface — the same
          methods the compose route above calls — so a button
          press and a spoken ask run identical gates, budgets
          and cooldowns. Nothing in the layer performs locally. */}
      {state.activeExperience?.id === "ghostie-playground" ? (
        <PlaygroundLayer
          ghostName={ghost.identity?.name ?? null}
          askHeartbeat={() => ghostRef.current.answerHeartbeat()}
          askVerb={(verb) => ghostRef.current.answerVerb(verb)}
          askDraw={() => {
            const pos = ghostRef.current.bodyPosition();
            if (!pos) return "unavailable";
            return ghostRef.current.answerDrawAround(
              pos.x,
              pos.y,
              0.16,
              "itself"
            );
          }}
          askNote={(note) => ghostRef.current.answerNote(note)}
          askNoteAgain={() => ghostRef.current.answerNoteAgain()}
          askArpeggio={() => ghostRef.current.answerArpeggio(false)}
        />
      ) : null}
      {/* Slice 34 (Layer B3): the controller surface — while this
          phone is joined as a senses-only controller, the canvas
          goes dark and quiet under this readout: the experience is
          rendering on the room's other screens. The engine keeps
          running beneath (peers' work still arrives; the surface
          simply owns this screen's face). */}
      {isController ? (
        <ControllerSurface
          motionStatsRef={motionStatsRef}
          hueColor={hueCss(getIdentitySnapshot().self?.hue ?? 205)}
        />
      ) : null}
    </div>
  );
}
