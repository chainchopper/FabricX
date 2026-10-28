/**
 * stageRoster — the Dancer Stage's cast logic (Stage v2: "Ghostie
 * Dancers"), as pure framework-free functions so the cast rules can
 * be checked headlessly (scripts/stage-cast-check.mjs).
 *
 * Terrell's direction (Oct 28): "So then dancer. Each participant
 * gets one. (Their ghostie.)" The stage's figure is not a neutral
 * mannequin: every participant in the room gets ONE dancer, and
 * that dancer IS their ghostie embodied — the local rig wears the
 * local ghost's own name and hue; remote rigs wear the name + hue
 * their owners announced to the room (peer-announce, Slice 6).
 *
 * Attribution rule (who dances to what):
 * - A note/verb dances the rig of the participant who PLAYED it.
 *   Wire notes carry their sender (`from` on the transport
 *   envelope); wire verbs carry theirs (the interaction's userId).
 * - A ghost's sends ride under "ghost:<ownerId>"; the ghost's
 *   choreography belongs to its OWNER's rig, so the prefix is
 *   stripped before lookup (ownerIdForSender).
 * - Unattributed bus notes (no sender at all — a host track, an
 *   ambient generator, any local surface) move the LOCAL rig only:
 *   your ghostie answers the room's ambient music; nobody else's
 *   body is puppeteered by an anonymous source. The stage floor and
 *   lights stay room-wide — they answer every note, as in v1.
 * - Senders with no rig (beyond the cap, or not in this room) move
 *   no body. Their notes still ripple the floor.
 *
 * The cap: at most MAX_STAGE_RIGS bodies share the stage. Everyone
 * past the cap is "in the wings" — present in the room, heard, and
 * rippling the floor, but bodiless until a slot frees. The cap is a
 * perf guard (each rig is a skinned mesh + its own driver/springs).
 *
 * Temperament honesty: a remote ghost's temperament is NOT on the
 * wire (peer-announce carries name + hue only), so remote rigs get
 * the NEUTRAL style — their hue and their music are real, their
 * inner weather is theirs. The LOCAL ghostie's style comes from its
 * live temperament/presence in the ghost store, when the ghost has
 * run this session; before that, neutral too.
 */

export interface StageParticipant {
  /** Transport userId (the roster key; also the driver/rig key). */
  id: string;
  /** Label over the rig: local = the ghost's name; remote = owner's name. */
  name: string;
  /** Tint + label-dot hue, degrees 0..359. */
  hue: number;
  isLocal: boolean;
}

export interface StageRigLayout {
  id: string;
  position: [number, number, number];
  /** Yaw so off-center rigs angle toward the house, radians. */
  rotationY: number;
}

/** How a rig's body takes its driver's pose (1 = the v1 body). */
export interface RigStyle {
  /** Scales band offsets (how big the dancing is). */
  motion: number;
  /** Scales the idle breath sway. */
  sway: number;
  /** Scales the root bounce (leg energy + cheer hops). */
  bounce: number;
}

export const NEUTRAL_STYLE: RigStyle = { motion: 1, sway: 1, bounce: 1 };

/** Local center-front + at most 5 guests on the arc. */
export const MAX_STAGE_RIGS = 6;

/**
 * Build the cast: the local participant always holds center stage;
 * remotes follow in roster (join) order. Returns the cast plus how
 * many participants wait in the wings.
 */
export function buildStageCast(
  local: StageParticipant,
  remotes: readonly StageParticipant[]
): { cast: StageParticipant[]; wings: number } {
  const all = [local, ...remotes];
  return {
    cast: all.slice(0, MAX_STAGE_RIGS),
    wings: Math.max(0, all.length - MAX_STAGE_RIGS),
  };
}

/**
 * Stage blocking. The local ghostie stands center-front (nearest
 * the camera, z +0.62); remotes fan on an arc behind it, angled
 * toward the house. Everything stays well inside the floor disc
 * (radius 3.2): the widest remote sits at |x| ≈ 1.51, z ≈ −0.86.
 */
export function layoutCast(
  cast: readonly StageParticipant[]
): StageRigLayout[] {
  const remotes = cast.filter((p) => !p.isLocal);
  const out: StageRigLayout[] = [];
  for (const p of cast) {
    if (p.isLocal) {
      out.push({ id: p.id, position: [0, 0, 0.62], rotationY: 0 });
      continue;
    }
    const i = remotes.indexOf(p);
    const k = remotes.length;
    const theta = (i - (k - 1) / 2) * 0.62;
    out.push({
      id: p.id,
      position: [
        Math.sin(theta) * 1.6,
        0,
        -0.25 - (1 - Math.cos(theta)) * 0.9,
      ],
      rotationY: -0.5 * theta,
    });
  }
  return out;
}

/**
 * The participant a send belongs to. Ghost sends ride under
 * "ghost:<ownerId>" (GhostPeer's convention); their choreography
 * is their owner's. Anything else is already a participant id.
 */
export function ownerIdForSender(senderId: string): string {
  return senderId.startsWith("ghost:")
    ? senderId.slice("ghost:".length)
    : senderId;
}

/**
 * Deterministic placeholder hue for a participant whose identity
 * card hasn't landed yet — stable per id, so the tint doesn't
 * flicker, and replaced by the announced hue the moment it arrives.
 * (A display fallback only; nothing is announced or persisted.)
 */
export function placeholderHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  return ((h % 360) + 360) % 360;
}

/**
 * Temperament in the body (local ghostie only — see the honesty
 * note above). The DancerDriver's springs/breath internals are
 * shared with the piano spike and stay untouched; the style scales
 * how the RIG takes the pose: a sleepy ghostie's sway is smaller
 * and softer, a playful one bounces, a sassy one moves big, an
 * affectionate one sways wide and gentle, a curious one leans in.
 */
const TEMPERAMENT_STYLES: Record<string, RigStyle> = {
  curious: { motion: 1.05, sway: 1.1, bounce: 1.0 },
  playful: { motion: 1.2, sway: 1.25, bounce: 1.6 },
  sleepy: { motion: 0.65, sway: 0.7, bounce: 0.5 },
  sassy: { motion: 1.12, sway: 1.0, bounce: 1.25 },
  affectionate: { motion: 0.9, sway: 1.35, bounce: 0.8 },
};

export function styleForTemperament(
  temperament: string | null | undefined,
  presence?: string | null
): RigStyle {
  const base =
    (temperament ? TEMPERAMENT_STYLES[temperament] : undefined) ??
    NEUTRAL_STYLE;
  // A ghost the store reports as sleeping is drowsy whatever its
  // temperament — its stage body softens toward the sleepy end.
  if (presence === "sleeping" && temperament) {
    return {
      motion: base.motion * 0.75,
      sway: base.sway * 0.85,
      bounce: base.bounce * 0.7,
    };
  }
  return base;
}
