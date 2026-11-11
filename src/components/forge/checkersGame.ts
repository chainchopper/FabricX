/**
 * checkersGame — the checkers referee + scene driver (Slice D).
 *
 * The controller owns a live game on the Forge: it seats the
 * board as scene content (checkersScene), executes every move
 * as agent-scene ops through the performer path (forgePerformer
 * — the same revision contract and renderer sync the ghost's
 * tools travel), and asserts after every move that the scene
 * and the rules engine (checkersEngine) agree, census-style.
 * A divergence HALTS the game with the reason showing — it is
 * reported, never silently patched.
 *
 * Players:
 *   - The human (or two, pass-and-play) plays by tapping:
 *     ForgeLayer picks the tapped node through the engine's
 *     own scene-query and hands the node id here. Selection,
 *     legal-destination highlights, and turn discipline live
 *     in this module.
 *   - The ghostie (vs-ghost mode) plays through its REAL
 *     decision path: the referee feeds the position as a sense
 *     (GhostPeer's noteForgeGame — legal moves enumerated by
 *     the engine), the peer deliberates and performs a
 *     forge-move through its own sink, and the layer hands the
 *     performed decision here. A decision matching an
 *     enumerated legal move is completed by the referee
 *     (captures removed, crowns seated — the consequences the
 *     one forge-move op can't carry); a decision that doesn't
 *     match is an illegal move: the piece is restored to its
 *     square, the refusal is reported and fed back as a
 *     referee note, and a second consecutive offense stops
 *     the game. The referee never moves a piece FOR the ghost
 *     and never calls the ghost's move anything but what the
 *     peer actually decided.
 *
 * Board-end ghosties: each seat has a marker in the scene in
 * its ghostie's hue (Terrell's design — "our ghostie at either
 * end of the board, cheering or whatever it does"). The GAME
 * renders the markers' feelings: hops, dips, rises and spins
 * as scene ops, and reaction sounds through the shared ghost
 * voice pitched from the reacting seat's hue. That framing is
 * deliberate — the peer's own temperament may ALSO react
 * through its senses (the game sense journals captures,
 * crownings and the win into its deliberation room), but the
 * markers are the game's puppets, honestly.
 *
 * Starting a game takes over the scene: the engine's own
 * checkpoint holds the free scene, and End restores it
 * exactly — summons the ghost made before the game included.
 */
import type { GhostDecision } from "../../ghost/GhostBrain";
import type { GhostSfxKind } from "../../ghost/useGhostSfx";
import {
  applyCheckersMove,
  checkersLegalMoves,
  checkersMoveExposes,
  checkersMovesForPiece,
  checkersPiecesOf,
  createCheckersGame,
  otherCheckersSide,
  type CheckersMove,
  type CheckersSide,
  type CheckersState,
} from "./checkersEngine";
import {
  performForgeOps,
  syncForgeScene,
  type ForgePerformOutcome,
} from "./forgePerformer";
import { hexToLinear } from "./forgeScene";
import type { ForgeSceneHandle } from "./forgeSceneStore";
import {
  checkersCensus,
  checkersCrownId,
  checkersCrownWorld,
  checkersEndForSide,
  checkersHighlightId,
  checkersMarkerId,
  checkersMarkerMat,
  checkersMarkerWorld,
  checkersPieceId,
  checkersPieceMat,
  checkersPieceWorld,
  checkersSetupOps,
  checkersSquareXZ,
  CHECKERS_HIGHLIGHT_Y,
  darkenHex,
} from "./checkersScene";

export type CheckersMode = "vs-ghost" | "pass-and-play";

export interface CheckersGameSnapshot {
  active: boolean;
  mode: CheckersMode | null;
  turn: CheckersSide | null;
  winner: CheckersSide | null;
  selectedPieceId: string | null;
  /** Why the game stopped, when it stopped badly. */
  halted: string | null;
  /** The turn banner, in product language. */
  banner: string;
}

