# The Dancer Stage

The Frequency Dancer is a **fabric of its own** — not an overlay on
the fluid. The `dancer-stage` experience owns a full
react-three-fiber 3D stage: its own camera, real-time lights, a GPU
shader floor, and a rigged figure that dances to every note in the
room. The fluid canvas is **not** mounted beneath it; fluid-derived
work appears inside the stage only as *effects* (hue ripples on the
shader floor, note-tinted motes).

## Canvas-kind registration

Experiences declare their ground via `ExperienceLayer.canvas`
(`src/types/experience.ts`):

| `canvas`      | Ground                                                        |
| ------------- | ------------------------------------------------------------- |
| *(undeclared)* / `"fluid"` | The LegacyFluid WebGL canvas; layers stack on it. |
| `"stage3d"`   | The experience owns a full R3F stage as THE canvas.           |

`dancer-stage` is registered in `src/contexts/ExperienceContext.tsx`
with `canvas: "stage3d"`, its own room (`specific.roomId: "stage"`),
and idle contract **`breathe`**. `ExperienceRenderer` branches on
the canvas kind and mounts `src/dancer/DancerStage.tsx` instead of
the fluid. Every pre-existing layer is unchanged.

## The stage

- **Camera**: perspective (fov 40), cinematic default framing on the
  figure, slow idle drift (sinusoidal sway) when *Camera drift* is
  on, drag-orbit within limits (yaw ±0.95 rad, pitch −0.02…0.55),
  damped so it settles like a held camera.
- **Lights**: warm-white key (directional, front-right), theme-hued
  rim (directional, back-left), two point accents at the front
  corners that flash in each note's hue and decay.
- **Floor**: a ground disc with a custom `ShaderMaterial` — theme
  glow, a slow concentric sheen, and up to 6 concurrent **note
  ripples**: expanding rings in the firing note's hue, fed per-frame
  from the shared stage-fx queue (no React state at note rate).
- **Motes**: 240 additive points drifting in a slow swirl, tinted
  toward the recent notes' hues mixed with the stage theme.
- **Fog**: depth fog matched to the backdrop color.

## The body

`src/dancer/DancerRig.tsx` builds a procedural mannequin on the
**UE5 Mannequin skeleton**: a `THREE.Skeleton` of named bones
skinned to capsule segments in a single `SkinnedMesh`, one material
per driver band so a firing band **glows emissive in its note's
hue**. `DancerDriver` (unchanged from the spike — `scripts/
dancer-check.mjs` still passes) produces per-band offsets with
spring return-to-rest; the rig composes joint rotations over each
figure's captured rest pose.

### Band → bones

| Band  | MIDI    | Bones driven                                             |
| ----- | ------- | -------------------------------------------------------- |
| head  | 68–127  | `neck_01`, `head`                                        |
| chest | 64–67   | `spine_02`, `spine_03`, `clavicle_l`, `clavicle_r`       |
| arms  | 60–63   | `upperarm_l/r`, `lowerarm_l/r`, `hand_l/r`               |
| torso | 56–59   | `spine_01`                                               |
| hips  | 52–55   | `pelvis`                                                 |
| legs  | 0–51    | `thigh_l/r`, `calf_l/r`, `foot_l/r`, `ball_l/r`          |

### Verb choreography

Verbs ride the same band channels as additive gesture envelopes:

| Verb   | Gesture                                                        |
| ------ | -------------------------------------------------------------- |
| HEART  | Both arms lift and open, chest swells (~1.7 s).                |
| CHEER  | Arms up with an alternating wave, legs bounce (~1.9 s).        |
| TICKLE | Fast hips/torso wiggle, decaying (~1.3 s).                     |

Local verbs fire from the shared VerbBar; remote verbs arrive as
room interactions and fire on every dancer in the room. Session
modes (Slice 5) gate all sends inside the transport funnel, exactly
as on the piano layer: view-only and mirror guests transmit
nothing. Notes out use the piano's diff contract (held-set diff →
`sendNote`, flushed off on unmount) minus the fluid nozzle streams.
The driver stays **subscribe-only** on the note bus.

## The character slot (glTF contract)

THIS LAYER → **Load character (glTF)** takes a `.glb` / `.gltf`
file, read locally via an object URL (nothing is uploaded or
bundled). If the model exposes the bones below, it replaces the
mannequin and the same driver animates it:

- Binding is **by bone NAME** — any `Object3D`/bone in the scene
  whose name matches is adopted; rest pose is captured at load.
- **Full contract** (UE5 Mannequin names): `pelvis`, `spine_01`,
  `spine_02`, `spine_03`, `neck_01`, `head`, `clavicle_l`,
  `clavicle_r`, `upperarm_l`, `upperarm_r`, `lowerarm_l`,
  `lowerarm_r`, `hand_l`, `hand_r`, `thigh_l`, `thigh_r`,
  `calf_l`, `calf_r`, `foot_l`, `foot_r`, `ball_l`, `ball_r`.
- `pelvis` is the one required bone (the driver needs a root to
  move). **Missing bones are skipped silently** — a partially
  matching rig dances with the joints it has.
- The model is normalized on load: scaled to ~1.78 m, feet on the
  floor, centered on the stage.
- A model that fails to load (bad file, no `pelvis`) reports
  "failed" in settings and **the mannequin keeps the stage**.
- Band emissive glow is a mannequin-material feature; a loaded
  character keeps its authored materials — the floor ripples and
  accent lights carry the note reaction for it.
- **Restore mannequin** in settings clears the slot.

## Stage settings (THIS LAYER, `specific.*`)

| Key                  | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| `stageDancerEnabled` | Figure dances vs stands at rest (default on).       |
| `stageCameraDrift`   | Camera idle sway (default on).                      |
| `stageTheme`         | `cyan` \| `violet` \| `magenta` \| `amber` rim/floor hue. |
| `roomId`             | The stage's room (default `"stage"`).               |

Playable surface: the HUD mounts the piano keyboard **slim** as the
stage key strip; hardware MIDI joins through the same note bus.

## What was removed from the piano layer

The flat `FrequencyDancer` overlay (spike v0) is **unmounted** —
the HUD mount and the piano layer's *Dancer* toggle are gone (the
menu now points to the stage). `src/components/piano/
FrequencyDancer.tsx` remains in the tree as the spike's record
only; `DancerDriver` and `scripts/dancer-check.mjs` are untouched
and still the choreography source.
