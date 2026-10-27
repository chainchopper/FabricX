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
  composePattern,
  getHapticPattern,
  hueToRgb,
  type Pattern,
  type PatternStep,
} from "../../ai/PatternComposer";
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
  isGhostPeerId,
} from "../../ghost/GhostPeer";
import { useGhostSfx, hueFromColor } from "../../ghost/useGhostSfx";
import { setGhostPublicState } from "../../ghost/ghostStore";
import {
  getSignalingService,
  type SignalingConnectionState,
} from "../../services/SignalingService";
import {
  getIdentitySnapshot,
  getPeerIdentity,
  subscribeIdentity,
  tintColorTowardHue,
  hueDyeColor,
} from "../../identity/identityStore";
import { useAmbientLife, type AmbientLifeStats } from "./useAmbientLife";
import { noteBus } from "../../../shared/utils/noteBus";

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
    injectRemoteInteraction,
    humanPeers,
  } = useFluidMultiUser(roomId);
  const audioCues = useAudioCues();
  const ghostSfx = useGhostSfx();

  // Latest-callback refs so the engine hook and window listener never
  // capture stale closures.
  const sendRef = useRef(sendInteraction);
  sendRef.current = sendInteraction;
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
  const ghostLayerEnabled =
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.ghostEnabled as boolean | undefined) !== false;

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
  const ghostPeerIdRef = useRef("");
  ghostPeerIdRef.current = ghostPeerIdFor(userId);
  const broadcastGhost = useCallback(
    (payload: Omit<FluidInteraction, "userId" | "timestamp">) => {
      sendRef.current(payload, ghostPeerIdRef.current);
    },
    []
  );
  const ghostSelfHueRef = useRef(200);
  const ghost = useGhostPeer({
    ownerId: userId,
    inject: injectRemoteInteraction,
    broadcast: broadcastGhost,
    humanPeers,
    layerEnabled: ghostLayerEnabled,
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

  const playVerbEffects = (verb: SensoryVerb, withSplat: boolean) => {
    if (withSplat) {
      const engine = engineRef.current;
      if (engine) {
        // A small two-way burst in the verb's color at canvas center.
        engine.splatAt(0.5, 0.5, 140, 70, verb.color);
        engine.splatAt(0.5, 0.5, -140, -50, verb.color);
      }
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(verb.vibration);
    }
    const cue = cuesRef.current[verb.audioCue];
    if (typeof cue === "function") cue();
  };

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
            sfxRef.current.play("sniff", hue, { distance: 0.3 });
          }
        });
      }
      ghostPosRef.current.set(i.userId, {
        x: i.position.x,
        y: i.position.y,
      });
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
        sfxRef.current.play("play", hue, { distance: 0.3 });
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
      sfxRef.current.startPurr(hue);
    } else if (verb.id === "heart") {
      sfxRef.current.play("heart", hue);
    } else if (verb.id === "cheer") {
      sfxRef.current.play("play", hue);
    } else if (verb.id === "tickle") {
      sfxRef.current.play("mirror", hue);
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
    engine.onError = reportEngineError;
    engine.onLocalInteraction = (interaction) => {
      const full = sendRef.current(interaction);
      // Slice 7: a real local touch — the ambient driver stands down.
      markActivity();
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
    };
    window.addEventListener(FABRIC_VERB_EVENT, onVerb as EventListener);
    return () => window.removeEventListener(FABRIC_VERB_EVENT, onVerb as EventListener);
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const publishState = (name: string | null) => {
      window.dispatchEvent(
        new CustomEvent(FABRIC_COMPOSE_STATE_EVENT, { detail: name })
      );
    };
    patternPlayer.setStateListener(publishState);

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
        const pattern = await composePattern(prompt);
        if (pattern) {
          patternPlayer.play(pattern, dispatchStep);
        } else {
          publishState(null);
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
      patternPlayer.play(p, dispatchStep);
    };
    const onStop = () => patternPlayer.stop();
    window.addEventListener(FABRIC_COMPOSE_EVENT, onCompose as EventListener);
    window.addEventListener(FABRIC_COMPOSE_STOP_EVENT, onStop);
    window.addEventListener(FABRIC_PLAY_PATTERN_EVENT, onPlayPattern as EventListener);
    return () => {
      window.removeEventListener(FABRIC_COMPOSE_EVENT, onCompose as EventListener);
      window.removeEventListener(FABRIC_COMPOSE_STOP_EVENT, onStop);
      window.removeEventListener(FABRIC_PLAY_PATTERN_EVENT, onPlayPattern as EventListener);
      patternPlayer.stop();
      patternPlayer.setStateListener(null);
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
      const key = `${i.userId}:${i.timestamp}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
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
      engine.splatAt(i.position.x, i.position.y, i.force.x, i.force.y, splatColor);
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
who     ${(() => {
            const snap = getIdentitySnapshot();
            const named = Object.values(snap.peers)
              .map((p) => `${p.name || "?"}·${p.hue}°`)
              .join(", ");
            return `you ${snap.self ? `${snap.self.name}·${snap.self.hue}°` : "…"}${named ? ` | peers ${named}` : ""}`;
          })()}
ambient ${diagAmbient ? `${diagAmbient.state} · ${diagAmbient.breaths} breaths · ${diagAmbient.gestures} gestures` : "…"}`}
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
