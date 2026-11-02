/**
 * useGenxRoom — The Fold's working engine (Slice 36).
 *
 * Everything operational lives here, on top of the pure field
 * state: posting the seed bounties, joining with a MEASURED
 * benchmark, running assigned shards (Worker, self-tested), the
 * allocator's duties (verify every claim by recompute, re-queue
 * stalled shards, retire the hopeless), the GenX node bridge,
 * and node-job submission/polling through the node's real API.
 *
 * Structure missions (Slice 41) run through this same hook:
 * a room-fold job whose def binds a bundled structure starts
 * as a structure mission (residue-range shards, relaxation
 * work — structureEngine), its claims pass through the same
 * recompute door in its structure form (verifyStructureClaim),
 * and the stall watch re-queues its ranges like tiles.
 *
 * The laws, enforced here and in the reducer together:
 * - a device joins a job only with throughput it just measured
 *   on the real benchmark workload;
 * - a claim becomes verified ONLY by the allocator recomputing
 *   the shard and matching its checksum (verifyClaim's door is
 *   this hook's verdict);
 * - a shard whose worker goes quiet is re-queued to another
 *   joined device, up to the allocator's attempt cap, then
 *   retired — visibly, in the shared state, never silently;
 * - the node is observed and submitted to, never impersonated:
 *   every reading and job status is the node's own report.
 *
 * Powered by Nirvana
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getIdentitySnapshot } from "../identity/identityStore";
import { getSessionPublicState } from "../session/sessionStore";
import { GENX_MAX_ATTEMPTS, GENX_STALL_MS } from "./fieldState";
import {
  ensureGenxPrefsLoaded,
  getGenxSnapshot,
  setGenxProbe,
  setGenxSelfId,
  subscribeGenx,
} from "./genxStore";
import {
  createNodeBridge,
  fetchNodeJobStatus,
  probeNode,
  sanitizeNodeUrl,
  submitNodeJob,
  type NodeBridge,
} from "./nodeBridge";
import {
  buildSeedBounties,
  measureThroughput,
  planAssignments,
  roomFoldSpec,
  tileSpecFor,
  verifyClaim,
} from "./shardEngine";
import { runShard } from "./shardWorker";
import { loadBundledStructure } from "./molStructures";
import type { MolStructure } from "./molMath";
import { bundledStructureMeta } from "./structures";
import {
  structureFoldSpec,
  verifyStructureClaim,
} from "./structureEngine";
import { runStructureShard } from "./structureWorker";
import type { GenxWireMessage } from "./genxTypes";

/**
 * Both shard runners return this shape (the tile runner's
 * result carries more; the room only needs the claim fields).
 */
interface AnyRunHandle {
  promise: Promise<{ checksum: string; liveCells: number; ms: number }>;
  cancel: () => void;
}

type SendGenx = (msg: Omit<GenxWireMessage, "from">) => void;

const MAX_CONCURRENT_SHARDS = 2;
const PROGRESS_SEND_MS = 500;

export interface GenxRoomApi {
  /** Join a room-fold job with a freshly measured benchmark. */
  joinJob: (jobId: string) => number;
  /** Host: split a room-fold job across its joined devices and start it. */
  startRoomFold: (jobId: string) => void;
  /** Bridge owner: submit a node-job card through the node's API. */
  runNodeJob: (jobId: string) => void;
  /** Node-job ids with a submission/poll in flight from this client. */
  nodeJobBusy: string[];
}

