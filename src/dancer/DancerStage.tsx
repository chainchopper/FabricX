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
 * - The built-in character (Trauma, Slice 25) is remembered BY
 *   THE LAYER: THIS LAYER's `stageTraumaIdle` names the idle,
 *   and this stage rebinds that same-origin GLB whenever it
 *   mounts with an empty slot. A picked custom file is session
 *   state (an object URL); the built-in is a URL the layer
 *   itself can hold, so the pick survives reloads. THE RULE,
 *   FINAL (Terrell, Nov 2, two messages read together): on the
 *   stage, Trauma is THE figure — an unset setting binds the
 *   Trauma MMA default ("There is never a bare figure. We
 *   have the figure we want. I uploaded it. It's trauma.");
 *   a stored catalog pick wins; "Restore mannequin" stores
 *   the explicit "none" pick — the ONLY standing bare figure,
 *   besides a labeled load failure. His other Nov 2 sentence
 *   ("The initial fabric and default is the fluid") is about
 *   the LANDING, and Slice 38's ExperienceContext fix stands:
 *   nothing lands on this stage uninvited — you arrive here
 *   by choosing the fabric, and when you do, he's standing.
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
 * cast dances vs stands at rest), stageCameraDrift, stageTheme,
 * stageTraumaIdle (the built-in character's idle pick).
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
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Canvas } from "@react-three/fiber";
import { ChromeMount } from "../components/ui/ChromeMount";
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
import {
  getStageCharacterState,
  setStageCharacterRemote,
  subscribeStageCharacter,
  type StageCharacterState,
} from "./stageCharacter";
import { resolveBuiltinBind } from "./traumaCharacter";
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
  // THIS LAYER's built-in character setting: an idle id from
  // the Trauma catalog, the explicit "none" (Restore
  // mannequin), or null when the layer never stored one — null
  // still binds the default (see the resolution below).
  const traumaIdleSetting =
    typeof specific.stageTraumaIdle === "string"
      ? specific.stageTraumaIdle
      : null;

  // Bind the layer's built-in character on mount (see header):
  // only into an EMPTY slot — a character the user bound this
  // session (either idle, or their own picked file) is never
  // overridden. The resolution is resolveBuiltinBind (the
  // final Nov 2 rule): a stored catalog pick binds that idle;
  // unset binds the Trauma MMA default — on this stage he is
  // the figure; the explicit "none" alone resolves to null.
  // While the bind loads, NO figure stands (DancerRig hides
  // the mannequin for a loading slot; the note below says why
  // the stage is empty). A failed load reports through the
  // slot, the mannequin stands as the fallback, and the
  // failure pill below shows it on stage; the URL stays in
  // the store, so this never retry-loops.
  useEffect(() => {
    const def = resolveBuiltinBind(traumaIdleSetting);
    if (!def) return;
    if (getStageCharacterState().url) return;
    setStageCharacterRemote(def.url, def.characterName);
  }, [traumaIdleSetting]);

  // Slice 37: the slot's live state, for the stage overlays —
  // a bind that LOADS or FAILS must be visible HERE, on the
  // stage, not only as a status line inside the settings panel
  // (which is itself two taps away and was a stacked mess in
  // the same report). Loading shows the quiet note below (and
  // no figure — DancerRig); failure shows its pill.
  const [charState, setCharState] = useState<StageCharacterState>(() =>
    getStageCharacterState()
  );
  useEffect(() => subscribeStageCharacter(setCharState), []);

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
    <View style={[styles.fill, webViewportHeight]}>
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
      {/* Slice 37: a failed character bind, visible on stage.
          Until now the failure lived only as a status line in
          THIS LAYER's settings — the stage silently kept the
          mannequin and read as "my character is ignored". The
          pill is honest, small, and gone the moment a character
          binds. pointerEvents none: it reports, it never blocks. */}
      {/* Slice 44 (chrome discipline): the pill enters/leaves
          through ChromeMount and sits at the stage's declared
          status anchor (top:106 — below the shared status-chip
          slot), not bare-mounted at top:72 inside it. */}
      <ChromeMount
        visible={charState.status === "failed"}
        pointerEvents="none"
        style={styles.charFailWrap}
      >
        <View style={styles.charFailPill}>
          <Text style={styles.charFailText}>
            Character didn’t load — showing the fallback figure
          </Text>
        </View>
      </ChromeMount>
      {/* While a character (the built-in default/pick, or a
          picked file) is loading, the stage stands EMPTY —
          DancerRig renders no figure for a loading slot — and
          this quiet note says why. The bare figure is never a
          loading placeholder: it reads as "the mannequin is
          the dancer", which is the exact misread Terrell
          flagged. The note is product language, pointerEvents
          none, gone the moment the character binds. */}
      <ChromeMount
        visible={charState.status === "loading"}
        pointerEvents="none"
        style={styles.charLoadWrap}
      >
        <View style={styles.charLoadPill}>
          <Text style={styles.charLoadText}>Loading your character…</Text>
        </View>
      </ChromeMount>
    </View>
  );
}

// Slice 37 (web): pin the stage to the DYNAMIC viewport height.
// The absolute-inset chain sizes against the layout viewport;
// when iOS strands the page after the keyboard closes (the old
// on-canvas compose field's focus theft did exactly this —
// Hotfix 2.3's note), the layout box stays keyboard-short and
// the canvas ended ~60% down over unstyled white page (Terrell's
// Nov 1 shot). 100dvh tracks the viewport the user actually
// sees, so the stage reaches the bottom of the screen in every
// state; the stage's own background rides the same box, so no
// white can show beneath the canvas either.
const webViewportHeight = (
  Platform.OS === "web" ? { height: "100dvh" } : null
) as ViewStyle | null;

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
  charFailWrap: {
    position: "absolute",
    // Slice 44: the stage's declared status anchor — clears the
    // shared chip slot (ends y=97) and the Essence (ends y=86).
    top: 106,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  charFailPill: {
    maxWidth: "88%",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.55)",
    backgroundColor: "rgba(12,10,18,0.92)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  charFailText: { color: "#fecaca", fontSize: 12, fontWeight: "600" },
  charLoadWrap: {
    position: "absolute",
    top: 106,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  charLoadPill: {
    maxWidth: "88%",
    borderWidth: 1,
    borderColor: "rgba(148,184,220,0.4)",
    backgroundColor: "rgba(10,14,24,0.88)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  charLoadText: { color: "#b8cadd", fontSize: 12, fontWeight: "600" },
});
