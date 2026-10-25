import React, { useCallback, useEffect, useRef } from "react";
import { LegacyFluidEngine } from "./LegacyFluidEngine";
import { useExperience } from "../../contexts/ExperienceContext";
import { useFluidMultiUser } from "../../hooks/useFluidMultiUser";
import {
  FABRIC_VERB_EVENT,
  getVerbById,
  verbInteraction,
  type SensoryVerb,
} from "../../sensory/verbs";
import { useAudioCues } from "../../../app/hooks/useAudioCues";
import type { FluidInteraction } from "../../types/fluid";
import { useGhostPeer } from "../../ghost/useGhostPeer";
import {
  ghostPeerIdFor,
  isGhostPeerId,
} from "../../ghost/GhostPeer";
import { useGhostSfx, hueFromColor } from "../../ghost/useGhostSfx";
import { setGhostPublicState } from "../../ghost/ghostStore";

interface LegacyFluidProps {
  /**
   * Fires once the WebGL engine has actually initialized. Used by
   * ExperienceRenderer to set the background-ready flag honestly
   * (on engine init, not on component mount).
   */
  onReady?: () => void;
}

export default function LegacyFluid({ onReady }: LegacyFluidProps = {}) {
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

  // ---- Ghost (Slice 2) -------------------------------------------------
  // The ghost is a local agent peer with its own peer id
  // ("ghost:<userId>"). Its interactions are injected through the SAME
  // remote-interaction path human remotes take (injectRemoteInteraction
  // -> remoteInteractions -> splatAt + effects below), never rendered
  // through a fork. When summoned into a session, the same interactions
  // are ALSO broadcast under the ghost peer id so every participant
  // renders them through their own normal remote path.
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
    if (!verb || !ghostRef.current.enabled) return;
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
    try {
      engine = new LegacyFluidEngine(canvasRef.current, containerRef.current);
    } catch (err) {
      // WebGL unavailable — leave onReady unfired; ExperienceRenderer's
      // fallback timeout still sets the ready flag.
      console.warn("[LegacyFluid] Engine failed to initialize:", err);
      return;
    }
    engineRef.current = engine;
    engine.onLocalInteraction = (interaction) => {
      const full = sendRef.current(interaction);
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

  // Outgoing sensory verbs: the VerbBar dispatches FABRIC_VERB_EVENT.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVerb = (ev: Event) => {
      const verb = getVerbById((ev as CustomEvent<string>).detail);
      if (!verb) return;
      sendRef.current(verbInteraction(verb));
      playVerbEffects(verb, true);
      ghostRef.current.noteUserActivity();
    };
    window.addEventListener(FABRIC_VERB_EVENT, onVerb as EventListener);
    return () => window.removeEventListener(FABRIC_VERB_EVENT, onVerb as EventListener);
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
      engine.splatAt(i.position.x, i.position.y, i.force.x, i.force.y, i.color);
      if (isGhostPeerId(i.userId)) {
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
    </div>
  );
}
