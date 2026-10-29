# The Dancer Stage

The Frequency Dancer is a **fabric of its own** — not an overlay on
the fluid. The `dancer-stage` experience owns a full
react-three-fiber 3D stage: its own camera, real-time lights, a GPU
shader floor, and a cast of rigged figures. The fluid canvas is
**not** mounted beneath it; fluid-derived work appears inside the
stage only as *effects* (hue ripples on the shader floor,
note-tinted motes).

## Stage v2 — the cast of ghosties

*"Each participant gets one. (Their ghostie.)"* — Terrell, Oct 28.

The stage's figure is not a neutral mannequin. **Every participant
in the room gets ONE dancer, and that dancer IS their ghostie
embodied** — their identity, dancing their music:

- **The cast**: one rig per participant, capped at **6 rigs** (a
  perf guard — each rig is a skinned mesh plus its own spring
  driver). Participants past the cap wait **in the wings**: present
  in the room, heard, rippling the floor — bodiless until a slot
  frees. The local rig stands **center-front**; remotes fan on an
  arc behind it, and the camera pulls back as the cast grows so
  the ensemble stays in frame.
- **Identity on the body**: each mannequin is **tinted by its
  owner's signature hue** and wears a **floating name tag**. The
  local rig wears the local **ghost's own name and hue** — from
  its persisted identity record (`fabric_ghost_v1`), or the
  Slice 9 LifePacket derivation before the ghost has ever run; it
  is the ghostie, not the human's avatar. Remote rigs wear the
  name + hue from their owners' **peer-announce** cards (Slice 6)
  — the only identity presence carries. A participant whose card
  hasn't landed yet gets their short id as a label and a stable
  placeholder tint, replaced the moment the card arrives.
- **Attribution — their own music moves them**: wire notes have
  always carried their sender (`from` on the note envelope); the
  transport now hands it through the note bus, and a rig's driver
  is fed **only its owner's notes**. Verbs are attributed the same
  way: a HEART from Maya choreographs **Maya's** ghostie. A ghost's
  own sends (`ghost:<ownerId>`) belong to its owner's rig.
  **Unattributed** bus notes — a host track, an ambient generator,
  any anonymous local source — move the **local rig only**: your
  ghostie answers the room's ambient music, and nobody else's body
  is puppeteered by an anonymous source. The floor ripples, accent
  lights, and motes stay **room-wide**: they answer every note.
- **Temperament in the body**: the local ghostie's style scales
  with its **live temperament and presence** from the ghost store
  (sleepy = smaller, softer sway; playful = bigger bounce; sassy,
  curious, affectionate each lean their own way) — applied in the
  rig's pose layer, the driver's springs untouched. A **remote**
  ghost's temperament is **not on the wire** (announce carries
  name + hue only), so remote rigs dance with a neutral style:
  their hue and their music are real, their inner weather is
  theirs. On a session where the local ghost's brain hasn't run
  yet, the local rig is neutral too, under its true name and hue.
- **The character slot is YOUR ghostie's body**: a loaded glTF
  binds to the **local rig only**. Models never travel over the
  wire (recipes-not-payloads) — on everyone else's screen your
  ghostie wears its hue mannequin, and on yours, theirs do.
- **Figure toggle**: `stageDancerEnabled` now governs the **whole
  cast** — off, every ghostie stands at rest while the floor and
  lights keep answering the music.

The cast rules live in pure, headlessly-checked functions
(`src/dancer/stageRoster.ts`, `scripts/stage-cast-check.mjs`):
cast building + cap, stage blocking, sender normalization,
temperament styles.

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
hue**. In v2 there is one rig per participant, each with its **own
`DancerDriver`** fed only its owner's notes (the driver class is
unchanged from the spike — `scripts/dancer-check.mjs` still
passes); the driver produces per-band offsets with spring
return-to-rest, and the rig composes joint rotations over each
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
room interactions. Either way a verb choreographs **its sender's
rig only** (v2 attribution — see above). Session
modes (Slice 5) gate all sends inside the transport funnel, exactly
as on the piano layer: view-only and mirror guests transmit
nothing. Notes out use the piano's diff contract (held-set diff →
`sendNote`, flushed off on unmount) minus the fluid nozzle streams.
Drivers stay **subscribe-only** on the note bus; the bus events now
carry the sender (`from`) for remote notes.

## The character slot (glTF contract)

THIS LAYER → **Load character (glTF)** takes a `.glb` / `.gltf`
file, read locally via an object URL (nothing is uploaded or
bundled). If the model exposes the bones below, it replaces the
mannequin **on the local rig** and the same driver animates it —
the character is **your ghostie's body**; remote ghosties always
wear their hue mannequins, on every screen including yours.

