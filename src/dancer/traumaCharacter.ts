/**
 * traumaCharacter — Trauma, the built-in stage character.
 *
 * Terrell's Mixamo character ships WITH the stage: each GLB is the
 * full skinned character AND one looping idle clip in a single
 * file (clip "mixamo.com" — MMA idle ~5.0 s, Bouncing Fight
 * ~2.97 s; bones resolve through mixamoBones.ts). Picking an idle
 * in THIS LAYER binds that file into the character slot
 * (stageCharacter store) on the local rig; the rig loops the clip
 * as the body's base layer and the DancerDriver's note-band
 * impulses compose additively over it.
 *
 * ASSET ROUTE — read before wondering where the bytes live: the
 * GLBs are ~5 MB of BINARY each, so they are never bundled, never
 * inlined, and never pass through Metro. They are same-origin
 * static files, lazy-loaded by URL the first time the stage binds
 * them:
 *
 *   public/animations/trauma-mma-idle.glb
 *   public/animations/trauma-bouncing-fight-idles.glb
 *
 * served at the URLs below (public/ is copied to the web root,
 * the same route the soundfont packs take). The single config
 * constant CHARACTER_ASSET_BASE_URL is the one place the location
 * lives — move the files (CDN, another folder) by changing it.
 * Until the files are in place the bind simply reports "failed"
 * and the mannequin keeps the stage, like any bad character file.
 */

export type TraumaIdleId = "mma" | "bouncing";

export interface TraumaIdleDef {
  id: TraumaIdleId;
  /** Pill label in THIS LAYER. */
  label: string;
  /** Slot display name (menu status line, load reporting). */
  characterName: string;
  /** Same-origin URL the rig lazy-loads. */
  url: string;
}

/** The ONE config constant for built-in character asset location. */
export const CHARACTER_ASSET_BASE_URL = "/animations";

export const TRAUMA_IDLES: readonly TraumaIdleDef[] = [
  {
    id: "mma",
    label: "MMA idle",
    characterName: "Trauma — MMA idle",
    url: `${CHARACTER_ASSET_BASE_URL}/trauma-mma-idle.glb`,
  },
  {
    id: "bouncing",
    label: "Bouncing fight",
    characterName: "Trauma — Bouncing fight idles",
    url: `${CHARACTER_ASSET_BASE_URL}/trauma-bouncing-fight-idles.glb`,
  },
];

/** The idle a fresh stage pick starts from (Terrell: default MMA). */
export const DEFAULT_TRAUMA_IDLE_ID: TraumaIdleId = "mma";

/**
 * Coerce a stored `specific.stageTraumaIdle` value (or anything)
 * to a catalog entry: the matching idle, or the default when the
 * value is unset/unknown — the layer setting only ever holds ids
 * from this catalog, and anything else reads as "not picked yet"
 * at the call sites that care (they check for a string first).
 */
export function traumaIdleDef(value: unknown): TraumaIdleDef {
  const found = TRAUMA_IDLES.find((d) => d.id === value);
  return found ?? TRAUMA_IDLES.find((d) => d.id === DEFAULT_TRAUMA_IDLE_ID)!;
}
