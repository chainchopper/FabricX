/**
 * genxTypes — the shared vocabulary of The Fold (Slice 36).
 *
 * The Fold is Fabric's distributed-compute fabric, built on
 * chainchopper/GenX's node-controller contract (REST :3005 —
 * /health, /hardware, /jobs/submit, /jobs/:provider/:jobId/status,
 * /fah/stats, /tasks/status — and its allocator's laws). Two kinds
 * of work live here, and this module keeps them verbally distinct
 * everywhere, because the honesty rule of the whole fabric is:
 *
 *   SHARDS are compute — a room job is split across the session's
 *   own devices; each device genuinely computes its shard, the
 *   result is checksummed, the allocator RECOMPUTES it before it
 *   counts, and Juice accrues only to verified shards.
 *
 *   The NODE is folding — a real GenX node-controller on a real PC
 *   runs FAHClient / provider jobs. Fabric never executes that
 *   work; a bridge client observes the node's own reports into
 *   the same field and can submit jobs through its real API.
 *
 *   The FIELD is Fabric — one shared state every screen renders
 *   identically, folded from room messages by a pure reducer.
 *
 * Every number in these types is either measured on a device
 * (benchmarks, timings), recomputed by a verifier (checksums), or
 * reported by the node itself (labelled node-reported). Nothing
 * here is a placeholder: a value the system cannot know is null
 * or absent, never invented.
 *
 * Pure types + constants: no imports, no storage, no timers.
 *
 * Powered by Nirvana
 */

/* ------------------------------------------------------------------ */
/* Jobs (the bounty board)                                             */
/* ------------------------------------------------------------------ */

/**
 * The two job kinds the board can carry:
 * - "room-fold": executed by the room itself, in shards (G2).
 * - "node-job": executed by a bridged GenX node through its real
 *   /jobs/submit API (G3); the room only submits and observes.
 */
export type GenxJobKind = "room-fold" | "node-job";

export type GenxJobStatus = "open" | "running" | "complete" | "failed";

/** The forming shape a job's field coheres toward (GenX Visualizer's contract). */
export type GenxForm = "helix" | "sheet" | "complex";

/**
 * A bounty definition — the "alpha card" data. Posted by a host
 * (Fanalogy's seed bounties today; researchers/institutions later,
 * per Terrell's marketplace direction). `juicePool` is COMPUTED
 * from the job spec for room jobs (see shardEngine.juicePoolFor)
 * and null for node jobs — a node's cost is whatever its provider
 * reports at run time, and the card says so instead of guessing.
 * `totalWorkUnits` is likewise computed from the spec for room
 * jobs (tile cells × generations × shards) and null for node jobs.
 */