export type CheckersGameEvent =
  | { type: "started"; mode: CheckersMode }
  | { type: "ended" }
  | { type: "move"; by: CheckersSide; move: CheckersMove; via: "tap" | "ghost" }
  | { type: "capture"; by: CheckersSide; count: number }
  | { type: "kinging"; by: CheckersSide }
  | { type: "win"; winner: CheckersSide }
  | { type: "one-piece-left"; side: CheckersSide }
  | { type: "ghost-illegal-move"; node: string; detail: string }
  | { type: "divergence"; reason: string };

export interface CheckersGameDeps {
  /** The live scene handle, read at the moment of use (the seam). */
  getHandle: () => ForgeSceneHandle | null;
  onSnapshot: (snap: CheckersGameSnapshot) => void;
  onEvent: (event: CheckersGameEvent) => void;
  /** The shared ghost voice: a reaction cue pitched from a hue. */
  playSfx: (kind: GhostSfxKind, hue: number) => void;
  /** The referee's sense feed to the hosted peer (null ends it). */
  feedGameSense: (ctx: unknown) => void;
  /** Marker colors per mode — each seat's ghostie hue or side color. */
  markerHexesFor: (mode: CheckersMode) => { near: string; far: string };
  /** Reaction-voice hue per side per mode. */
  sfxHuesFor: (mode: CheckersMode) => Record<CheckersSide, number>;
}

/** The side the hosted ghostie plays in vs-ghost mode. */
export const CHECKERS_GHOST_SIDE: CheckersSide = "teal";
/** The side the local human plays in vs-ghost mode. */
export const CHECKERS_HUMAN_SIDE: CheckersSide = "coral";

const SELECT_LIFT = 0.14;
const HOP_MS = 330;
const DIP_MS = 520;
const CELEBRATE_MS = 480;

interface Selection {
  pieceId: string;
  moves: CheckersMove[];
}

export class CheckersGame {
  private deps: CheckersGameDeps;
  private state: CheckersState = createCheckersGame();
  private active = false;
  private mode: CheckersMode | null = null;
  private checkpoint: unknown = null;
  private selection: Selection | null = null;
  private haltedReason: string | null = null;
  private lastEvent: "capture" | "kinging" | "win" | null = null;
  private refereeNote: string | null = null;
  private consecutiveGhostIllegal = 0;
  private markerHex: Record<"near" | "far", string> = {
    near: "#ffffff",
    far: "#ffffff",
  };
  private sfxHues: Record<CheckersSide, number> = { coral: 210, teal: 186 };
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private gameSeq = 0;

  constructor(deps: CheckersGameDeps) {
    this.deps = deps;
  }

  /* ---- lifecycle ------------------------------------------------- */

  start(mode: CheckersMode): boolean {
    if (this.active) return false;
    const handle = this.deps.getHandle();
    if (!handle) return false;
    const scene = handle.scene;
    this.mode = mode;
    this.markerHex = this.deps.markerHexesFor(mode);
    this.sfxHues = this.deps.sfxHuesFor(mode);
    this.state = createCheckersGame();
    this.selection = null;
    this.haltedReason = null;
    this.lastEvent = null;
    this.refereeNote = null;
    this.consecutiveGhostIllegal = 0;
    this.gameSeq += 1;
    // The engine's own checkpoint holds the free scene exactly
    // as it stands (ghost summons included); End restores it.
    try {
      this.checkpoint = scene.checkpoint();
    } catch {
      this.checkpoint = null;
    }
    let clearNodeIds: string[] = [];
    try {
      clearNodeIds = (scene.exportRecipe().nodes ?? []).map((n) => n.id);
    } catch {
      clearNodeIds = [];
    }
    const ops = checkersSetupOps(this.state, {
      nearMarkerHex: this.markerHex.near,
      farMarkerHex: this.markerHex.far,
      clearNodeIds,
    });
    const outcome = performForgeOps(ops, handle, "checkers setup");
    if (outcome.kind !== "performed") {
      this.restoreCheckpoint(handle);
      this.mode = null;
      this.deps.onEvent({
        type: "divergence",
        reason: `the board could not be seated (${outcome.kind})`,
      });
      return false;
    }
    this.active = true;
    if (!this.assertCensus()) return true; // halted, with the reason showing
    this.feedSense();
    this.pushSnapshot();
    this.deps.onEvent({ type: "started", mode });
    return true;
  }

