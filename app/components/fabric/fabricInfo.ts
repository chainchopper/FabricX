/**
 * fabricInfo — Slice 49: what the one info icon has to say.
 *
 * Terrell (Nov 3, 2026): "too much menu stuff is included over
 * our fabric space still, so a small animated info icon seems
 * in order which will pull up the fabric's information panel —
 * each fabric is different so."
 *
 * This module is the panel's whole content source, and it is
 * deliberately boring data: for every fabric, what it is (a
 * human line or two), its modes, the rules that matter to a
 * participant, and its controls — written from the fabric's own
 * truths (its ExperienceLayer definition, its layer laws), never
 * invented. The ghostie's tools here are NOT a second registry:
 * they are computed from the one registry (src/ghost/
 * ghostTools.ts) through the same gates the ghost itself is
 * refused by — the fabric rules resolved for this participant
 * exactly as the canvas resolves them for the ghost's scenario
 * (LegacyFluid's getGhostFabricContext: a guest is bound by the
 * host's rules; a host and an open room are permissive) and the
 * piano-layer gate Slice 31 put on the note tools. When Slice
 * 47's per-fabric tool manifest lands, it joins HERE — this
 * resolver is the seam it plugs into, and the panel never
 * changes.
 *
 * Pure module (type-only imports of the stores), so the check
 * can bundle it and prove the content.
 *
 * Slice 63 adds the fabric's feature toggles at the bottom of
 * this module: the derivation (which boolean per-layer settings
 * are THIS fabric's features) is data here, and
 * infotoggles-check proves it against the menu's own sources —
 * THIS LAYER's rendered blocks and gates, the generic
 * LayerControls, the fluid's control stack, the registry's
 * capability table, and the FABRICS editor's curated fields.
 *
 * Powered by Nirvana
 */

import { isGhostNoteLayer } from "../../../src/ghost/GhostBrain";
import {
  GHOST_TOOL_REGISTRY,
  type GhostToolId,
} from "../../../src/ghost/ghostTools";
import type { FabricRules } from "../../../src/session/fabricStore";

export interface FabricInfo {
  /** What this fabric is — one or two human lines. */
  about: string;
  /** The ways this fabric can be entered / run. */
  modes: readonly string[];
  /** Rules that matter to a participant standing in it. */
  rules: readonly string[];
  /** The controls that live on (or for) this fabric. */
  controls: readonly string[];
}