export interface GenxBountyDef {
  id: string;
  kind: GenxJobKind;
  title: string;
  /** One-line meta summary for the card. */
  summary: string;
  /** Who posted it (participant id) — cards are attributable. */
  postedBy: string;
  form: GenxForm;
  /** GenX framework id for node jobs (e.g. "esmfold"); null for room jobs. */
  framework: string | null;
  /** Job parameter payload for node jobs (e.g. { sequence }); null for room jobs. */
  params: Record<string, string> | null;
  /**
   * The real structure this job is about — a bundled structure
   * id (structures.ts registry: "4HHB", "AF-P01308") or null
   * for jobs with no structure (Slice 39). Cards and the
   * molecular layer resolve it against the registry; an id
   * that resolves to nothing is a data error, never a render
   * of an invented molecule.
   */
  structureId: string | null;
  /** Computed at post time from the job spec; null when unknowable. */
  totalWorkUnits: number | null;
  /** Computed at post time from the job spec; null when unknowable. */
  juicePool: number | null;
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/* Room-fold missions and shards                                       */
/* ------------------------------------------------------------------ */

/**
 * One shard's domain in a structure mission: a contiguous
 * range of residues inside a single chain of a real structure,
 * identified by the chain id and the 0-based [start, end)
 * indices into that chain's Cα trace. Positional law: the
 * range at index i of a structure spec's ranges IS mission
 * shard i (Slice 40's binding contract).
 */
export interface GenxStructureRange {
  chainId: string;
  start: number;
  end: number;
}

/**
 * The structure variant of a mission spec (Slice 41): the
 * mission folds a real bundled structure (structures.ts
 * registry), and its shards are that structure's residue
 * ranges, cut by structures.structureShards at mission
 * creation and carried in the spec so every device derives
 * the same domains from the spec alone. A shard's work is a
 * deterministic relaxation of its range (structureEngine.ts):
 * the claim is a checksum of the range's final Cα coordinates,
 * and the allocator RE-RUNS the identical relaxation before
 * the shard counts — the same verify door as the tile
 * missions, no second door.
 */
export interface GenxStructureSpec {
  /** Bundled structure id (registry key, e.g. "4HHB"). */
  structureId: string;
  /** Relaxation iterations every shard runs (the work spec). */
  relaxSteps: number;
  /** The shard domains, in shard order. */
  ranges: GenxStructureRange[];
}

/**
 * A mission is one run of a room-fold job: a deterministic spec
 * every device can execute or verify from the spec alone. The
 * seed + rules travel; the field itself never does.
 *
 * Two variants, one lifecycle: a TILE mission (structure ===
 * null) evolves the LifePacket field in tiles; a STRUCTURE
 * mission (structure !== null) relaxes residue ranges of a
 * real molecule. A structure mission's tile-geometry fields
 * are 0 and carry no meaning — its geometry lives in
 * structure.ranges.
 */
export interface GenxMissionSpec {
  missionId: string;
  jobId: string;
  /** The allocator (host) participant id — its word assigns and verifies. */
  allocatorId: string;
  seed: number;
  fieldW: number;
  fieldH: number;
  tileW: number;
  tileH: number;
  /** Generations each tile evolves. Work per shard = tileW*tileH*generations. */
  generations: number;
  /** The structure variant, or null for a tile mission. */
  structure: GenxStructureSpec | null;
  form: GenxForm;
  startedAt: number;
}

export interface GenxShardAssignment {
  shardId: number;
  to: string;
  attempt: number;
}

export type GenxShardStatus =
  | "queued"
  | "assigned"
  | "running"
  | "claimed"
  | "verified"
  | "failed";

export interface GenxShardState {
  shardId: number;
  /**
   * Tile origin in the field (cells). 0 for structure shards —
   * their domain is a residue range (spec.structure.ranges),
   * not a tile.
   */
  tileX: number;
  tileY: number;
  status: GenxShardStatus;
  assignee: string | null;
  attempt: number;
  /** 0..1 — the assignee's own reported compute progress. */
  progress: number;
  /** The claimed result's checksum (present once claimed). */
  checksum: string | null;
  /**
   * Live cells in the claimed final tile (tile shards); the
   * range's residue count — Cα positions produced — for
   * structure shards (present once claimed).
   */
  liveCells: number | null;
  /** Who produced the current claim. */
  claimedBy: string | null;
  /**
   * Work units this shard represents: tileW*tileH*generations
   * for tile shards; the range's residue count for structure
   * shards (structures.ts: one work unit per residue).
   */
  workUnits: number;
  /** Last time any word arrived about this shard (stall watch). */
  lastWordAt: number;
}

/* ------------------------------------------------------------------ */
/* The node (observed, never impersonated)                             */
/* ------------------------------------------------------------------ */

export type GenxFahStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

/**
 * One sanitized reading of a real GenX node-controller, broadcast
 * by the ONE client that can reach it (the bridge). Load numbers
 * are the node's own reports — GenX's shipped telemetry collector
 * is synthetic upstream, so the reading is labelled
 * "node-reported" wherever it is shown and never cited as a
 * measurement. FAH status, by contrast, comes from the node's
 * real telnet probe of its FAHClient and is stated plainly.
 */
export interface GenxNodeReading {
  /** Bridge-side label for the node (its controller URL host). */
  label: string;
  /** When the bridge took this reading (bridge clock). */
  at: number;
  /** /health answered at all. */
  reachable: boolean;
  /** FAH status exactly as /fah/stats reported it. */
  fahStatus: GenxFahStatus;
  /** Points/day exactly as /fah/stats reported it (0 when offline). */
  fahPointsPerDay: number;
  /** FAH slots exactly as reported (id/type/status only). */
  fahSlots: { id: number; type: string; status: string }[];
  /** Allocator counts from /tasks/status. */
  nodes: number;
  queuedTasks: number;
  activeTasks: number;
  /** Providers /health reports installed (foldingathome / colabfold). */
  providersInstalled: string[];
  /** CPU load exactly as /telemetry reported it — node-reported, see header. */
  cpuLoadReported: number | null;
}

/**
 * The bridge probe's verdict, surfaced in THIS LAYER settings
 * (spec risk R1: an https page polling a LAN http service is
 * exactly what Chrome's Private Network Access rules restrict).
 * - "reachable": /health answered with CORS permission.
 * - "blocked": the server answers (an opaque no-cors probe got
 *   through) but the browser will not let this page READ it —
 *   CORS/PNA is refusing, which is a different fact from offline.
 * - "offline": nothing answered either probe.
 */
export type GenxProbeState =
  | "unknown"
  | "probing"
  | "reachable"
  | "blocked"
  | "offline";

export interface GenxProbeStatus {
  state: GenxProbeState;
  url: string;
  at: number;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Node jobs (submitted through the bridge)                            */
/* ------------------------------------------------------------------ */

export interface GenxNodeJobState {
  /** The bounty card id this run belongs to. */
  jobId: string;
  /** The bridge client running it (participant id). */
  bridgeId: string;
  /** Provider/framework name the job was submitted under. */
  provider: string;
  /** The job id the NODE returned from /jobs/submit; null until it does. */
  nodeJobId: string | null;
  /** Status exactly as the node reports it (sanitized to a string). */
  nodeStatus: string;
  /** Progress exactly as the node reports it, when it reports one. */
  nodeProgress: number | null;
  /** True when the node's results endpoint answered with a payload. */
  hasResults: boolean;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* Field state (the one shared truth)                                  */
/* ------------------------------------------------------------------ */

export interface GenxBountyState {
  def: GenxBountyDef;
  status: GenxJobStatus;
  /** participantId → measured cells/sec they benchmarked at join. */
  joins: Record<string, number>;
  /** Node-job run state, once a bridge submits this card's job. */
  nodeJob: GenxNodeJobState | null;
}

export interface GenxMissionState {
  spec: GenxMissionSpec;
  shards: GenxShardState[];
  status: "running" | "complete";
  completedAt: number | null;
}

export interface GenxFieldState {
  bounties: Record<string, GenxBountyState>;
  mission: GenxMissionState | null;
  node: GenxNodeReading | null;
  /** participantId → total VERIFIED work units across this room's missions. */
  verifiedWork: Record<string, number>;
}

/** One participant's line in a mission's contribution table. */
export interface GenxContribution {
  participantId: string;
  verifiedWork: number;
  verifiedShards: number;
  /** verifiedWork / total verified work, 0..1 — sums to 1 across the table. */
  share: number;
  /** Pro-rata share of the job's Juice pool, from verified work only. */
  juice: number;
}

/* ------------------------------------------------------------------ */
/* The ghost's sense of the field                                      */
/* ------------------------------------------------------------------ */

/**
 * The sanitized digest the ghost deliberates with (GhostBrain's
 * `genx` scenario field mirrors this shape). Everything in it is
 * derived from the field state above — counts and ratios of real
 * events, never impressions.
 */
export interface GenxSenseSnapshot {
  /** Contributors currently in the field (joined devices + node). */
  nodesOnline: number;
  /** 0..1 — share of joined room power currently mid-shard. */
  fieldLoad: number;
  /** 0..1 — verified shards / total shards of the active mission. */
  missionProgress: number;
  shardsDone: number;
  shardsTotal: number;
  /** A bridged node's FAH is ONLINE (its own report). */
  fahOnline: boolean;
  /** Shards assigned/running with no word past the stall window. */
  stalled: number;
}

/** A follow alert — a real field transition on a followed job. */
export interface GenxAlert {
  id: string;
  jobId: string;
  text: string;
  at: number;
}

/* ------------------------------------------------------------------ */
/* Wire payloads (useFluidMultiUser's genx family)                     */
/* ------------------------------------------------------------------ */

/**
 * The genx message family. Every payload is hostile until the
 * fieldState sanitizers clamp it; the reducer additionally
 * enforces origin law (only a mission's allocator assigns,
 * claims, or verifies its shards). Older clients ignore the
 * whole family.
 */
export type GenxWireMessage =
  | { type: "genx-bounty"; from: string; bounty: unknown }
  | { type: "genx-join"; from: string; jobId: string; cellsPerSec: number }
  | { type: "genx-mission"; from: string; mission: unknown }
  | {
      type: "genx-shard";
      from: string;
      missionId: string;
      shardId: number;
      to: string;
      attempt: number;
    }
  | {
      type: "genx-progress";
      from: string;
      missionId: string;
      shardId: number;
      progress: number;
    }
  | {
      type: "genx-result";
      from: string;
      missionId: string;
      shardId: number;
      checksum: string;
      liveCells: number;
      ms: number;
    }
  | {
      type: "genx-verdict";
      from: string;
      missionId: string;
      shardId: number;
      ok: boolean;
    }
  | {
      type: "genx-fail";
      from: string;
      missionId: string;
      shardId: number;
    }
  | { type: "genx-node"; from: string; reading: unknown }
  | { type: "genx-nodejob"; from: string; update: unknown };
