/**
 * checkersEngine — the checkers rules, pure (Slice D).
 *
 * The game's source of truth: an 8x8 board, two sides, men and
 * kings, and the legal-move law — nothing here renders, imports
 * the engine (67js), or knows what a scene is. The game
 * controller (checkersGame) keeps the scene honest against
 * this state after every move; the brain's game sense
 * (GhostBrain's forge_game) is built from this state; the
 * check (scripts/checkers-check.mjs) proves the law directly.
 *
 * The rules are American/English checkers, stated plainly:
 *   - Men step one square diagonally FORWARD (toward the far
 *     rank); men and kings CAPTURE in any diagonal direction
 *     (a man may jump backward — the American rule).
 *   - Kings step and capture one square in any diagonal
 *     direction (no flying kings).
 *   - Captures are FORCED: if the side to move has any jump,
 *     only jumps are legal.
 *   - A jump that lands where another jump is available MUST
 *     continue — a move is a complete chain, never a prefix.
 *   - A man reaching the far rank is crowned and the move ends
 *     there (it does not continue jumping as a king that turn).
 *   - A side with no pieces, or no legal move at its turn,
 *     loses. Draws are not modeled in this slice.
 *
 * Board geometry: rows 0..7 run north→south (row 0 is the far
 * rank from the local player's seat), columns 0..7 west→east.
 * Playable squares are the dark ones: (row + col) odd. TEAL
 * starts on rows 0–2 and advances south (+row); CORAL starts
 * on rows 5–7, advances north (−row), and opens the game.
 * Piece ids are stable across a game ("coral-3") — the scene
 * names its nodes after them, so identity never has to be
 * re-derived from position.
 */

export type CheckersSide = "coral" | "teal";

export interface CheckersPiece {
  id: string;
  side: CheckersSide;
  king: boolean;
}

export interface CheckersState {
  /** 64 cells, index row * 8 + col; null off the dark squares. */
  cells: (CheckersPiece | null)[];
  turn: CheckersSide;
  winner: CheckersSide | null;
  /** Half-moves played so far. */
  moveNumber: number;
}

export interface CheckersMove {
  pieceId: string;
  from: [number, number];
  /** Every landing square in order; the last is the rest square. */
  landings: [number, number][];
  /** Captured piece ids, in jump order (empty for a quiet move). */
  captures: string[];
  /** True when this move crowns a man. */
  kinging: boolean;
}

export const CHECKERS_SIDES: readonly CheckersSide[] = ["coral", "teal"];

export function otherCheckersSide(side: CheckersSide): CheckersSide {
  return side === "coral" ? "teal" : "coral";
}

/** The rank a side's men are crowned on. */
export function checkersKingRow(side: CheckersSide): number {
  return side === "coral" ? 0 : 7;
}

/** Row direction a side's men advance in. */
function forwardRowDelta(side: CheckersSide): number {
  return side === "coral" ? -1 : 1;
}

const idx = (row: number, col: number): number => row * 8 + col;
const inBoard = (row: number, col: number): boolean =>
  row >= 0 && row < 8 && col >= 0 && col < 8;
const isPlayable = (row: number, col: number): boolean =>
  inBoard(row, col) && (row + col) % 2 === 1;

/** The piece on a square, or null (off-board reads as null). */
export function checkersPieceAt(
  state: CheckersState,
  row: number,
  col: number
): CheckersPiece | null {
  if (!inBoard(row, col)) return null;
  return state.cells[idx(row, col)];
}

function pieceSquare(
  state: CheckersState,
  pieceId: string
): [number, number] | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (state.cells[idx(r, c)]?.id === pieceId) return [r, c];
    }
  }
  return null;
}

/** The standard starting position. Coral opens. */
export function createCheckersGame(): CheckersState {
  const cells: (CheckersPiece | null)[] = new Array(64).fill(null);
  let t = 0;
  let k = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!isPlayable(r, c)) continue;
      if (r <= 2) {
        t += 1;
        cells[idx(r, c)] = { id: `teal-${t}`, side: "teal", king: false };
      } else if (r >= 5) {
        k += 1;
        cells[idx(r, c)] = { id: `coral-${k}`, side: "coral", king: false };
      }
    }
  }
  return { cells, turn: "coral", winner: null, moveNumber: 0 };
}

/**
 * Build a state from an explicit piece list — constructed
 * positions for the check, and the honest door for any future
 * position loading. Ids must be unique; off-board or
 * light-square placements are refused by dropping the piece
 * (callers read the census back if they care).
 */
export function checkersStateFromPieces(
  pieces: Array<{
    id: string;
    side: CheckersSide;
    king?: boolean;
    row: number;
    col: number;
  }>,
  turn: CheckersSide
): CheckersState {
  const cells: (CheckersPiece | null)[] = new Array(64).fill(null);
  const seen = new Set<string>();
  for (const p of pieces) {
    if (seen.has(p.id) || !isPlayable(p.row, p.col)) continue;
    if (cells[idx(p.row, p.col)]) continue;
    seen.add(p.id);
    cells[idx(p.row, p.col)] = { id: p.id, side: p.side, king: !!p.king };
  }
  return { cells, turn, winner: null, moveNumber: 0 };
}

/** Every piece a side still has on the board. */
export function checkersPiecesOf(
  state: CheckersState,
  side: CheckersSide
): CheckersPiece[] {
  const out: CheckersPiece[] = [];
  for (const cell of state.cells) if (cell && cell.side === side) out.push(cell);
  return out;
}