export const FABRIC_INFO: Record<string, FabricInfo> = {
  "default-fluid": {
    about:
      "The living liquid canvas — the fabric every other fabric grows from. A touch here lands as light, sound and a haptic bloom, on your screen and on every other screen in the room.",
    modes: [
      "Alone — the fluid breathes and drifts on its own while the room is quiet",
      "Together — everyone in the room draws on the same living surface",
      "Hosted — a host leads the session and picks the fabric for the room",
    ],
    rules: [
      "Nothing here is private to your screen: what you draw, the room feels",
      "In a hosted session, guests are told before the fabric changes",
      "Your ghostie lives on this canvas — touch it to pet it; it answers in light and sound, never words",
    ],
    controls: [
      "Draw — touch or drag anywhere on the canvas",
      "Ask — speak it into the compose bar at the bottom (“tickle, Boop”, “draw a heart”); typing lives in the Companion",
      "Sign — with Hands on, a held hand sign performs a verb (F menu → This layer)",
      "This fabric's settings — F menu → This layer",
    ],
  },
  "ar-piano": {
    about:
      "A piano layered over the living fluid — the fluid stays the ground, the keys are the instrument. Every note sounds here, streams through the liquid, and lands on every screen in the room.",
    modes: [
      "On the fluid — the piano never replaces the canvas; it plays on it",
      "Camera — the real room shows through behind the keys",
      "MIDI — a connected keyboard plays through the same note pipeline",
    ],
    rules: [
      "Every note is shared the moment it sounds — the room hears what you play",
      "The ghostie may answer a note with one of its own — an echo, an octave, a fifth — when the room's rules allow notes",
      "The keys stay while you play: they are the fabric, not chrome over it",
    ],
    controls: [
      "Play — the key strip at the bottom (tap, hold, glide)",
      "Ask the ghostie to play — say “play middle C” to the compose bar",
      "Hand tracking + MIDI — F menu → This layer",
    ],
  },
  "dancer-stage": {
    about:
      "A lit 3D stage of its own — not a layer on the fluid. The dancer standing on it is a ghostie embodied: yours is your own ghost, in its hue, moving to every note the room plays.",
    modes: [
      "Alone — the figure breathes and sways, the camera drifts; the stage is alive in the quiet",
      "Played — the key strip and the room's notes choreograph the rig",
      "Possessed — the dancer is its ghostie embodied, not a puppet: the ghostie's own temperament shapes how the figure moves, and when its ghostie performs — a verb, an answer — the figure is what performs it",
      "Your character — Trauma stands here by default; load your own UE5-boned character, or choose none, in This layer",
    ],
    rules: [
      "One dancer per participant — a figure on this stage is its owner's ghostie",
      "Nothing moves a dancer but its own ghostie and the room's music",
      "Asking lives on the fluid — speak it there; on stage, you play the dancer",
      "There is never a bare figure by accident: no character is a choice, and a failed load says so",
    ],
    controls: [
      "Stage keys — the slim strip at the bottom plays the dancer",
      "Verbs — sent from the fluid or a profile card, the dancer performs them as choreography",
      "Character + stage theme — F menu → This layer",
    ],
  },
  "genx-fold": {
    about:
      "The room's devices, one computer. Jobs are posted as bounties, split into shards, computed for real on the devices that join, and re-computed by the host before they count — verified work settles as Juice.",
    modes: [
      "Watch — spectate the field, or ride a participant's view without claiming work",
      "Join — lend this device to a mission after a short measured benchmark",
      "Node — a GenX node-controller on your network reports into the same field",
    ],
    rules: [
      "Lending is opt-in and off by default — this device computes only when you turn it on",
      "A shard counts only when the host re-computes it and the checksums match: claimed is not verified",
      "Juice is paid only for verified work, split by verified share — the shares sum to one",
      "The host allocates; in an open room, whoever starts a mission is its allocator",
    ],
    controls: [
      "The bounty board — join, follow, spectate (the board is this fabric's own surface)",
      "View structure — open the molecule a job is folding",
      "Lend this device + the node address — F menu → This layer",
    ],
  },
  "sam-see": {
    about:
      "The camera, made touchable. Name a thing the camera sees and SAM 3.1 cuts it out as a region on the fabric — touch the region and the act lands on the shared canvas.",
    modes: [
      "Camera canvas — the front camera fills the fabric; SAM's outlines and your ghostie's acts land on the picture itself",
      "Segment — name it, and its outline becomes a handle",
    ],
    rules: [
      "A region fired from here is a touch on the shared fabric — the room sees and feels it land",
      "A resting fabric is a resting eye: nothing self-plays, and the camera pauses when this fabric isn't front",
    ],
    controls: [
      "Name a thing — the fabric's field, above the canvas",
      "Touch an outline — segment, then act",
      "Analyze a photo — the tools panel, when a vision model is configured in AI Settings",
      "This fabric's settings — F menu → This layer",
    ],
  },
  "camera-effects": {
    about:
      "Real-time filters worn over the fabric — the camera dresses itself while the room's shared state stays exactly as it was.",
    modes: ["Wear — pick a filter and wear it over the live camera"],
    rules: [
      "Filters dress your camera only — they never change what the room shares",
    ],
    controls: ["Filter + intensity — F menu → This layer"],
  },
  "ghostie-playground": {
    about:
      "The ghostie's own room — the one fabric that belongs to it. Everything it can do is out on the table here: summon its tools one by one, talk to it, play notes with it, pet it, and watch it idle and think.",
    modes: [
      "Alone with it — its own room, no host and no audience; the ghost at home",
      "Exercising — every ask runs the real brain path, so an answer can honestly be “not right now”",
      "Free play — between your asks it idles, drifts, thinks and plays on its own",
    ],
    rules: [
      "What it does here, it does for real — a button is a spoken ask by another road, never a recording",
      "It can still say no: its cooldowns, its budget and its mood are part of the ghost, here as everywhere",
      "Notes played here are real notes — sounded, streamed into the fluid, and heard by the ghost itself",
    ],
    controls: [
      "The tool tray — heartbeat, verb, drawing and note asks, one by one (it parks behind “Show tools”)",
      "The key strip — play notes; the ghost hears them and may answer with its own",
      "Talk — the compose bar below, voice first; the tray's chips speak an ask out loud",
      "Pet it — stroke it on the canvas, like everywhere",
    ],
  },
  forge: {
    about:
      "A 3D scene made of pure data — geometry, materials and light in one recipe, drawn live on a WebGL2 canvas of its own. Where the fluid is a surface, the Forge is a place: a scene that can be authored and re-authored, built for your ghostie to shape.",
    modes: [
      "The starter scene — a floor and five shapes in studio light, standing as the fabric opens",
      "Breathing — the camera drifts in a slow orbit while the room is quiet; the scene is present, never a frozen frame",
    ],
    rules: [
      "Its own canvas, its own room — nothing of the fluid's surface applies here, and the fluid does not run underneath",
      "The scene is data: every shape, material and light in it is named in the recipe that draws it",
      "The Forge needs WebGL2 — where a browser doesn't have it, the fabric says so on a labeled screen instead of opening blank",
    ],
    controls: [
      "Open it — its card in the FABRICS gallery",
      "This fabric's settings — F menu → This layer",
    ],
  },
};

