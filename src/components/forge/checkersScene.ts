/**
 * checkersScene — the checkers board as Forge scene data
 * (Slice D).
 *
 * The board is scene content with GAME-OWNED ids, summoned and
 * removed through the same agent-scene ops the ghost's tools
 * use: 64 square parts (individually named — a tap has to know
 * which square it hit), 24 pieces (squat cylinders on the dark
 * squares), a crown disc riding a piece once it kings, a
 * highlight disc per legal destination while a piece is
 * selected, and one ghostie marker seated at each board end.
 * This module owns the layout (square → world), the ids, the
 * setup ops, and the census — the referee's proof, after every
 * move, that the scene and the engine state agree.
 *
 * Colors: the sides wear the Forge palette's own coral and
 * teal (colorblind-safer than red/green, and they are the
 * fabric's colors), the board is warm ivory over dark umber,
 * highlights are the palette's brass. Every material color
 * goes through hexToLinear — the ACES law from forgeScene.
 *
 * Pure module: it builds op arrays and reads recipes; the
 * game controller (checkersGame) applies them through the
 * performer path. No rendering imports.
 */
import { hexToLinear } from "./forgeScene";
import type {
  CheckersSide,
  CheckersState,
} from "./checkersEngine";
import { checkersPiecesOf } from "./checkersEngine";

/* ---- layout ------------------------------------------------------ */

/** Squares are 1 unit; the board is centered on the origin. */
export const CHECKERS_SQUARE_TOP_Y = 0.1;
/** Piece cylinder: center height and crown center height. */
export const CHECKERS_PIECE_Y = 0.2;
export const CHECKERS_CROWN_Y = 0.37;
/** Highlight disc center height (sits proud of the square). */
export const CHECKERS_HIGHLIGHT_Y = 0.125;
/** Marker rest height and distance beyond each board end. */
export const CHECKERS_MARKER_Y = 0.55;
export const CHECKERS_MARKER_Z = 4.9;

/** World [x, z] of a board square's center. */
export function checkersSquareXZ(
  row: number,
  col: number
): [number, number] {
  return [col - 3.5, row - 3.5];
}

/** World position of a piece resting on a square. */
export function checkersPieceWorld(
  row: number,
  col: number
): [number, number, number] {
  const [x, z] = checkersSquareXZ(row, col);
  return [x, CHECKERS_PIECE_Y, z];
}

/** World position of the crown disc riding a piece. */
export function checkersCrownWorld(
  row: number,
  col: number
): [number, number, number] {
  const [x, z] = checkersSquareXZ(row, col);
  return [x, CHECKERS_CROWN_Y, z];
}

/* ---- palette ------------------------------------------------------ */

export const CHECKERS_COLORS = {
  squareLight: "#cfc4ae",
  squareDark: "#5b4a3a",
  coral: "#e2492f",
  teal: "#0e7c86",
  highlight: "#d9932c",
} as const;

export function checkersSideColor(side: CheckersSide): string {
  return side === "coral" ? CHECKERS_COLORS.coral : CHECKERS_COLORS.teal;
}

/**
 * An identity hue (degrees, the ghostie's signature) as a hex
 * color — the same HSL the ghost's own surfaces use
 * (saturation 80%, lightness 55%), so a marker in the ghost's
 * hue is recognizably ITS color.
 */