  end(): void {
    if (!this.active) return;
    this.clearTimers();
    this.selection = null;
    const handle = this.deps.getHandle();
    if (handle) this.restoreCheckpoint(handle);
    this.active = false;
    this.mode = null;
    this.gameSeq += 1;
    this.deps.feedGameSense(null);
    this.pushSnapshot();
    this.deps.onEvent({ type: "ended" });
  }

  /** Layer teardown: timers die, the sense clears, no scene ops. */
  dispose(): void {
    this.clearTimers();
    this.gameSeq += 1;
    if (this.active) {
      this.active = false;
      this.mode = null;
      this.deps.feedGameSense(null);
    }
  }

  private restoreCheckpoint(handle: ForgeSceneHandle): void {
    if (this.checkpoint === null || this.checkpoint === undefined) return;
    const scene = handle.scene;
    try {
      scene.restore(this.checkpoint, { expectedRevision: scene.revision });
      scene.releaseCheckpoint(this.checkpoint);
      syncForgeScene(handle);
    } catch {
      // A failed restore leaves the scene as it stands; the
      // layer's own teardown is next regardless.
    }
    this.checkpoint = null;
  }

  /* ---- human play -------------------------------------------------- */

  /**
   * A tap, as the node id the layer's pick returned (null =
   * the tap hit nothing pickable). Turn discipline is the
   * referee's: in vs-ghost mode, taps during the ghost's turn
   * change nothing.
   */
  tapNode(nodeId: string | null): void {
    if (!this.active || this.haltedReason || this.state.winner) return;
    if (
      this.mode === "vs-ghost" &&
      this.state.turn === CHECKERS_GHOST_SIDE
    ) {
      return;
    }
    if (nodeId && nodeId.startsWith("checkers-hl-")) {
      const n = Number(nodeId.slice("checkers-hl-".length));
      const move = this.selection?.moves[n];
      if (move) this.executeHumanMove(move);
      return;
    }
    if (nodeId && nodeId.startsWith("checkers-pc-")) {
      const pieceId = nodeId.slice("checkers-pc-".length);
      const piece = this.findPiece(pieceId);
      if (piece && piece.side === this.state.turn) {
        if (this.selection?.pieceId === pieceId) this.deselect();
        else this.select(pieceId);
        return;
      }
      this.deselect();
      return;
    }
    if (nodeId && nodeId.startsWith("checkers-sq-")) {
      const parts = nodeId.split("-");
      const row = Number(parts[2]);
      const col = Number(parts[3]);
      const move = this.selection?.moves.find((m) => {
        const last = m.landings[m.landings.length - 1];
        return last[0] === row && last[1] === col;
      });
      if (move) {
        this.executeHumanMove(move);
        return;
      }
      this.deselect();
      return;
    }
    this.deselect();
  }

  private findPiece(pieceId: string) {
    for (const cell of this.state.cells) {
      if (cell && cell.id === pieceId) return cell;
    }
    return null;
  }