/** The info record for a fabric id, or null when it has none. */
export function fabricInfoFor(id: string | null | undefined): FabricInfo | null {
  if (!id) return null;
  return FABRIC_INFO[id] ?? null;
}

/** Canvas kinds, derived exactly as the ghost's fabric context derives them. */
export type FabricCanvasKind = "fluid" | "stage3d" | "camera";

export function canvasKindFor(exp: {
  canvas?: string;
  type?: string;
}): FabricCanvasKind {
  if (exp.canvas === "stage3d") return "stage3d";
  // Slice 64: the declared canvas kind is the truth now (See
  // declares "camera" in the registry); the type read remains
  // only as the fallback for records written before the
  // declaration existed.
  if (exp.canvas === "camera") return "camera";
  if (exp.type === "sam-see") return "camera";
  return "fluid";
}

/**
 * Where the info icon docks, per fabric: bottom-right, riding
 * above the fabric's own bottom control band so it never covers
 * a play surface. The band heights are the ones Slice 44's
 * anchor map certified (fluid HUD band 98, stage 144, piano
 * 214) + 12 of air. The Fold is the exception that proves the
 * rule: its board cluster's bottom edge sits at 118, so the
 * icon rides in the air gap UNDER the board — bottom edge 66
 * (above the compose pill's 62), top edge 110, a clear 8pt of
 * air below the board — right-aligned with the board's frame,
 * overlapping nothing. The check asserts these gaps numerically.
 */
export const FABRIC_ICON_BOTTOM: Record<string, number> = {
  "default-fluid": 110,
  "ar-piano": 226,
  "dancer-stage": 156,
  "genx-fold": 66,
  "sam-see": 110,
  "camera-effects": 110,
  // The Playground's tray docks bottom-LEFT on this same baseline
  // (its right edge stays clear of the icon's corner) — one band,
  // two corners, no overlap.
  "ghostie-playground": 110,
};
export const FABRIC_ICON_BOTTOM_DEFAULT = 110;
export const FABRIC_ICON_RIGHT = 12;
export const FABRIC_ICON_SIZE = 44;

export function iconBottomFor(id: string | null | undefined): number {
  if (!id) return FABRIC_ICON_BOTTOM_DEFAULT;
  return FABRIC_ICON_BOTTOM[id] ?? FABRIC_ICON_BOTTOM_DEFAULT;
}

/* ------------------------------------------------------------------ */
/* The ghostie's tools, here                                          */
/* ------------------------------------------------------------------ */

export interface GhostToolHere {
  id: GhostToolId;
  /** Short human name. */
  label: string;
  /** What it does, in one line. */
  line: string;
  /** May the ghost use it on THIS fabric, under these rules? */
  available: boolean;
  /** When not available: why, in product language. Null when available. */
  note: string | null;
}

const TOOL_LABEL: Record<GhostToolId, { label: string; line: string }> = {
  "splat-play": {
    label: "Splat & verb play",
    line: "Mirror, sniff, startle, drift, play, nap — and the heart — performed in light and sound.",
  },
  draw: {
    label: "Drawing",
    line: "The ghost draws shapes at its body — ring, spiral, line, arc, burst, heart.",
  },
  "verb-perform": {
    label: "Asked verbs",
    line: "Name a verb (“tickle, Boop”) and the ghost performs it as its own act.",
  },
  "heartbeat-answer": {
    label: "Heartbeat answers",
    line: "Ask for its heartbeat and it answers with a pulse at its own live tempo.",
  },
  "play-note": {
    label: "Note answers",
    line: "Play a note and the ghost may answer — an echo, an octave, a fifth by temperament.",
  },
  "note-perform": {
    label: "Asked notes",
    line: "Ask it to play — “play middle C”, “play that again”, an arpeggio.",
  },
};

const RULES_OFF = "Off under this room's rules";

