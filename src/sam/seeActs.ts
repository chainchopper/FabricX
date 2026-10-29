/**
 * seeActs — Slice 30: the See layer's act vocabulary.
 *
 * SAM See (Slice 14) could only SHOW what it found. This module is
 * the front half of closing the loop: it recognizes ACT asks in
 * the compose stream — "touch the apple", "draw a circle around
 * the chair", "ghostie, touch the apple", "show me the keys" —
 * and extracts { kind, phrase, toGhost } for the segmentation
 * seam (src/sam/segmentation.ts) and the performers in
 * LegacyFluid (the user's own funnel, or the ghost's Slice 23
 * machinery when the ask addresses it).
 *
 * The pattern table is deliberately small and START-ANCHORED:
 * act asks are imperatives, and anchoring is what keeps ordinary
 * composition ("draw a circle", "a touch of gold") on the
 * generic path. "Draw a circle" with no target is NOT an act —
 * it has nothing to segment, and the generic interpreter owns it.
 *
 * The geometry half is pure math over normalized boxes:
 *   - imageBoxToCanvas maps a box from camera-image space to
 *     canvas space through HF2.4's cover-fit transform, so an
 *     act lands where the user SEES the object, not where the
 *     cropped-away part of the frame says it is;
 *   - touchRadiusFor / ringFitFor turn a found box into the
 *     funnel's splat radius / the recipe player's ring step.
 *
 * Framework-free (no imports at all) so the contract check can
 * exercise it in plain Node.
 *
 * Powered by Nirvana
 */

export type SeeActKind = "touch" | "draw" | "highlight";

export interface SeeAct {
  kind: SeeActKind;
  /** The bare referring expression to segment ("the apple"). */
  phrase: string;
  /** True when the ask addresses the ghost (name / "ghostie" / "your"). */
  toGhost: boolean;
}

/**
 * Canvas -> See layer: "these regions were found for an act ask".
 * LegacyFluid dispatches it for every performed act (the found
 * outline explains where the act landed); for a highlight ask it
 * IS the act — a soft outline pulse, no splat. Detail regions are
 * in IMAGE space: SamLayer maps them through its own cover-fit
 * frame rect, exactly like its Segment results.
 */
export const FABRIC_SEE_HIGHLIGHT_EVENT = "fabric:see-highlight";

export interface SeeHighlightRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface SeeHighlightDetail {
  regions: SeeHighlightRegion[];
  phrase: string;
  /** True for a highlight ask: pulse the outline, then let it go. */
  pulse: boolean;
  /** Auto-clear after this long (highlight asks only; 0 = keep). */
  lingerMs: number;
}

// ---------------------------------------------------------------------------
// Act routing
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The ghostVerbAsk addressing rule, mirrored: an ask addresses
 * the ghost when it names it, says "ghost"/"ghostie", or says
 * "your" (the heartbeat and verb routes run earlier in the
 * compose chain, so their "your" phrases never reach here).
 */
export function isAddressedToGhost(
  text: string,
  ghostName: string | null | undefined
): boolean {
  if (/\bghost(ie)?\b/.test(text)) return true;
  if (/\byour\b/.test(text)) return true;
  const name = ghostName?.trim().toLowerCase();
  if (name && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)) {
    return true;
  }
  return false;
}

