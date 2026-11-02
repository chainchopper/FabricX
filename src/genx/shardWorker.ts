/**
 * shardWorker — run one shard, for real (Slice 36).
 *
 * The compute runs the tile engine from lifeField.ts — in a Web
 * Worker when the platform offers one, assembled from the very
 * functions the allocator verifies with (buildShardWorkerSource
 * stringifies them, so worker and verifier share one text).
 * Because a bundled/minified build could in principle mangle
 * that assembly, the worker path is PROVEN before it is used,
 * every session: the worker first computes a fixed self-test
 * tile whose checksum this module computed directly; a mismatch
 * (or a throw, or a timeout) discards the worker and the shard
 * runs chunked on the main thread instead — the same pure
 * functions, the same result, a different chair. The returned
 * `via` says which chair ran, and the layer shows it: a fallback
 * is a fact, not a secret.
 *
 * Powered by Nirvana
 */

import {
  computeTile,
  createTileRun,
  countLive,
  deriveSeed,
  extractTile,
  fnv1aBytes,
  fnv1aStr,
  gridChecksum,
  mulberry32,
  seedField,
  stepField,
  tileSeedFor,
  type TileResult,
  type TileSpec,
} from "./lifeField";

/** Assemble the worker's source from the tile engine's own functions. */
export function buildShardWorkerSource(): string {
  const fns = [
    mulberry32,
    fnv1aStr,
    deriveSeed,
    seedField,
    stepField,
    countLive,
    fnv1aBytes,
    gridChecksum,
    tileSeedFor,
    extractTile,
    createTileRun,
  ].map((f) => f.toString());
  return [
    '"use strict";',
    "const FIELD_FILL = 0.27;",
    ...fns,
    `
self.onmessage = function (e) {
  try {
    var spec = e.data.spec;
    var run = createTileRun(spec);
    while (!run.done) {
      run.advance(400);
      self.postMessage({ type: "progress", progress: run.progress });
    }
    var r = run.result();
    self.postMessage({
      type: "result",
      checksum: r.checksum,
      liveCells: r.liveCells,
      renewals: r.renewals,
      generationsRun: r.generationsRun,
    });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
`,
  ].join("\n");
}

/** The fixed tile the worker must reproduce before it is trusted. */
export const WORKER_SELF_TEST_SPEC: TileSpec = {
  missionSeed: 0x5eed,
  fieldW: 48,
  fieldH: 32,
  shardId: 3,
  tileX: 24,
  tileY: 16,
  tileW: 24,
  tileH: 16,
  generations: 300,
};

export interface ShardRunResult extends TileResult {
  ms: number;
  via: "worker" | "main-thread";
}

export interface ShardRunHandle {
  promise: Promise<ShardRunResult>;
  cancel: () => void;
}

const CHUNK_GENERATIONS = 400;
const WORKER_TIMEOUT_MS = 30_000;

function runOnMainThread(
  spec: TileSpec,
  onProgress: (p: number) => void,
  isCancelled: () => boolean
): Promise<TileResult> {
  return new Promise((resolve, reject) => {
    const run = createTileRun(spec);
    const step = () => {
      if (isCancelled()) {
        reject(new Error("cancelled"));
        return;
      }
      run.advance(CHUNK_GENERATIONS);
      onProgress(run.progress);
      if (run.done) {
        resolve(run.result());
        return;
      }
      setTimeout(step, 0);
    };
    step();
  });
}

function runInWorker(
  spec: TileSpec,
  onProgress: (p: number) => void
): Promise<TileResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    let url: string;
    try {
      url = URL.createObjectURL(
        new Blob([buildShardWorkerSource()], { type: "text/javascript" })
      );
      worker = new Worker(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    let settled = false;
    let phase: "self-test" | "real" = "self-test";
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        worker.terminate();
      } catch {
        /* already gone */
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* already gone */
      }
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("worker timed out"))),
      WORKER_TIMEOUT_MS
    );
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "progress"; progress: number }
        | (TileResult & { type: "result" })
        | { type: "error"; message: string };
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "progress") {
        if (phase === "real") onProgress(msg.progress);
        return;
      }
      if (msg.type === "error") {
        finish(() => {
          clearTimeout(timer);
          reject(new Error(`worker error: ${msg.message}`));
        });
        return;
      }
      if (msg.type === "result") {
        if (phase === "self-test") {
          // The proof: the worker's own computation of the fixed
          // tile must match this module's direct computation.
          const expected = computeTile(WORKER_SELF_TEST_SPEC).checksum;
          if (msg.checksum !== expected) {
            finish(() => {
              clearTimeout(timer);
              reject(new Error("worker self-test checksum mismatch"));
            });
            return;
          }
          phase = "real";
          worker.postMessage({ spec });
          return;
        }
        finish(() => {
          clearTimeout(timer);
          resolve({
            checksum: msg.checksum,
            liveCells: msg.liveCells,
            renewals: msg.renewals,
            generationsRun: msg.generationsRun,
          });
        });
      }
    };
    worker.onerror = () => {
      finish(() => {
        clearTimeout(timer);
        reject(new Error("worker failed to start"));
      });
    };
    worker.postMessage({ spec: WORKER_SELF_TEST_SPEC });
  });
}

/**
 * Run one shard to completion. Worker first (proven by the
 * self-test), main thread as the honest fallback. Progress
 * callbacks fire at chunk boundaries on either path.
 */
export function runShard(
  spec: TileSpec,
  onProgress: (p: number) => void
): ShardRunHandle {
  let cancelled = false;
  const t0 = performance.now();
  const promise = (async (): Promise<ShardRunResult> => {
    const workerAvailable =
      typeof Worker !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof Blob !== "undefined";
    if (workerAvailable) {
      try {
        const r = await runInWorker(spec, onProgress);
        return { ...r, ms: performance.now() - t0, via: "worker" };
      } catch {
        // Fall through to the main-thread path — the result is
        // identical; only the chair differs, and `via` says so.
        if (cancelled) throw new Error("cancelled");
      }
    }
    const r = await runOnMainThread(spec, onProgress, () => cancelled);
    return { ...r, ms: performance.now() - t0, via: "main-thread" };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}