/**
 * The ghost's tool list for one fabric, in registry order, with
 * availability computed through the registry's own gates:
 * draw is refused where the fabric's rules refuse drawing (and
 * the stage has no drawing surface — the draw sink is the
 * fluid's recipe player); the note tools live on the note
 * layers under the notes rule (Slice 31's piano; Slice 53's
 * Playground, whose layer brings its own note surface — the
 * one list is GhostBrain's isGhostNoteLayer); asked verbs ride
 * the verbs rule the send funnel enforces. Slice 47's per-fabric
 * manifest joins at this seam when it lands.
 */
export function ghostToolsHere(
  layerId: string,
  canvas: FabricCanvasKind,
  rules: FabricRules
): GhostToolHere[] {
  return GHOST_TOOL_REGISTRY.map((tool) => {
    const base = { id: tool.id, ...TOOL_LABEL[tool.id] };
    switch (tool.id) {
      case "draw":
        if (canvas === "stage3d")
          return {
            ...base,
            available: false,
            note: "The stage has no drawing surface",
          };
        return rules.draw
          ? { ...base, available: true, note: null }
          : { ...base, available: false, note: RULES_OFF };
      case "verb-perform":
        return rules.verbs
          ? { ...base, available: true, note: null }
          : { ...base, available: false, note: RULES_OFF };
      case "play-note":
      case "note-perform":
        if (!isGhostNoteLayer(layerId))
          return {
            ...base,
            available: false,
            note: "The ghost plays notes at the Piano",
          };
        return rules.notes
          ? { ...base, available: true, note: null }
          : { ...base, available: false, note: RULES_OFF };
      case "heartbeat-answer":
        return canvas === "stage3d"
          ? {
              ...base,
              available: false,
              note: "Ask on the fluid — the answer is a pulse of light",
            }
          : { ...base, available: true, note: null };
      case "splat-play":
      default:
        return canvas === "stage3d"
          ? {
              ...base,
              available: true,
              note: null,
              line: "On stage, these become the dancer's choreography.",
            }
          : { ...base, available: true, note: null };
    }
  });
}

/* ------------------------------------------------------------------ */
/* The fabric's features, as toggles (Slice 63)                        */
/* ------------------------------------------------------------------ */

/**
 * A feature of a fabric that can be on or off: one of the
 * layer's own per-layer settings — a boolean specific.* key in
 * the config the settings mirror persists per layer id
 * (fabric_layer_settings_v1:<layerId>) — under the name THIS
 * LAYER gives it, with the state it rests in when nothing is
 * stored.
 */
export interface LayerFeature {
  /** The specific.* key the toggle reads and writes. */
  key: string;
  /** THIS LAYER's own name for it. */
  label: string;
  /**
   * The resting state when nothing is stored. THIS LAYER reads
   * a default-on feature as `value !== false` and a default-off
   * feature as `value === true`; the panel reads it the same
   * way (layerFeatureActive), so the two surfaces can never
   * disagree about an untouched layer.
   */
  defaultOn: boolean;
}

const FEATURE_GHOST: LayerFeature = {
  key: "ghostEnabled",
  label: "Ghost in this layer",
  defaultOn: true,
};
const FEATURE_AMBIENT: LayerFeature = {
  key: "ambientEnabled",
  label: "Ambient life",
  defaultOn: true,
};
const FEATURE_MOTION: LayerFeature = {
  key: "motionEnabled",
  label: "Motion",
  defaultOn: false,
};
const FEATURE_HANDS: LayerFeature = {
  key: "handsEnabled",
  label: "Hands",
  defaultOn: false,
};
const FEATURE_DANCERS: LayerFeature = {
  key: "stageDancerEnabled",
  label: "Dancers",
  defaultOn: true,
};
const FEATURE_CAMERA_DRIFT: LayerFeature = {
  key: "stageCameraDrift",
  label: "Camera drift",
  defaultOn: true,
};
const FEATURE_LEND: LayerFeature = {
  key: "lendDevice",
  label: "Lend this device",
  defaultOn: false,
};
const FEATURE_MIDI: LayerFeature = {
  key: "midiEnabled",
  label: "Notes → Fabric",
  defaultOn: true,
};
const FEATURE_AMBIENCE_SOUND: LayerFeature = {
  key: "ambienceEnabled",
  label: "Ambience",
  defaultOn: false,
};
const FEATURE_MUSIC: LayerFeature = {
  key: "musicEnabled",
  label: "Generative music",
  defaultOn: false,
};
const FEATURE_CHORALE: LayerFeature = {
  key: "choraleEnabled",
  label: "Sing with other ghosties",
  defaultOn: true,
};

