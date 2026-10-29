/**
 * DancerStage — the Dancer Stage experience (canvas: "stage3d").
 *
 * Realignment (Terrell, Oct 28): the dancer is not an overlay on
 * the fluid — it is a whole fabric of its own. This component IS
 * the canvas of the dancer-stage experience: a full
 * react-three-fiber stage (its own camera, lights, GPU shader
 * floor) mounted by ExperienceRenderer in place of the fluid.
 *
 * Stage v2 — "Ghostie Dancers" (Terrell, Oct 28): "Each
 * participant gets one. (Their ghostie.)" The stage holds a CAST:
 *
 * - One rig per participant in the room (cap 6; extras wait in
 *   the wings — present and heard, bodiless until a slot frees).
 *   The local rig stands center-front; remotes fan on an arc.
 * - Each rig IS its owner's ghostie embodied: the local rig wears
 *   the local ghost's own name + hue (its persisted identity, or
 *   the Slice 9 derivation of it before the ghost has ever run);
 *   remote rigs wear the name + hue their owners announced
 *   (peer-announce). Name tags float over every rig.
 * - Attribution: a rig dances ONLY to its owner's playing. Notes
 *   arrive on the bus with their sender (transport `from`, handed
 *   through by useFluidMultiUser); verbs arrive attributed via
 *   useStageNotes. Unattributed bus notes (a host track, ambient
 *   generators) move the LOCAL rig only. The stage floor, lights
 *   and motes stay room-wide — they answer every note, as in v1.
 * - Temperament in the body: the local ghostie's idle/dance style
 *   scales with its live temperament + presence from the ghost
 *   store (when its brain has run this session). A remote ghost's
 *   temperament is not on the wire, so remote rigs dance neutral —
 *   their hue and their music are real; their inner weather is
 *   theirs.
 * - The glTF character slot binds to the LOCAL rig only: the
 *   character is YOUR ghostie's body. Models never travel.
 *
 * DOM side (this file) owns the cast bookkeeping: one
 * DancerDriver per participant (created lazily, pruned when they
 * leave), the shared stage fx object, and the bus routing above.
 * Drivers stay subscribe-only — they never see the transport.
 * useStageNotes runs the room transport exactly as in v1 (notes
 * out, verbs out + in, Slice 5 gating in the send funnel), and
 * ToneEngine sounds the notes (shared synth + sampled piano
 * voice, packs ensured on mount like the piano layer does).
 *
 * THIS LAYER settings (specific.*): stageDancerEnabled (the whole
 * cast dances vs stands at rest), stageCameraDrift, stageTheme.
 * Idle contract: `breathe` — drivers' breath phase sways the
 * figures, the camera drifts, motes float.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Canvas } from "@react-three/fiber";
import { useExperience } from "../contexts/ExperienceContext";
import { noteBus } from "../../shared/utils/noteBus";
import ToneEngine from "../components/audio/ToneEngine";
import { ensureSoundfontPiano } from "../audio/soundfontPiano";
import { DancerDriver, noteHue, noteNameToMidi } from "./DancerDriver";
import StageScene, { type StageRigSpec } from "./StageScene";
import { useStageNotes } from "./useStageNotes";
import { createStageFx, stageThemeHue } from "./stageFx";
import {
  buildStageCast,
  layoutCast,
  ownerIdForSender,
  placeholderHue,
  styleForTemperament,
  NEUTRAL_STYLE,
  type StageParticipant,
} from "./stageRoster";
import { useIdentitySnapshot } from "../identity/useIdentity";
import { displayNameFor } from "../identity/identityStore";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../ghost/ghostStore";
import { deriveGhostIdentity, GHOST_PREF_KEY } from "../ghost/useGhostPeer";
import { getJSON } from "../../app/utils/storage";
import {
  recordStagePresence,
  useRewards,
} from "../rewards/rewardsStore";

interface GhostFace {
  name: string;
  hue: number;
}

export default function DancerStage({
  onReady,
}: {
  onReady?: () => void;
}) {
  const { state } = useExperience();
  const specific = (state.experienceConfig.specific ?? {}) as Record<
    string,
    unknown
  >;
  const roomId =
    typeof specific.roomId === "string" && specific.roomId
      ? specific.roomId
      : "stage";
  const figureEnabled = specific.stageDancerEnabled !== false;
  const drift = specific.stageCameraDrift !== false;
  const themeHue = stageThemeHue(specific.stageTheme);

  const fx = useMemo(createStageFx, []);
  const fxRef = useRef(fx);

  // ---- The local ghostie's face (name + hue) ---------------------
  // The ghost's identity record (fabric_ghost_v1) is its own: read
  // it directly so the stage knows its ghostie even on a session
  // that opened straight into the stage (the ghost peer itself
  // lives on the fluid canvas and may not have run yet). The ghost
  // store's live name wins when the peer HAS run. No record at all
  // → the Slice 9 derivation: the name/hue a bound ghost will bear.
  const identitySnap = useIdentitySnapshot();
  const [ghostPublic, setGhostPublic] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  useEffect(() => subscribeGhostState(setGhostPublic), []);
  const [storedGhost, setStoredGhost] = useState<GhostFace | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pref = await getJSON<{
          identity?: { name?: unknown; hue?: unknown };
        } | null>(GHOST_PREF_KEY, null);
        const idn = pref?.identity;
        if (
          live &&
          idn &&
          typeof idn.name === "string" &&
          typeof idn.hue === "number"
        ) {
          setStoredGhost({
            name: idn.name,
            hue: ((Math.round(idn.hue) % 360) + 360) % 360,
          });
        }
      } catch {
        // The derivation below covers a storage hiccup.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const localGhost = useMemo<GhostFace>(() => {
    if (ghostPublic.ghostName || storedGhost) {
      return {
        name: ghostPublic.ghostName ?? storedGhost!.name,
        hue: storedGhost?.hue ?? identitySnap.self?.hue ?? 190,
      };
    }
    if (identitySnap.self) {
      const derived = deriveGhostIdentity(identitySnap.self.seed);
      return { name: derived.name, hue: derived.hue };
    }
    return { name: "Ghostie", hue: 190 };
  }, [ghostPublic.ghostName, storedGhost, identitySnap.self]);

  const localStyle = useMemo(
    () => styleForTemperament(ghostPublic.temperament, ghostPublic.presence),
    [ghostPublic.temperament, ghostPublic.presence]
  );

  // ---- Room transport (notes out, verbs both ways) ---------------
  const onVerb = useCallback((verbId: string, rigKey: string) => {
    fxRef.current.pendingGestures.push({ verb: verbId, rig: rigKey });
  }, []);
  const { userId, peerIds } = useStageNotes(roomId, true, onVerb);

  // ---- The cast ---------------------------------------------------
  const cast = useMemo<StageParticipant[]>(() => {
    const local: StageParticipant = {
      id: userId,
      name: localGhost.name,
      hue: localGhost.hue,
      isLocal: true,
    };
    const remotes: StageParticipant[] = peerIds.map((id) => {
      const ident = identitySnap.peers[id];
      return {
        id,
        name: ident?.name ? ident.name : displayNameFor(id, userId),
        hue: ident?.hue ?? placeholderHue(id),
        isLocal: false,
      };
    });
    return buildStageCast(local, remotes).cast;
  }, [userId, peerIds, identitySnap.peers, localGhost]);

  // One driver per participant, created lazily, pruned on exit.
  const driversRef = useRef(new Map<string, DancerDriver>());
  const getDriver = useCallback((id: string) => {
    let d = driversRef.current.get(id);
    if (!d) {
      d = new DancerDriver();
      driversRef.current.set(id, d);
    }
    return d;
  }, []);
  useEffect(() => {
    const keep = new Set(cast.map((p) => p.id));
    driversRef.current.forEach((_, id) => {
      if (!keep.has(id)) driversRef.current.delete(id);
    });
  }, [cast]);

  const castIdsRef = useRef<ReadonlySet<string>>(new Set());
  castIdsRef.current = new Set(cast.map((p) => p.id));

  // Note bus -> the player's own driver + stage effects. The bus
  // merges local surfaces (key strip, hardware MIDI) and remote
  // peers; remote events carry their sender (`from`). A note moves
  // ONLY its player's rig; the floor ripple fires for every note.
  useEffect(() => {
    const off = noteBus.on((e) => {
      if (e.type === "on") {
        fxRef.current.pendingNotes.push({
          hue: noteHue(noteNameToMidi(e.note)),
          strength: e.velocity ?? 0.7,
        });
      }
      const sender = !e.remote
        ? userId
        : e.from
          ? ownerIdForSender(e.from)
          : userId;
      if (!castIdsRef.current.has(sender)) return;
      getDriver(sender).handleNoteEvent(e);
    });
    return off;
  }, [userId, getDriver]);

  // Slice 24 (Stage Presence): a cast of three or more is a
  // crowd, and dancing in one is the badge's fact. Reported on
  // the cast-size edge only — the reducer counts presences, and
  // a cast that merely re-renders is not a new one.
  const crowdReportedRef = useRef(false);
  useEffect(() => {
    if (cast.length >= 3) {
      if (!crowdReportedRef.current) {
        crowdReportedRef.current = true;
        recordStagePresence(cast.length);
      }
    } else {
      crowdReportedRef.current = false;
    }
  }, [cast.length]);

  // Slice 24 (Stage Aura): the local rig wears the aura when its
  // primary earned Stage Presence and equipped it.
  const rewards = useRewards();

  const rigs = useMemo<StageRigSpec[]>(() => {
    const layout = new Map(layoutCast(cast).map((l) => [l.id, l]));
    return cast.map((p) => {
      const l = layout.get(p.id)!;
      return {
        key: p.id,
        driver: getDriver(p.id),
        position: l.position,
        rotationY: l.rotationY,
        tintHue: p.hue,
        label: p.name,
        isLocal: p.isLocal,
        style: p.isLocal ? localStyle : NEUTRAL_STYLE,
        aura: p.isLocal && rewards.equipped.aura,
      };
    });
  }, [cast, getDriver, localStyle, rewards.equipped.aura]);

  // Sampled piano voice, same lazy pack load as the piano layer.
  useEffect(() => {
    void ensureSoundfontPiano();
  }, []);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fill}>
        <Text style={styles.note}>Dancer Stage is a web stage for now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        camera={{ fov: 40, near: 0.1, far: 60, position: [0, 1.7, 4.6] }}
        onCreated={() => onReady?.()}
      >
        <StageScene
          rigs={rigs}
          fx={fx}
          figureEnabled={figureEnabled}
          drift={drift}
          themeHue={themeHue}
        />
      </Canvas>
      <ToneEngine />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#070a12",
  },
  note: { color: "#8fa3b8", fontSize: 13, margin: 24 },
});