// The pattern table. Order matters: draw-around is tried before
// the touch verbs, which are tried before highlight ("show me"
// must not swallow a "draw ... around" phrasing, and "circle the
// X" is a draw, never a touch). Every pattern is anchored at the
// start of the (prefix-stripped) ask and REQUIRES a target.
const ACT_PATTERNS: Array<{
  kind: SeeActKind;
  re: RegExp;
}> = [
  // "draw / make / paint a circle|ring|outline around the X"
  {
    kind: "draw",
    re: /^(?:draw|make|paint)\s+(?:a\s+|an\s+)?(?:circle|ring|outline)\s+around\s+(.+)$/,
  },
  // "circle the X"
  { kind: "draw", re: /^circle\s+(.+)$/ },
  // "outline the X"
  { kind: "draw", re: /^outline\s+(.+)$/ },
  // "point at / point to the X"
  { kind: "touch", re: /^point\s+(?:at|to)\s+(.+)$/ },
  // "touch / tap / poke / press the X"
  { kind: "touch", re: /^(?:touch|tap|poke|press)\s+(.+)$/ },
  // "highlight / show me / find / locate / where is the X"
  {
    kind: "highlight",
    re: /^(?:highlight|show\s+me|find|locate|where(?:'s|\s+is))\s+(.+)$/,
  },
];

/**
 * Parse a compose prompt into a See act, or null when it is not
 * one. Pure and total: any string is safe to hand it.
 */
export function parseSeeAct(
  prompt: string,
  ghostName: string | null | undefined
): SeeAct | null {
  if (typeof prompt !== "string") return null;
  let text = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  // The heartbeat route owns these outright; never let "show me
  // your heartbeat" degrade into a highlight of "your heartbeat".
  if (/\bheart\s?beat\b/.test(text)) return null;

  const toGhost = isAddressedToGhost(text, ghostName);

  // Normalize the edges: trailing punctuation / politeness, then
  // leading politeness and a leading direct address ("Boop, ...",
  // "hey ghostie ...", "can you ...", "please ...").
  text = text.replace(/[.!?]+$/g, "").replace(/\s+please$/g, "").trim();
  text = text.replace(/^please\s+/, "");
  text = text.replace(/^(?:can|could|will|would)\s+you\s+/, "");
  text = text.replace(/^i\s+want\s+you\s+to\s+/, "");
  const name = ghostName?.trim().toLowerCase();
  if (name) {
    text = text.replace(
      new RegExp(`^(?:hey\\s+)?${escapeRegExp(name)}[,:]?\\s+`),
      ""
    );
  }
  text = text.replace(/^(?:hey\s+)?ghost(ie)?[,:]?\s+/, "");

  for (const { kind, re } of ACT_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    let phrase = m[1].trim().replace(/[.!?]+$/g, "");
    // A trailing address ("touch the apple, Boop") is not part
    // of the thing being named.
    if (name) {
      phrase = phrase.replace(
        new RegExp(`[,:]?\\s*${escapeRegExp(name)}$`),
        ""
      );
    }
    phrase = phrase.replace(/[,:]?\s*ghost(ie)?$/, "").trim();
    if (phrase.length < 2) return null;
    return { kind, phrase, toGhost };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometry: image space -> canvas space -> act parameters
// ---------------------------------------------------------------------------

export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Map a normalized image-space box into normalized canvas space
 * under cover-fit. This is SamLayer's frameRect math (HF2.4)
 * reduced to aspect ratios: with frame aspect A and viewport
 * aspect V, cover-fit scales the frame by max(V/A, A/V) on the
 * cropped axis and centers it, so coordinates on that axis map
 * as (c - 0.5) * k + 0.5 with k = the overflow factor, and sizes
 * scale by k. The uncropped axis passes through untouched.
 * Unknown aspects (camera not up yet) degrade to identity.
 */
export function imageBoxToCanvas(
  box: NormBox,
  frameAspect: number,
  viewportAspect: number
): NormBox {
  if (!(frameAspect > 0) || !(viewportAspect > 0)) return { ...box };
  if (frameAspect >= viewportAspect) {
    const k = frameAspect / viewportAspect;
    return {
      x: (box.x - 0.5) * k + 0.5,
      y: box.y,
      w: box.w * k,
      h: box.h,
    };
  }
  const k = viewportAspect / frameAspect;
  return {
    x: box.x,
    y: (box.y - 0.5) * k + 0.5,
    w: box.w,
    h: box.h * k,
  };
}

export function boxCenter(box: NormBox): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/**
 * The funnel's splat radius for a touch act: the region's larger
 * side, floored so a small object still lands a visible touch —
 * the same clamp SamLayer's tap-to-fire uses (0.12..1).
 */
export function touchRadiusFor(canvasBox: NormBox): number {
  return clamp(Math.max(canvasBox.w, canvasBox.h), 0.12, 1);
}

/**
 * RecipeCore's ring sampling squashes y by this factor
 * (Y_SQUASH in src/ai/RecipeCore.ts); the fit below divides it
 * back out so the drawn ring actually wraps the box.
 */
export const RING_Y_SQUASH = 0.85;

/**
 * Fit a ring recipe step to a canvas-space box, padded ~10%:
 * the ring's x-radius is the step scale and its y-radius is
 * scale * RING_Y_SQUASH, so the scale must cover both the
 * padded half-width and the padded half-height un-squashed.
 * The result is clamped to the recipe validator's scale range.
 */
export function ringFitFor(canvasBox: NormBox): {
  cx: number;
  cy: number;
  scale: number;
} {
  const c = boxCenter(canvasBox);
  const scale = clamp(
    (Math.max(canvasBox.w, canvasBox.h / RING_Y_SQUASH) / 2) * 1.1,
    0.05,
    0.5
  );
  return { cx: clamp(c.x, 0, 1), cy: clamp(c.y, 0, 1), scale };
}