/**
 * The three features THIS LAYER renders for EVERY layer,
 * ungated: the ghost's tenancy, the idle contract's ambient
 * life, and motion. Any layer the ExperienceContext can
 * activate supports exactly these, before its own extras.
 */
export const UNIVERSAL_LAYER_FEATURES: readonly LayerFeature[] = [
  FEATURE_GHOST,
  FEATURE_AMBIENT,
  FEATURE_MOTION,
];

/**
 * Each fabric's features, in THIS LAYER's render order. The
 * table is DERIVED, not freehand — every row names a bool
 * toggle THIS LAYER (or a control it renders) actually offers
 * on that fabric, and infotoggles-check re-derives it from the
 * sources and fails on any drift:
 *
 * - THIS LAYER's own blocks (FabricMenu): the universal three
 *   for every layer; Hands behind its handsAppliesHere gate
 *   (the fluid + See); Dancers and Camera drift on the Dancer
 *   Stage; Lend this device on The Fold.
 * - THIS LAYER's generic LayerControls: a MIDI toggle
 *   (specific.midiEnabled, resting ON) for every non-fluid
 *   layer whose registry entry declares the midi capability —
 *   the Piano, the Stage, the Playground. The fluid never
 *   renders LayerControls; its own control stack stands there.
 * - The fluid's stack (its AmbienceControls / MusicControls,
 *   which render only on the fluid): Ambience and Generative
 *   music, both resting off, and — beside the music in the
 *   same controls — Sing with other ghosties (Slice 70's
 *   chorale opt-out), resting ON so it reads as the music
 *   toggle's companion, not a second ask.
 *
 * Cross-checks the derivation holds: the FABRICS editor's
 * curated LAYER_EDIT_FIELDS bool entries are a subset of this
 * table for every fabric it curates, and the Fold and the
 * Playground — which the editor does not curate at all — take
 * their features from THIS LAYER alone.
 *
 * Deliberately NOT features: the editor's choice fields
 * (pianoVoice, stageTheme, stageTraumaIdle — picks, not
 * on/off features; they stay in THIS LAYER and the editor);
 * the Fold's node address (a value, not a switch); the
 * Controller role (the device's own store, not the layer's
 * config — THIS LAYER itself says so); LayerControls' AR
 * camera switch (the AR context's state, not a layer setting);
 * samEnabled (a config default no surface toggles).
 */
const LAYER_FEATURES: Record<string, readonly LayerFeature[]> = {
  "default-fluid": [
    FEATURE_AMBIENCE_SOUND,
    FEATURE_MUSIC,
    FEATURE_CHORALE,
    ...UNIVERSAL_LAYER_FEATURES,
    FEATURE_HANDS,
  ],
  "ar-piano": [FEATURE_MIDI, ...UNIVERSAL_LAYER_FEATURES],
  "sam-see": [...UNIVERSAL_LAYER_FEATURES, FEATURE_HANDS],
  "dancer-stage": [
    FEATURE_MIDI,
    FEATURE_GHOST,
    FEATURE_AMBIENT,
    FEATURE_DANCERS,
    FEATURE_CAMERA_DRIFT,
    FEATURE_MOTION,
  ],
  "genx-fold": [...UNIVERSAL_LAYER_FEATURES, FEATURE_LEND],
  "ghostie-playground": [FEATURE_MIDI, ...UNIVERSAL_LAYER_FEATURES],
};

/**
 * The features of one fabric. A fabric with no entry of its
 * own gets exactly the universal three — the blocks THIS LAYER
 * renders for any layer — and nothing invented.
 */
export function layerFeaturesFor(
  id: string | null | undefined
): readonly LayerFeature[] {
  if (!id) return UNIVERSAL_LAYER_FEATURES;
  return LAYER_FEATURES[id] ?? UNIVERSAL_LAYER_FEATURES;
}

/** A feature's live state, read exactly as THIS LAYER reads it. */
export function layerFeatureActive(
  feature: LayerFeature,
  specific: Record<string, unknown> | null | undefined
): boolean {
  const v = specific?.[feature.key];
  return feature.defaultOn ? v !== false : v === true;
}

/**
 * The write behind a panel toggle: the new specific object
 * updateConfig merges into the layer's config — the same shape
 * every THIS LAYER setter builds ({ ...specific, key: next }),
 * so a flip here and a flip there are the same write into the
 * same per-layer store, and the settings mirror persists both
 * under the same key.
 */
export function withLayerFeature(
  specific: Record<string, unknown> | null | undefined,
  feature: LayerFeature,
  next: boolean
): Record<string, unknown> {
  return { ...(specific ?? {}), [feature.key]: next };
}