  private pieceSquareOf(pieceId: string): [number, number] | null {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.state.cells[r * 8 + c]?.id === pieceId) return [r, c];
      }
    }
    return null;
  }

  private select(pieceId: string): void {
    const moves = checkersMovesForPiece(this.state, pieceId);
    if (moves.length === 0) return;
    const handle = this.deps.getHandle();
    if (!handle) return;
    if (this.selection) this.deselect();
    const sq = this.pieceSquareOf(pieceId);
    if (!sq) return;
    const piece = this.findPiece(pieceId);
    const ops: unknown[] = [];
    const [px, py, pz] = checkersPieceWorld(sq[0], sq[1]);
    ops.push({
      type: "set-node",
      id: checkersPieceId(pieceId),
      translation: [px, py + SELECT_LIFT, pz],
    });
    if (piece?.king) {
      const [cx, cy, cz] = checkersCrownWorld(sq[0], sq[1]);
      ops.push({
        type: "set-node",
        id: checkersCrownId(pieceId),
        translation: [cx, cy + SELECT_LIFT, cz],
      });
    }
    moves.forEach((m, i) => {
      const last = m.landings[m.landings.length - 1];
      const [x, z] = checkersSquareXZ(last[0], last[1]);
      ops.push({
        type: "add-node",
        node: {
          id: checkersHighlightId(i),
          geometry: "post",
          material: "checkers-mat-hl",
          translation: [x, CHECKERS_HIGHLIGHT_Y, z],
          scale: [0.5, 0.05, 0.5],
        },
      });
    });
    const outcome = performForgeOps(ops, handle, "checkers selection");
    if (outcome.kind !== "performed") return;
    this.selection = { pieceId, moves };
    this.pushSnapshot();
  }

  private deselect(): void {
    if (!this.selection) return;
    const handle = this.deps.getHandle();
    const { pieceId, moves } = this.selection;
    this.selection = null;
    if (handle) {
      const sq = this.pieceSquareOf(pieceId);
      const ops: unknown[] = [];
      if (sq) {
        ops.push({
          type: "set-node",
          id: checkersPieceId(pieceId),
          translation: checkersPieceWorld(sq[0], sq[1]),
        });
        if (this.findPiece(pieceId)?.king) {
          ops.push({
            type: "set-node",
            id: checkersCrownId(pieceId),
            translation: checkersCrownWorld(sq[0], sq[1]),
          });
        }
      }
      moves.forEach((_, i) => {
        ops.push({ type: "remove-node", id: checkersHighlightId(i), recursive: false });
      });
      performForgeOps(ops, handle, "checkers deselection");
    }
    this.pushSnapshot();
  }

  /* ---- move execution ---------------------------------------------- */

  /** Ops for a move's consequences, given the state BEFORE it. */
  private moveOps(
    move: CheckersMove,
    prev: CheckersState,
    pieceAlreadyMoved: boolean
  ): unknown[] {
    const ops: unknown[] = [];
    const final = move.landings[move.landings.length - 1];
    const piece = prev.cells[move.from[0] * 8 + move.from[1]];
    if (!pieceAlreadyMoved) {
      ops.push({
        type: "set-node",
        id: checkersPieceId(move.pieceId),
        translation: checkersPieceWorld(final[0], final[1]),
      });
      if (piece?.king) {
        ops.push({
          type: "set-node",
          id: checkersCrownId(move.pieceId),
          translation: checkersCrownWorld(final[0], final[1]),
        });
      }
    } else if (piece?.king) {
      // The ghost's own forge-move carried the piece; its crown
      // rides separately and the referee walks it over.
      ops.push({
        type: "set-node",
        id: checkersCrownId(move.pieceId),
        translation: checkersCrownWorld(final[0], final[1]),
      });
    }
    for (const capturedId of move.captures) {
      ops.push({
        type: "remove-node",
        id: checkersPieceId(capturedId),
        recursive: false,
      });
      const captured = this.findPieceIn(prev, capturedId);
      if (captured?.king) {
        ops.push({
          type: "remove-node",
          id: checkersCrownId(capturedId),
          recursive: false,
        });
      }
    }
    if (move.kinging) {
      ops.push({
        type: "add-node",
        node: {
          id: checkersCrownId(move.pieceId),
          geometry: "post",
          material: checkersPieceMat(move.pieceId),
          translation: checkersCrownWorld(final[0], final[1]),
          scale: [0.46, 0.14, 0.46],
        },
      });
    }
    return ops;
  }

  private findPieceIn(state: CheckersState, pieceId: string) {
    for (const cell of state.cells) {
      if (cell && cell.id === pieceId) return cell;
    }
    return null;
  }

  private executeHumanMove(move: CheckersMove): void {
    const handle = this.deps.getHandle();
    if (!handle) return;
    const prev = this.state;
    // Clear the selection UI in the same apply as the move:
    // the highlight discs go, and the piece's absolute landing
    // supersedes its selection lift.
    const ops: unknown[] = [];
    if (this.selection) {
      this.selection.moves.forEach((_, i) => {
        ops.push({
          type: "remove-node",
          id: checkersHighlightId(i),
          recursive: false,
        });
      });
      this.selection = null;
    }
    ops.push(...this.moveOps(move, prev, false));
    const outcome = performForgeOps(ops, handle, "checkers move");
    if (outcome.kind !== "performed") {
      this.halt(`a move failed to land on the scene (${outcome.kind})`);
      return;
    }
    this.completeMove(move, prev, "tap");
  }

  /**
   * The ghost's performed decision, handed by the layer's sink
   * after the performer ran it. The referee completes a legal
   * move, restores an illegal one, and census-checks anything
   * else the ghost did to the board.
   */
  noteGhostDecision(
    decision: GhostDecision,
    outcome: ForgePerformOutcome
  ): void {
    if (!this.active || this.haltedReason) return;
    if (outcome.kind !== "performed") return;
    if (
      this.mode === "vs-ghost" &&
      this.state.turn === CHECKERS_GHOST_SIDE &&
      decision.intent === "forge-move" &&
      decision.forge_spec?.node &&
      decision.forge_spec?.position
    ) {
      const matched = this.matchGhostMove(
        decision.forge_spec.node,
        decision.forge_spec.position
      );
      if (matched) {
        const handle = this.deps.getHandle();
        if (!handle) return;
        const prev = this.state;
        const ops = this.moveOps(matched, prev, true);
        if (ops.length > 0) {
          const o = performForgeOps(ops, handle, "checkers consequences");
          if (o.kind !== "performed") {
            this.halt(
              `the ghost's move landed but its consequences failed (${o.kind})`
            );
            return;
          }
        }
        this.consecutiveGhostIllegal = 0;
        this.completeMove(matched, prev, "ghost");
        return;
      }
      this.refereeIllegalMove(decision);
      return;
    }
    if (decision.intent === "forge-move" && decision.forge_spec?.node) {
      // A forge-move on a game piece outside the ghost's legal
      // play — the referee puts the piece back and says so.
      const node = decision.forge_spec.node;
      if (node.startsWith("checkers-pc-") || node.startsWith("checkers-crown-")) {
        this.restoreGameNode(node);
        this.deps.onEvent({
          type: "ghost-illegal-move",
          node,
          detail: "a game piece was moved outside the game's rules",
        });
        return;
      }
    }
    // Anything else the ghost performed on this scene: the
    // census is the referee's answer.
    this.assertCensus();
  }

  private matchGhostMove(
    node: string,
    position: [number, number, number]
  ): CheckersMove | null {
    if (!node.startsWith("checkers-pc-")) return null;
    const pieceId = node.slice("checkers-pc-".length);
    const moves = checkersLegalMoves(this.state, CHECKERS_GHOST_SIDE).filter(
      (m) => m.pieceId === pieceId
    );
    for (const m of moves) {
      const final = m.landings[m.landings.length - 1];
      const world = checkersPieceWorld(final[0], final[1]);
      if (
        Math.abs(world[0] - position[0]) < 0.01 &&
        Math.abs(world[1] - position[1]) < 0.01 &&
        Math.abs(world[2] - position[2]) < 0.01
      ) {
        return m;
      }
    }
    return null;
  }

  private refereeIllegalMove(decision: GhostDecision): void {
    const node = decision.forge_spec?.node ?? "a piece";
    if (decision.forge_spec?.node) {
      this.restoreGameNode(decision.forge_spec.node);
    }
    this.consecutiveGhostIllegal += 1;
    this.deps.onEvent({
      type: "ghost-illegal-move",
      node,
      detail: "the move was not among the legal moves the referee offered",
    });
    if (this.consecutiveGhostIllegal >= 2) {
      this.halt(
        "the ghostie broke the game's rules twice in a row — the game is stopped"
      );
      return;
    }
    this.refereeNote =
      "Your last move was not one of the legal moves listed, so the referee returned the piece and the turn is still yours. Choose exactly one listed move.";
    this.feedSense();
    this.pushSnapshot();
  }

  /** Put a displaced game node back on its engine square. */
  private restoreGameNode(node: string): void {
    const handle = this.deps.getHandle();
    if (!handle) return;
    const ops: unknown[] = [];
    if (node.startsWith("checkers-pc-")) {
      const pieceId = node.slice("checkers-pc-".length);
      const sq = this.pieceSquareOf(pieceId);
      if (sq) {
        ops.push({
          type: "set-node",
          id: node,
          translation: checkersPieceWorld(sq[0], sq[1]),
        });
      }
    } else if (node.startsWith("checkers-crown-")) {
      const pieceId = node.slice("checkers-crown-".length);
      const sq = this.pieceSquareOf(pieceId);
      if (sq) {
        ops.push({
          type: "set-node",
          id: node,
          translation: checkersCrownWorld(sq[0], sq[1]),
        });
      }
    }
    if (ops.length > 0) {
      performForgeOps(ops, handle, "checkers referee restore");
    }
    this.assertCensus();
  }

  /** Shared completion: engine commit, events, reactions, sense. */
  private completeMove(
    move: CheckersMove,
    prev: CheckersState,
    via: "tap" | "ghost"
  ): void {
    const mover = prev.turn;
    const next = applyCheckersMove(prev, move);
    this.state = next;
    this.lastEvent = next.winner
      ? "win"
      : move.captures.length > 0
        ? "capture"
        : move.kinging
          ? "kinging"
          : null;
    if (via === "ghost") this.refereeNote = null;
    this.deps.onEvent({ type: "move", by: mover, move, via });
    if (move.captures.length > 0) {
      this.deps.onEvent({
        type: "capture",
        by: mover,
        count: move.captures.length,
      });
    }
    if (move.kinging) {
      this.deps.onEvent({ type: "kinging", by: mover });
    }
    // One-piece-left transitions, either side.
    for (const side of ["coral", "teal"] as CheckersSide[]) {
      const before = checkersPiecesOf(prev, side).length;
      const after = checkersPiecesOf(next, side).length;
      if (before > 1 && after === 1) {
        this.deps.onEvent({ type: "one-piece-left", side });
      }
    }
    if (next.winner) {
      this.deps.onEvent({ type: "win", winner: next.winner });
    }
    this.react(move, prev, next);
    if (!this.assertCensus()) return;
    this.feedSense();
    this.pushSnapshot();
  }

  /* ---- reactions ----------------------------------------------------- */

  /**
   * The markers feel the game (the game's puppets — see the
   * header): the mover's marker hops on a capture and rises +
   * spins on a crowning or the win; the victim's dips and
   * dims; a side down to its last piece hears a worried note.
   * Sounds ride the shared ghost voice, pitched from the
   * reacting seat's hue.
   */
  private react(
    move: CheckersMove,
    prev: CheckersState,
    next: CheckersState
  ): void {
    const mover = prev.turn;
    const victim = otherCheckersSide(mover);
    const moverEnd = checkersEndForSide(mover);
    const victimEnd = checkersEndForSide(victim);
    if (next.winner) {
      const winnerEnd = checkersEndForSide(next.winner);
      const loserEnd = checkersEndForSide(otherCheckersSide(next.winner));
      this.riseSpin(winnerEnd);
      this.dip(loserEnd);
      this.deps.playSfx("play", this.sfxHues[next.winner]);
      this.deps.playSfx("startle", this.sfxHues[otherCheckersSide(next.winner)]);
      return;
    }
    if (move.captures.length > 0) {
      this.hop(moverEnd);
      this.dip(victimEnd);
      this.deps.playSfx("play", this.sfxHues[mover]);
      this.deps.playSfx("startle", this.sfxHues[victim]);
    }
    if (move.kinging) {
      this.riseSpin(moverEnd);
      this.deps.playSfx("heart", this.sfxHues[mover]);
    }
    for (const side of ["coral", "teal"] as CheckersSide[]) {
      const before = checkersPiecesOf(prev, side).length;
      const after = checkersPiecesOf(next, side).length;
      if (before > 1 && after === 1) {
        this.deps.playSfx("thinking", this.sfxHues[side]);
      }
    }
  }

  private later(ms: number, fn: () => void): void {
    const seq = this.gameSeq;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (seq !== this.gameSeq || !this.active) return;
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private markerOps(
    end: "near" | "far",
    translation: [number, number, number],
    rotation?: [number, number, number, number]
  ): unknown[] {
    const op: Record<string, unknown> = {
      type: "set-node",
      id: checkersMarkerId(end),
      translation,
    };
    if (rotation) op.rotation = rotation;
    return [op];
  }

  private hop(end: "near" | "far"): void {
    const handle = this.deps.getHandle();
    if (!handle) return;
    const [x, y, z] = checkersMarkerWorld(end);
    performForgeOps(
      this.markerOps(end, [x, y + 0.3, z]),
      handle,
      "checkers reaction"
    );
    this.later(HOP_MS, () => {
      const h = this.deps.getHandle();
      if (h) {
        performForgeOps(
          this.markerOps(end, checkersMarkerWorld(end)),
          h,
          "checkers reaction"
        );
      }
    });
  }

  private dip(end: "near" | "far"): void {
    const handle = this.deps.getHandle();
    if (!handle) return;
    const [x, y, z] = checkersMarkerWorld(end);
    const mat = checkersMarkerMat(end);
    // Dip + dim together: the marker sinks and its own
    // material darkens (its hue, halved) — then both restore.
    performForgeOps(
      [
        ...this.markerOps(end, [x, y - 0.16, z]),
        {
          type: "set-material",
          id: mat,
          color: hexToLinear(darkenHex(this.markerHex[end], 0.5)),
        },
      ],
      handle,
      "checkers reaction"
    );
    this.later(DIP_MS, () => {
      const h = this.deps.getHandle();
      if (!h) return;
      performForgeOps(
        [
          ...this.markerOps(end, checkersMarkerWorld(end)),
          {
            type: "set-material",
            id: mat,
            color: hexToLinear(this.markerHex[end]),
          },
        ],
        h,
        "checkers reaction"
      );
    });
  }

  private riseSpin(end: "near" | "far"): void {
    const handle = this.deps.getHandle();
    if (!handle) return;
    const [x, y, z] = checkersMarkerWorld(end);
    const raised: [number, number, number] = [x, y + 0.45, z];
    performForgeOps(this.markerOps(end, raised), handle, "checkers reaction");
    const steps = [Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    steps.forEach((theta, i) => {
      this.later(110 * (i + 1), () => {
        const h = this.deps.getHandle();
        if (!h) return;
        const q: [number, number, number, number] = [
          0,
          Math.sin(theta / 2),
          0,
          Math.cos(theta / 2),
        ];
        performForgeOps(
          this.markerOps(end, raised, q),
          h,
          "checkers reaction"
        );
      });
    });
    this.later(110 * steps.length + CELEBRATE_MS, () => {
      const h = this.deps.getHandle();
      if (!h) return;
      performForgeOps(
        this.markerOps(end, checkersMarkerWorld(end), [0, 0, 0, 1]),
        h,
        "checkers reaction"
      );
    });
  }

  /* ---- the sense ----------------------------------------------------- */

  /**
   * Re-feed the current game sense. The layer's sense heartbeat
   * calls this while a game runs: the sense carries a freshness
   * window at the peer, and the ghost's turn must not go stale
   * ahead of its first deliberation on a slow device. The
   * peer's signature gate keeps an unchanged position from
   * re-arming deliberation, so this is a keep-alive, not a nag.
   * No-op when no game is live.
   */
  feedNow(): void {
    if (!this.active) return;
    this.feedSense();
  }

  private feedSense(): void {
    if (this.mode !== "vs-ghost") {
      this.deps.feedGameSense(null);
      return;
    }
    const state = this.state;
    const ghostSide = CHECKERS_GHOST_SIDE;
    const pieces: Array<{ node: string; side: CheckersSide; king: boolean }> =
      [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.cells[r * 8 + c];
        if (p) {
          pieces.push({
            node: checkersPieceId(p.id),
            side: p.side,
            king: p.king,
          });
        }
      }
    }
    const legal: Array<Record<string, unknown>> = [];
    if (state.turn === ghostSide && !state.winner) {
      for (const m of checkersLegalMoves(state, ghostSide)) {
        const final = m.landings[m.landings.length - 1];
        const after = applyCheckersMove(state, m);
        const moverPiece = state.cells[m.from[0] * 8 + m.from[1]];
        legal.push({
          node: checkersPieceId(m.pieceId),
          position: checkersPieceWorld(final[0], final[1]),
          captures: m.captures.length,
          captures_king: m.captures.some(
            (id) => this.findPieceIn(state, id)?.king
          ),
          kinging: m.kinging,
          exposes: checkersMoveExposes(after, m.pieceId),
          advance: moverPiece?.king
            ? 0
            : Math.max(
                0,
                ghostSide === "teal"
                  ? final[0] - m.from[0]
                  : m.from[0] - final[0]
              ),
        });
      }
    }
    this.deps.feedGameSense({
      ghost_side: ghostSide,
      to_move: state.turn,
      ghost_to_move: state.turn === ghostSide && !state.winner,
      move_number: state.moveNumber,
      pieces,
      legal_moves: legal,
      last_event: this.lastEvent,
      referee_note: this.refereeNote,
    });
  }

  /* ---- census + halt --------------------------------------------------- */

  private assertCensus(): boolean {
    const handle = this.deps.getHandle();
    if (!handle) return false;
    let nodes: Array<{
      id: string;
      geometry?: string;
      material?: string;
      translation?: number[];
    }> = [];
    try {
      nodes = handle.scene.exportRecipe().nodes ?? [];
    } catch {
      this.halt("the scene could not be read back for the census");
      return false;
    }
    const result = checkersCensus(nodes, this.state);
    if (!result.ok) {
      this.halt(
        `the scene and the game disagree: ${result.problems[0] ?? "unknown"}`
      );
      return false;
    }
    return true;
  }

  private halt(reason: string): void {
    this.haltedReason = reason;
    this.deps.onEvent({ type: "divergence", reason });
    this.pushSnapshot();
  }

  /* ---- snapshot --------------------------------------------------------- */

  snapshot(): CheckersGameSnapshot {
    const cap = (s: CheckersSide) => (s === "coral" ? "Coral" : "Teal");
    let banner = "";
    if (this.haltedReason) {
      banner = `The game stopped — ${this.haltedReason}`;
    } else if (!this.active) {
      banner = "";
    } else if (this.state.winner) {
      banner =
        this.mode === "vs-ghost"
          ? this.state.winner === CHECKERS_GHOST_SIDE
            ? "Your ghostie wins the board"
            : "You win the board"
          : `${cap(this.state.winner)} wins the board`;
    } else if (this.mode === "vs-ghost") {
      banner =
        this.state.turn === CHECKERS_GHOST_SIDE
          ? "Your ghostie's turn"
          : "Your move";
    } else {
      banner = `${cap(this.state.turn)} to move`;
    }
    return {
      active: this.active,
      mode: this.mode,
      turn: this.active ? this.state.turn : null,
      winner: this.active ? this.state.winner : null,
      selectedPieceId: this.selection?.pieceId ?? null,
      halted: this.haltedReason,
      banner,
    };
  }

  private pushSnapshot(): void {
    this.deps.onSnapshot(this.snapshot());
  }

  /** The engine state, for the check and the layer's census. */
  getState(): CheckersState {
    return this.state;
  }

  get isActive(): boolean {
    return this.active;
  }
}