export function useGenxRoom(args: {
  userId: string;
  isHost: boolean;
  lendDevice: boolean;
  nodeUrl: string;
  sendGenx: SendGenx;
}): GenxRoomApi {
  const { userId, sendGenx } = args;
  const lendRef = useRef(args.lendDevice);
  lendRef.current = args.lendDevice;
  const hostRef = useRef(args.isHost);
  hostRef.current = args.isHost;
  const sendRef = useRef(sendGenx);
  sendRef.current = sendGenx;

  const [nodeJobBusy, setNodeJobBusy] = useState<string[]>([]);
  const runningRef = useRef<Map<number, AnyRunHandle>>(new Map());
  // Parsed structures for structure missions, loaded through
  // molStructures (bundled asset → real parser) and cached for
  // the session; a worker/verdict that finds no structure yet
  // kicks the load off and waits for the tick to re-scan — it
  // never guesses a verdict or a checksum.
  const structureCacheRef = useRef<Map<string, MolStructure | null>>(
    new Map()
  );
  const structureLoadingRef = useRef<Set<string>>(new Set());
  const [structureTick, setStructureTick] = useState(0);
  const ensureStructure = useCallback((structureId: string) => {
    if (
      structureCacheRef.current.has(structureId) ||
      structureLoadingRef.current.has(structureId)
    ) {
      return;
    }
    structureLoadingRef.current.add(structureId);
    void loadBundledStructure(structureId).then((s) => {
      structureLoadingRef.current.delete(structureId);
      structureCacheRef.current.set(structureId, s);
      setStructureTick((t) => t + 1);
    });
  }, []);
  const verifyingRef = useRef<Set<number>>(new Set());
  const lastProgressRef = useRef<Map<number, number>>(new Map());
  const nodePollRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  useEffect(() => {
    setGenxSelfId(userId);
    void ensureGenxPrefsLoaded();
  }, [userId]);

  /* ---------------- seed bounties (host-posted, heal on a heartbeat) -------- */
  useEffect(() => {
    const postSeeds = () => {
      if (!hostRef.current) return;
      const field = getGenxSnapshot().field;
      for (const def of buildSeedBounties(userId, Date.now())) {
        if (!field.bounties[def.id]) {
          sendRef.current({ type: "genx-bounty", bounty: def });
        }
      }
    };
    postSeeds();
    const id = setInterval(postSeeds, 20_000);
    return () => clearInterval(id);
  }, [userId]);

  /* ---------------- join (measured, never declared) ------------------------- */
  const joinJob = useCallback(
    (jobId: string): number => {
      const field = getGenxSnapshot().field;
      const existing = field.bounties[jobId]?.joins[userId];
      if (existing) return existing;
      // The benchmark runs the REAL shard workload on this
      // device, timed. It blocks for a few hundred ms on an
      // explicit tap — the honest price of a measured number.
      const cellsPerSec = measureThroughput();
      if (cellsPerSec > 0) {
        sendRef.current({ type: "genx-join", jobId, cellsPerSec });
      }
      return cellsPerSec;
    },
    [userId]
  );

  /* ---------------- start a room fold (the allocator's first word) ---------- */
  const startRoomFold = useCallback(
    (jobId: string) => {
      const field = getGenxSnapshot().field;
      const bounty = field.bounties[jobId];
      if (!bounty) return;
      const joins = { ...bounty.joins };
      if (lendRef.current && !joins[userId]) {
        const cps = measureThroughput();
        if (cps > 0) {
          joins[userId] = cps;
          sendRef.current({ type: "genx-join", jobId, cellsPerSec: cps });
        }
      }
      const workers = Object.entries(joins).map(([id, cellsPerSec]) => ({
        id,
        cellsPerSec,
      }));
      if (workers.length === 0) return;
      const seed =
        ((getIdentitySnapshot().self?.seed ?? 0) ^ Date.now()) >>> 0;
      // A room-fold job bound to a bundled structure starts as
      // a STRUCTURE mission (Slice 41): the spec is built from
      // the registry's verified metadata alone, its shards are
      // the structure's residue ranges, and planAssignments
      // deals them by the same measured-power law.
      const structureMeta =
        bounty.def.kind === "room-fold"
          ? bundledStructureMeta(bounty.def.structureId)
          : null;
      if (structureMeta) {
        const spec = structureFoldSpec({
          missionId: `fold-${Date.now().toString(36)}-${(seed & 0xffff).toString(16)}`,
          jobId,
          allocatorId: userId,
          structureId: structureMeta.id,
          seed,
          startedAt: Date.now(),
          form: bounty.def.form,
        });
        if (!spec) return;
        const assignments = planAssignments(spec, workers);
        sendRef.current({
          type: "genx-mission",
          mission: { ...spec, assignments },
        });
        return;
      }
      const spec = roomFoldSpec({
        missionId: `fold-${Date.now().toString(36)}-${(seed & 0xffff).toString(16)}`,
        jobId,
        allocatorId: userId,
        seed,
        startedAt: Date.now(),
      });
      const assignments = planAssignments(spec, workers);
      sendRef.current({
        type: "genx-mission",
        mission: { ...spec, assignments },
      });
    },
    [userId]
  );

  /* ---------------- shard work (this device, when lent + assigned) ---------- */
  useEffect(() => {
    const scan = () => {
      const { field } = getGenxSnapshot();
      const mission = field.mission;
      // Cancel runs whose shard is no longer mine to work.
      for (const [shardId, handle] of runningRef.current) {
        const s = mission?.shards.find((x) => x.shardId === shardId);
        if (
          !mission ||
          mission.status !== "running" ||
          !s ||
          s.assignee !== userId ||
          (s.status !== "assigned" && s.status !== "running")
        ) {
          handle.cancel();
          runningRef.current.delete(shardId);
        }
      }
      if (!mission || mission.status !== "running" || !lendRef.current) return;
      // Only joined devices work — joining is the consent, and
      // the benchmark is the ticket.
      if (!field.bounties[mission.spec.jobId]?.joins[userId]) return;
      for (const s of mission.shards) {
        if (runningRef.current.size >= MAX_CONCURRENT_SHARDS) break;
        if (s.assignee !== userId) continue;
        if (s.status !== "assigned" && s.status !== "running") continue;
        if (runningRef.current.has(s.shardId)) continue;
        const spec = mission.spec;
        const shardId = s.shardId;
        const onProgress = (p: number) => {
          const last = lastProgressRef.current.get(shardId) ?? 0;
          const now = Date.now();
          if (now - last < PROGRESS_SEND_MS) return;
          lastProgressRef.current.set(shardId, now);
          sendRef.current({
            type: "genx-progress",
            missionId: spec.missionId,
            shardId,
            progress: p,
          });
        };
        let handle: AnyRunHandle;
        if (spec.structure) {
          // A structure shard runs the range's relaxation
          // (structureWorker) — which needs the real parsed
          // structure. Not loaded yet: kick the load off and
          // let the tick re-scan; the shard stays assigned.
          const structure = structureCacheRef.current.get(
            spec.structure.structureId
          );
          if (!structure) {
            ensureStructure(spec.structure.structureId);
            continue;
          }
          handle = runStructureShard(spec, shardId, structure, onProgress);
        } else {
          handle = runShard(tileSpecFor(spec, shardId), onProgress);
        }
        runningRef.current.set(shardId, handle);
        handle.promise
          .then((r) => {
            runningRef.current.delete(shardId);
            sendRef.current({
              type: "genx-result",
              missionId: spec.missionId,
              shardId,
              checksum: r.checksum,
              liveCells: r.liveCells,
              ms: Math.round(r.ms),
            });
          })
          .catch(() => {
            // Cancelled or failed locally: the claim never
            // leaves, and the allocator's stall watch re-queues
            // the shard. Nothing is reported that did not happen.
            runningRef.current.delete(shardId);
          });
      }
    };
    scan();
    return subscribeGenx(scan);
    // structureTick: a finished structure load re-scans, so
    // shards that waited on the parse start without a store
    // event having to occur.
  }, [userId, structureTick]);

  /* ---------------- the allocator's verdicts (recompute or it didn't count) - */
  useEffect(() => {
    const scan = () => {
      const { field } = getGenxSnapshot();
      const mission = field.mission;
      if (!mission || mission.spec.allocatorId !== userId) return;
      for (const s of mission.shards) {
        if (s.status !== "claimed" || !s.checksum) continue;
        if (verifyingRef.current.has(s.shardId)) continue;
        const spec = mission.spec;
        const shardId = s.shardId;
        const claimed = s.checksum;
        if (spec.structure) {
          // THE verdict, structure form: the allocator re-runs
          // the range's relaxation from the spec + the real
          // structure and compares coordinate checksums
          // (verifyStructureClaim). The recompute needs the
          // parsed structure; while it is still loading, the
          // claim WAITS — an unverifiable-yet claim is neither
          // waved through nor punished for the allocator's
          // fetch. Verifying starts once the structure is in.
          const structure = structureCacheRef.current.get(
            spec.structure.structureId
          );
          if (!structure) {
            ensureStructure(spec.structure.structureId);
            continue;
          }
          verifyingRef.current.add(shardId);
          setTimeout(() => {
            let ok = false;
            try {
              ok = verifyStructureClaim(structure, spec, shardId, claimed);
            } catch {
              ok = false;
            }
            verifyingRef.current.delete(shardId);
            sendRef.current({
              type: "genx-verdict",
              missionId: spec.missionId,
              shardId,
              ok,
            });
          }, 0);
          continue;
        }
        verifyingRef.current.add(shardId);
        // THE verdict: verifyClaim recomputes the shard from
        // the spec and compares checksums — the single door
        // from claimed to verified. Deferred off the store's
        // dispatch so the recompute never blocks an input path;
        // it is a bounded, one-tile computation.
        setTimeout(() => {
          let ok = false;
          try {
            ok = verifyClaim(spec, shardId, claimed);
          } catch {
            ok = false;
          }
          verifyingRef.current.delete(shardId);
          sendRef.current({
            type: "genx-verdict",
            missionId: spec.missionId,
            shardId,
            ok,
          });
        }, 0);
      }
    };
    scan();
    return subscribeGenx(scan);
    // structureTick: a finished structure load re-scans, so
    // claims that waited on the parse get their verdict.
  }, [userId, structureTick]);

  /* ---------------- the allocator's stall watch (re-queue ≤ cap, then retire) */
  useEffect(() => {
    const id = setInterval(() => {
      const { field } = getGenxSnapshot();
      const mission = field.mission;
      if (!mission || mission.status !== "running") return;
      if (mission.spec.allocatorId !== userId) return;
      const joins = field.bounties[mission.spec.jobId]?.joins ?? {};
      const workers = Object.keys(joins);
      if (workers.length === 0) return;
      const session = getSessionPublicState();
      const present =
        session.guestIds.length > 0
          ? new Set([userId, ...session.guestIds])
          : null;
      const now = Date.now();
      for (const s of mission.shards) {
        if (s.status !== "assigned" && s.status !== "running") continue;
        if (!s.assignee) continue;
        const departed = present !== null && !present.has(s.assignee);
        const silent = now - s.lastWordAt > GENX_STALL_MS;
        if (!departed && !silent) continue;
        if (s.attempt >= GENX_MAX_ATTEMPTS) {
          sendRef.current({
            type: "genx-fail",
            missionId: mission.spec.missionId,
            shardId: s.shardId,
          });
          continue;
        }
        const others = workers.filter((w) => w !== s.assignee);
        const next =
          others.length > 0
            ? others[s.attempt % others.length]
            : s.assignee === userId
              ? userId
              : workers[0];
        sendRef.current({
          type: "genx-shard",
          missionId: mission.spec.missionId,
          shardId: s.shardId,
          to: next,
          attempt: s.attempt + 1,
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [userId]);

  /* ---------------- the node bridge (observe a real GenX node) -------------- */
  useEffect(() => {
    const url = sanitizeNodeUrl(args.nodeUrl);
    if (!url) {
      setGenxProbe({
        state: "unknown",
        url: "",
        at: Date.now(),
        detail:
          "No node address set. A GenX node-controller (node start-node.js) at an address this browser can reach will report into the field.",
      });
      return;
    }
    let bridge: NodeBridge | null = null;
    let live = true;
    void probeNode(url).then((probe) => {
      if (live) setGenxProbe(probe);
    });
    bridge = createNodeBridge({
      url,
      onReading: (reading) => {
        sendRef.current({ type: "genx-node", reading });
      },
    });
    return () => {
      live = false;
      bridge?.stop();
    };
  }, [args.nodeUrl]);

  /* ---------------- node jobs (submit + poll the node's own status) --------- */
  const runNodeJob = useCallback(
    (jobId: string) => {
      const url = sanitizeNodeUrl(args.nodeUrl);
      if (!url) return;
      const def = getGenxSnapshot().field.bounties[jobId]?.def;
      if (!def || def.kind !== "node-job" || !def.framework) return;
      if (nodePollRef.current.has(jobId)) return;
      setNodeJobBusy((prev) => [...prev, jobId]);
      const framework = def.framework;
      const params = def.params ?? {};
      void (async () => {
        const submitted = await submitNodeJob(url, framework, params);
        const broadcast = (
          nodeStatus: string,
          nodeProgress: number | null,
          hasResults: boolean
        ) => {
          sendRef.current({
            type: "genx-nodejob",
            update: {
              jobId,
              bridgeId: userId,
              provider: framework,
              nodeJobId: submitted.jobId,
              nodeStatus,
              nodeProgress,
              hasResults,
              updatedAt: Date.now(),
            },
          });
        };
        if (!submitted.ok || !submitted.jobId) {
          broadcast(
            submitted.ok
              ? "submitted — the node returned no job id"
              : `submit failed: ${submitted.error ?? "node unreachable"}`,
            null,
            false
          );
          setNodeJobBusy((prev) => prev.filter((j) => j !== jobId));
          return;
        }
        broadcast(submitted.status, null, false);
        const startedAt = Date.now();
        let lastKey = "";
        const poll = async () => {
          const pollResult = await fetchNodeJobStatus(
            url,
            framework,
            submitted.jobId as string
          );
          const key = `${pollResult.status}|${pollResult.progress}|${pollResult.hasResults}`;
          if (key !== lastKey) {
            lastKey = key;
            broadcast(pollResult.status, pollResult.progress, pollResult.hasResults);
          }
          const terminal =
            pollResult.hasResults ||
            /complete|done|succeed|fail|error/i.test(pollResult.status);
          if (terminal || Date.now() - startedAt > 10 * 60_000) {
            nodePollRef.current.delete(jobId);
            setNodeJobBusy((prev) => prev.filter((j) => j !== jobId));
            return;
          }
          nodePollRef.current.set(jobId, setTimeout(poll, 2000));
        };
        nodePollRef.current.set(jobId, setTimeout(poll, 500));
      })();
    },
    [args.nodeUrl, userId]
  );

  useEffect(() => {
    const polls = nodePollRef.current;
    return () => {
      polls.forEach((t) => clearTimeout(t));
      polls.clear();
      runningRef.current.forEach((h) => h.cancel());
      runningRef.current.clear();
    };
  }, []);

  return { joinJob, startRoomFold, runNodeJob, nodeJobBusy };
}