const DIAGONALS: ReadonlyArray<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function moveDiagonals(piece: CheckersPiece): ReadonlyArray<[number, number]> {
  if (piece.king) return DIAGONALS;
  const f = forwardRowDelta(piece.side);
  return DIAGONALS.filter(([dr]) => dr === f);
}

/**
 * All maximal capture chains starting with one piece, by DFS
 * over a scratch cell array: a jumped piece is removed as the
 * chain passes (it cannot be jumped twice), and a chain ends
 * only where no further jump exists — or on the king row,
 * where a man is crowned and the move ends by rule.
 */
function captureChainsFrom(
  cells: (CheckersPiece | null)[],
  row: number,
  col: number,
  piece: CheckersPiece
): Array<{ landings: [number, number][]; captures: string[] }> {
  const out: Array<{ landings: [number, number][]; captures: string[] }> = [];
  const walk = (
    r: number,
    c: number,
    landings: [number, number][],
    captures: string[]
  ): void => {
    let extended = false;
    for (const [dr, dc] of DIAGONALS) {
      const midR = r + dr;
      const midC = c + dc;
      const landR = r + 2 * dr;
      const landC = c + 2 * dc;
      if (!isPlayable(landR, landC)) continue;
      const mid = cells[idx(midR, midC)];
      if (!mid || mid.side === piece.side) continue;
      if (cells[idx(landR, landC)]) continue;
      extended = true;
      // Take the jump on the scratch board, recurse, restore.
      cells[idx(r, c)] = null;
      cells[idx(midR, midC)] = null;
      cells[idx(landR, landC)] = piece;
      const crowned =
        !piece.king && landR === checkersKingRow(piece.side);
      if (crowned) {
        out.push({
          landings: [...landings, [landR, landC]],
          captures: [...captures, mid.id],
        });
      } else {
        walk(landR, landC, [...landings, [landR, landC]], [
          ...captures,
          mid.id,
        ]);
      }
      cells[idx(r, c)] = piece;
      cells[idx(midR, midC)] = mid;
      cells[idx(landR, landC)] = null;
    }
    if (!extended && landings.length > 0) {
      out.push({ landings, captures });
    }
  };
  walk(row, col, [], []);
  return out;
}

/**
 * The legal moves for the side to move (or a named side) —
 * the whole law: forced captures (only jumps when any jump
 * exists anywhere on the side), complete chains, kinging
 * flagged. A finished game has no legal moves.
 */
export function checkersLegalMoves(
  state: CheckersState,
  side: CheckersSide = state.turn
): CheckersMove[] {
  if (state.winner) return [];
  const captures: CheckersMove[] = [];
  const quiets: CheckersMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.cells[idx(r, c)];
      if (!piece || piece.side !== side) continue;
      const scratch = [...state.cells];
      for (const chain of captureChainsFrom(scratch, r, c, piece)) {
        const final = chain.landings[chain.landings.length - 1];
        captures.push({
          pieceId: piece.id,
          from: [r, c],
          landings: chain.landings,
          captures: chain.captures,
          kinging:
            !piece.king && final[0] === checkersKingRow(piece.side),
        });
      }
      for (const [dr, dc] of moveDiagonals(piece)) {
        const nr = r + dr;
        const nc = c + dc;
        if (!isPlayable(nr, nc) || state.cells[idx(nr, nc)]) continue;
        quiets.push({
          pieceId: piece.id,
          from: [r, c],
          landings: [[nr, nc]],
          captures: [],
          kinging: !piece.king && nr === checkersKingRow(piece.side),
        });
      }
    }
  }
  return captures.length > 0 ? captures : quiets;
}

/** The legal moves of one piece (selection highlights). */
export function checkersMovesForPiece(
  state: CheckersState,
  pieceId: string
): CheckersMove[] {
  return checkersLegalMoves(state).filter((m) => m.pieceId === pieceId);
}

/**
 * Apply a legal move, returning the next state (the input is
 * not mutated). The move is trusted to be one of
 * checkersLegalMoves — the referee layers (game controller,
 * brain sense) only ever offer generated moves. Winner law:
 * after the move the side to move loses when it has no pieces
 * or no legal move.
 */
export function applyCheckersMove(
  state: CheckersState,
  move: CheckersMove
): CheckersState {
  const cells = [...state.cells];
  const from = pieceSquare(state, move.pieceId);
  if (!from) return state;
  const piece = cells[idx(from[0], from[1])];
  if (!piece) return state;
  cells[idx(from[0], from[1])] = null;
  for (const capturedId of move.captures) {
    const sq = pieceSquare({ ...state, cells }, capturedId);
    if (sq) cells[idx(sq[0], sq[1])] = null;
  }
  const final = move.landings[move.landings.length - 1];
  cells[idx(final[0], final[1])] = move.kinging
    ? { ...piece, king: true }
    : piece;
  const next: CheckersState = {
    cells,
    turn: otherCheckersSide(state.turn),
    winner: null,
    moveNumber: state.moveNumber + 1,
  };
  const defender = next.turn;
  if (
    checkersPiecesOf(next, defender).length === 0 ||
    checkersLegalMoves(next, defender).length === 0
  ) {
    next.winner = state.turn;
  }
  return next;
}

/**
 * After a move lands, could the side now to move capture the
 * piece that just moved? The brain sense's honesty flag: the
 * evaluator may still choose the move, but it chooses it
 * knowing the piece hangs.
 */
export function checkersMoveExposes(
  stateAfter: CheckersState,
  movedPieceId: string
): boolean {
  return checkersLegalMoves(stateAfter, stateAfter.turn).some((m) =>
    m.captures.includes(movedPieceId)
  );
}