export function ghostHueToHex(hue: number): string {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = 0.8;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1 / 6) [r, g, b] = [c, x, 0];
  else if (h < 2 / 6) [r, g, b] = [x, c, 0];
  else if (h < 3 / 6) [r, g, b] = [0, c, x];
  else if (h < 4 / 6) [r, g, b] = [0, x, c];
  else if (h < 5 / 6) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const byte = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** A hex color darkened toward black (a marker's dip/dim). */
export function darkenHex(hex: string, factor: number): string {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  const scale = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${scale((n >> 16) & 255)}${scale((n >> 8) & 255)}${scale(n & 255)}`;
}

/* ---- ids ---------------------------------------------------------- */

export const checkersSquareId = (row: number, col: number): string =>
  `checkers-sq-${row}-${col}`;
export const checkersPieceId = (pieceId: string): string =>
  `checkers-pc-${pieceId}`;
export const checkersCrownId = (pieceId: string): string =>
  `checkers-crown-${pieceId}`;
export const checkersHighlightId = (n: number): string =>
  `checkers-hl-${n}`;
export const checkersMarkerId = (end: "near" | "far"): string =>
  `checkers-marker-${end}`;
export const CHECKERS_SQUARE_LIGHT_MAT = "checkers-mat-sq-light";
export const CHECKERS_SQUARE_DARK_MAT = "checkers-mat-sq-dark";
export const checkersPieceMat = (pieceId: string): string =>
  `checkers-mat-pc-${pieceId}`;
export const checkersMarkerMat = (end: "near" | "far"): string =>
  `checkers-mat-marker-${end}`;
export const CHECKERS_HIGHLIGHT_MAT = "checkers-mat-hl";

/** Which board end a side defends: coral sits near (+z). */
export function checkersEndForSide(side: CheckersSide): "near" | "far" {
  return side === "coral" ? "near" : "far";
}

/** The marker's rest position at a board end. */
export function checkersMarkerWorld(
  end: "near" | "far"
): [number, number, number] {
  return [0, CHECKERS_MARKER_Y, end === "near" ? CHECKERS_MARKER_Z : -CHECKERS_MARKER_Z];
}

/* ---- setup ops ----------------------------------------------------- */

export interface CheckersSetupOptions {
  /** Marker colors (hex) — each seat's ghostie hue or side color. */
  nearMarkerHex: string;
  farMarkerHex: string;
  /** Node ids of the free scene to clear (the starter scene's). */
  clearNodeIds: string[];
}

/**
 * The ops that seat a fresh game: clear the free scene's
 * nodes, lay the board, place the pieces, seat the markers.
 * ~100 core ops in one apply (the engine takes them in
 * milliseconds — the check times it).
 */
export function checkersSetupOps(
  state: CheckersState,
  opts: CheckersSetupOptions
): unknown[] {
  const ops: unknown[] = [];
  for (const id of opts.clearNodeIds) {
    ops.push({ type: "remove-node", id, recursive: false });
  }
  const materials: Array<{
    id: string;
    color: string;
    metallic: number;
    roughness: number;
  }> = [
    { id: CHECKERS_SQUARE_LIGHT_MAT, color: CHECKERS_COLORS.squareLight, metallic: 0, roughness: 0.9 },
    { id: CHECKERS_SQUARE_DARK_MAT, color: CHECKERS_COLORS.squareDark, metallic: 0, roughness: 0.9 },
    { id: CHECKERS_HIGHLIGHT_MAT, color: CHECKERS_COLORS.highlight, metallic: 0.4, roughness: 0.35 },
    { id: checkersMarkerMat("near"), color: opts.nearMarkerHex, metallic: 0.15, roughness: 0.4 },
    { id: checkersMarkerMat("far"), color: opts.farMarkerHex, metallic: 0.15, roughness: 0.4 },
  ];
  for (const side of ["coral", "teal"] as CheckersSide[]) {
    for (const piece of checkersPiecesOf(state, side)) {
      materials.push({
        id: checkersPieceMat(piece.id),
        color: checkersSideColor(side),
        metallic: 0.05,
        roughness: 0.42,
      });
    }
  }
  for (const m of materials) {
    ops.push({
      type: "add-material",
      material: {
        id: m.id,
        color: hexToLinear(m.color),
        metallic: m.metallic,
        roughness: m.roughness,
      },
    });
  }
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const [x, z] = checkersSquareXZ(r, c);
      ops.push({
        type: "add-node",
        node: {
          id: checkersSquareId(r, c),
          geometry: "unit-box",
          material:
            (r + c) % 2 === 0
              ? CHECKERS_SQUARE_LIGHT_MAT
              : CHECKERS_SQUARE_DARK_MAT,
          translation: [x, CHECKERS_SQUARE_TOP_Y / 2, z],
          scale: [0.96, CHECKERS_SQUARE_TOP_Y, 0.96],
        },
      });
    }
  }
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.cells[r * 8 + c];
      if (!piece) continue;
      ops.push({
        type: "add-node",
        node: {
          id: checkersPieceId(piece.id),
          geometry: "post",
          material: checkersPieceMat(piece.id),
          translation: checkersPieceWorld(r, c),
          scale: [0.68, 0.2, 0.68],
        },
      });
      if (piece.king) {
        ops.push({
          type: "add-node",
          node: {
            id: checkersCrownId(piece.id),
            geometry: "post",
            material: checkersPieceMat(piece.id),
            translation: checkersCrownWorld(r, c),
            scale: [0.46, 0.14, 0.46],
          },
        });
      }
    }
  }
  for (const end of ["near", "far"] as const) {
    ops.push({
      type: "add-node",
      node: {
        id: checkersMarkerId(end),
        geometry: "ball",
        material: checkersMarkerMat(end),
        translation: checkersMarkerWorld(end),
        scale: [0.55, 0.55, 0.55],
      },
    });
  }
  return ops;
}

/* ---- census -------------------------------------------------------- */

export interface CheckersCensusResult {
  ok: boolean;
  problems: string[];
}

interface SceneNodeRecord {
  id: string;
  geometry?: string;
  material?: string;
  translation?: number[];
}

function nearTranslation(
  a: number[] | undefined,
  b: [number, number, number],
  eps = 1e-3
): boolean {
  return (
    Array.isArray(a) &&
    a.length === 3 &&
    Math.abs(a[0] - b[0]) <= eps &&
    Math.abs(a[1] - b[1]) <= eps &&
    Math.abs(a[2] - b[2]) <= eps
  );
}

/**
 * The referee's proof: every engine piece stands on the scene
 * at its square (crown iff king), every square stands at its
 * authored place, both markers are seated, and no extra
 * checkers-* node exists. Anything else is a named problem —
 * the controller halts on a failed census rather than patch
 * around it. Marker POSITIONS are not asserted (reactions move
 * them); their presence is.
 */
export function checkersCensus(
  nodes: SceneNodeRecord[],
  state: CheckersState
): CheckersCensusResult {
  const problems: string[] = [];
  const byId = new Map<string, SceneNodeRecord>();
  for (const n of nodes) byId.set(n.id, n);
  const expected = new Set<string>();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const id = checkersSquareId(r, c);
      expected.add(id);
      const node = byId.get(id);
      if (!node) {
        problems.push(`square ${id} is missing from the scene`);
        continue;
      }
      const [x, z] = checkersSquareXZ(r, c);
      if (!nearTranslation(node.translation, [x, CHECKERS_SQUARE_TOP_Y / 2, z])) {
        problems.push(`square ${id} is not at its authored place`);
      }
    }
  }
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.cells[r * 8 + c];
      if (!piece) continue;
      const id = checkersPieceId(piece.id);
      expected.add(id);
      const node = byId.get(id);
      if (!node) {
        problems.push(`piece ${id} is missing from the scene`);
      } else if (!nearTranslation(node.translation, checkersPieceWorld(r, c))) {
        problems.push(`piece ${id} is not on its square (${r},${c})`);
      }
      const crownId = checkersCrownId(piece.id);
      const crown = byId.get(crownId);
      if (piece.king) {
        expected.add(crownId);
        if (!crown) {
          problems.push(`king ${id} has no crown in the scene`);
        } else if (!nearTranslation(crown.translation, checkersCrownWorld(r, c))) {
          problems.push(`crown ${crownId} is not riding its piece`);
        }
      } else if (crown) {
        problems.push(`man ${id} carries a crown it never earned`);
      }
    }
  }
  for (const end of ["near", "far"] as const) {
    const id = checkersMarkerId(end);
    expected.add(id);
    if (!byId.has(id)) problems.push(`the ${end} marker is missing`);
  }
  for (const n of nodes) {
    // Highlight discs are the controller's transient selection
    // UI — always lawful, never part of the position's truth.
    if (n.id.startsWith("checkers-hl-")) continue;
    if (n.id.startsWith("checkers-") && !expected.has(n.id)) {
      problems.push(`unexpected game node ${n.id} in the scene`);
    }
  }
  return { ok: problems.length === 0, problems };
}