- Binding is **by bone NAME** — any `Object3D`/bone in the scene
  whose name matches is adopted; rest pose is captured at load.
- **Full contract** (UE5 Mannequin names): `pelvis`, `spine_01`,
  `spine_02`, `spine_03`, `neck_01`, `head`, `clavicle_l`,
  `clavicle_r`, `upperarm_l`, `upperarm_r`, `lowerarm_l`,
  `lowerarm_r`, `hand_l`, `hand_r`, `thigh_l`, `thigh_r`,
  `calf_l`, `calf_r`, `foot_l`, `foot_r`, `ball_l`, `ball_r`.
- **Mixamo skeletons bind too** (Slice 25): a Mixamo export's
  authored names (`mixamorig:Hips.2`, `mixamorig:Spine1.4`, ...)
  are normalized (prefix + Blender `.N` suffix stripped) and
  mapped onto the contract by `src/dancer/mixamoBones.ts` —
  Hips→pelvis, Spine/Spine1/Spine2→spine_01/02/03,
  LeftArm/LeftForeArm/LeftHand→the arm chain, LeftUpLeg/LeftLeg/
  LeftFoot/LeftToeBase→the leg chain, and mirrors. Resolution
  reads the name the author wrote: GLTFLoader renames nodes to a
  sanitized unique form and preserves the authored name in
  `userData.name`. Unmapped bones (fingers, end helpers) are
  skipped like any missing bone.
- **A character with a clip idles** (Slice 25): if the loaded
  model carries an animation, an `AnimationMixer` loops its
  first clip as the body's base layer and the driver's band
  impulses compose additively over each frame's clip pose — the
  notes still move the body down the bands while it idles. With
  the figure switched off the mixer rests and the body composes
  over its bind pose, like the rest of the cast.
- `pelvis` is the one required bone (the driver needs a root to
  move). **Missing bones are skipped silently** — a partially
  matching rig dances with the joints it has.
- The model is normalized on load: scaled to ~1.78 m, feet on the
  floor, centered on the stage.
- A model that fails to load (bad file, no `pelvis`) reports
  "failed" in settings and **the mannequin keeps the stage**.
- Band emissive glow is a mannequin-material feature; a loaded
  character keeps its authored materials — washed lightly (22%)
  toward its owner's hue so the ghostie's identity still reads —
  and the floor ripples and accent lights carry the note
  reaction for it.
- **Restore mannequin** in settings clears the slot.

### The built-in character: Trauma

THIS LAYER also offers **Trauma**, a Mixamo character that ships
with the stage (Slice 25, `src/dancer/traumaCharacter.ts`). Each
GLB is the full character **and** one looping idle in a single
file — **MMA idle** (~5.0 s) or **Bouncing fight** (~2.97 s);
picking one binds it, and the layer remembers the pick
(`stageTraumaIdle`, default MMA) so the stage rebinds it on
mount. The files are ~5 MB binaries: they are **never bundled** —
they live as same-origin static files in `public/animations/`
(the soundfonts' route), lazy-loaded by URL only when bound,
behind the one config constant `CHARACTER_ASSET_BASE_URL`.

Because the repo's automated write path is text-only, the GLBs
are committed as a **base64 transport** (Slice 26): sequential
≤900 KB text parts `trauma-*.glb.b64.00`, `.01`, … A built-in
bind resolves its bytes in order — the raw `.glb` first (a real
binary upload at the same path always wins), then the transport
parts fetched in order, concatenated, decoded in the browser,
and parsed in memory (`loadBuiltinCharacterGltf` in
`traumaCharacter.ts`; picked files never take this path). If no
decodable bytes are in place the bind reports "failed" and the
mannequin keeps the stage. `public/animations/README.md`
documents both forms, the verified SHA-256s, and how to
regenerate the parts. Trauma binds to the local rig only, wears
the ghostie's hue wash + name tag, and his idle is his rest:
the stage's `breathe` contract, embodied.

## Stage settings (THIS LAYER, `specific.*`)

| Key                  | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| `stageDancerEnabled` | The whole cast dances vs stands at rest (default on). |
| `stageCameraDrift`   | Camera idle sway (default on).                      |
| `stageTheme`         | `cyan` \| `violet` \| `magenta` \| `amber` rim/floor hue. |
| `stageTraumaIdle`    | Built-in character (Trauma) idle: `mma` (default) \| `bouncing`; unset = no built-in bound. |
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
