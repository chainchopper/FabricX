/**
 * boardData — the bounty board's computed view model (Slice 36).
 *
 * Every number on an alpha card comes from here, and every
 * number here is COMPUTED from the job spec + the room's
 * measured state:
 * - work totals from the spec (shardEngine's formulas),
 * - room power = the sum of joined devices' BENCHMARKED
 *   throughput (measured at join, never declared),
 * - ETA = remaining work / room power — null (rendered "—")
 *   when no measured power exists to divide by,
 * - share previews = my measured power / room power, labelled
 *   estimates wherever they are shown,
 * - progress and earnings from the verified ledger only.
 *
 * Node jobs carry nulls where the truth belongs to the node:
 * their ETAs and costs are the node's to report, and this module
 * would rather hand the card a null than an invention.
 *
 * Pure module: field state in, view model out.
 *
 * Powered by Nirvana
 */

import {
  contributionsOf,
  missionProgress,
  roomPowerOf,
} from "./fieldState";
import { estimateEtaSeconds, estimatedShare } from "./shardEngine";
import type {
  GenxBountyDef,
  GenxContribution,
  GenxFieldState,
  GenxJobStatus,
} from "./genxTypes";

export interface GenxCardData {
  def: GenxBountyDef;
  status: GenxJobStatus;
  /** Joined devices' summed measured throughput (cells/sec). */
  roomPower: number;
  joinedCount: number;
  myCellsPerSec: number | null;
  /** Remaining work / room power; null when unknowable. */
  etaSeconds: number | null;
  /** My estimated share of the pool at CURRENT room power (0..1). */
  myShareEstimate: number;
  /** myShareEstimate × pool; null for node jobs. */
  myJuiceEstimate: number | null;
  /** Verified progress 0..1 for the active/last mission; null for node jobs pre-run. */
  progress: number | null;
  /** Node-reported progress for node jobs (the node's own number). */
  nodeProgress: number | null;
  contributors: GenxContribution[];
  /** Verified work units so far (room jobs). */
  verifiedWork: number;
  /** Juice actually earned so far by the room (verified only). */
  juiceEarned: number;
}

export function bountyCardData(
  field: GenxFieldState,
  def: GenxBountyDef,
  selfId: string
): GenxCardData | null {
  const bounty = field.bounties[def.id];
  if (!bounty) return null;
  const roomPower = roomPowerOf(bounty);
  const myCellsPerSec = bounty.joins[selfId] ?? null;
  const mission =
    field.mission && field.mission.spec.jobId === def.id ? field.mission : null;
  const contributors = contributionsOf(mission, def.juicePool);
  const verifiedWork = contributors.reduce((a, c) => a + c.verifiedWork, 0);
  const juiceEarned = contributors.reduce((a, c) => a + c.juice, 0);
  const totalWork = def.totalWorkUnits ?? 0;
  const remaining = Math.max(0, totalWork - verifiedWork);
  const myShareEstimate =
    myCellsPerSec !== null ? estimatedShare(myCellsPerSec, roomPower) : 0;
  return {
    def,
    status: bounty.status,
    roomPower,
    joinedCount: Object.keys(bounty.joins).length,
    myCellsPerSec,
    etaSeconds:
      def.kind === "room-fold" ? estimateEtaSeconds(remaining, roomPower) : null,
    myShareEstimate,
    myJuiceEstimate:
      def.juicePool !== null ? myShareEstimate * def.juicePool : null,
    progress: mission ? missionProgress(mission) : null,
    nodeProgress: bounty.nodeJob?.nodeProgress ?? null,
    contributors,
    verifiedWork,
    juiceEarned,
  };
}

/** All cards on the board, in posting order (oldest first). */
export function allCardData(
  field: GenxFieldState,
  selfId: string
): GenxCardData[] {
  return Object.values(field.bounties)
    .map((b) => bountyCardData(field, b.def, selfId))
    .filter((c): c is GenxCardData => c !== null)
    .sort((a, b) => a.def.createdAt - b.def.createdAt);
}

/* ------------------------------------------------------------------ */
/* Formatting (display only — the numbers above are the truth)         */
/* ------------------------------------------------------------------ */

export function fmtWork(units: number): string {
  if (units >= 1_000_000) return `${(units / 1_000_000).toFixed(1)}M cell-steps`;
  if (units >= 1_000) return `${(units / 1_000).toFixed(1)}k cell-steps`;
  return `${Math.floor(units)} cell-steps`;
}

export function fmtRate(cellsPerSec: number): string {
  if (cellsPerSec >= 1_000_000) {
    return `${(cellsPerSec / 1_000_000).toFixed(1)}M cell-steps/s`;
  }
  if (cellsPerSec >= 1_000) return `${(cellsPerSec / 1_000).toFixed(0)}k cell-steps/s`;
  return `${Math.floor(cellsPerSec)} cell-steps/s`;
}

export function fmtEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}

export function fmtJuice(juice: number): string {
  return `${juice.toFixed(1)} Juice`;
}
