/**
 * structureWorker — run one structure shard, for real
 * (Slice 41).
 *
 * The exact discipline of shardWorker.ts, for residue ranges:
 * the compute runs structureEngine's run core — in a Web
 * Worker when the platform offers one, assembled from the very
 * functions the allocator verifies with (buildStructureWorker-
 * Source stringifies them, so worker and verifier share one
 * text). The worker path is PROVEN before it is used, every
 * session: the worker first relaxes a fixed self-test range
 * whose checksum this module computed directly; a mismatch (or
 * a throw, or a timeout) discards the worker and the shard
 * runs chunked on the main thread instead — the same pure
 * functions, the same result, a different chair. The returned
 * `via` says which chair ran.
 *
 * The inputs a worker receives (quantized start/target/
 * anchors, structureEngine.rangeInputs) are derived on the
 * host from the real parsed structure. A worker could compute
 * from anything it liked — it would not matter: the claim only
 * counts when the allocator re-derives the inputs itself and
 * its recompute matches (verifyStructureClaim).
 *
 * Powered by Nirvana
 */

import { fnv1aBytes } from "./lifeField";
import type { MolStructure } from "./molMath";
import {
  coordsChecksumInts,
  createRangeRun,
  createRelaxRun,
  rangeForShard,
  rangeInputs,
  type RangeRun,
} from "./structureEngine";
import type { GenxMissionSpec } from "./genxTypes";

export interface StructureRunInput {
  start: number[];
  target: number[];
  anchorBefore: [number, number, number] | null;
  anchorAfter: [number, number, number] | null;
  steps: number;
}

/** Assemble the worker's source from the run core's own functions. */
export function buildStructureWorkerSource(): string {
  const fns = [fnv1aBytes, coordsChecksumInts, createRelaxRun].map((f) =>
    f.toString()
  );
  return [
    '"use strict";',
    ...fns,
    `
self.onmessage = function (e) {
  try {
    var input = e.data.input;
    var run = createRelaxRun(
      input.start,
      input.target,
      input.anchorBefore,
      input.anchorAfter,
      input.steps
    );
    while (!run.done) {
      run.advance(48);
      self.postMessage({ type: "progress", progress: run.progress });
    }
    var r = run.result();
    self.postMessage({
      type: "result",
      checksum: r.checksum,
      residues: r.residues,
      stepsRun: r.stepsRun,
    });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
`,
  ].join("\n");
}

/** The fixed range the worker must reproduce before it is trusted. */
export const STRUCTURE_SELF_TEST_INPUT: StructureRunInput = {
  start: [0, 0, 0, 3800, 0, 0, 7600, 1000, 0, 11400, 500, -500],
  target: [100, 200, 300, 3900, 300, 200, 7500, 900, 100, 11200, 700, -300],
  anchorBefore: [-3700, 100, 0],
  anchorAfter: [15200, 0, 300],
  steps: 120,
};

export interface StructureRunResult {
  checksum: string;
  /** The range's residue count — Cα positions produced. */
  liveCells: number;
  stepsRun: number;
  ms: number;
  via: "worker" | "main-thread";
}

export interface StructureRunHandle {
  promise: Promise<StructureRunResult>;
  cancel: () => void;
}

const CHUNK_STEPS = 48;
const WORKER_TIMEOUT_MS = 30_000;

function runOnMainThread(
  run: RangeRun,
  onProgress: (p: number) => void,
  isCancelled: () => boolean
): Promise<{ checksum: string; residues: number; stepsRun: number }> {
  return new Promise((resolve, reject) => {
    const step = () => {
      if (isCancelled()) {
        reject(new Error("cancelled"));
        return;
      }
      run.advance(CHUNK_STEPS);
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
  input: StructureRunInput,
  onProgress: (p: number) => void
): Promise<{ checksum: string; residues: number; stepsRun: number }> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    let url: string;
    try {
      url = URL.createObjectURL(
        new Blob([buildStructureWorkerSource()], { type: "text/javascript" })
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
        | { type: "result"; checksum: string; residues: number; stepsRun: number }
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
          // The proof: the worker's own relaxation of the fixed
          // range must match this module's direct computation.
          const st = STRUCTURE_SELF_TEST_INPUT;
          const direct = createRelaxRun(
            st.start,
            st.target,
            st.anchorBefore,
            st.anchorAfter,
            st.steps
          );
          direct.advance(Number.MAX_SAFE_INTEGER);
          if (msg.checksum !== direct.result().checksum) {
            finish(() => {
              clearTimeout(timer);
              reject(new Error("worker self-test checksum mismatch"));
            });
            return;
          }
          phase = "real";
          worker.postMessage({ input });
          return;
        }
        finish(() => {
          clearTimeout(timer);
          resolve({
            checksum: msg.checksum,
            residues: msg.residues,
            stepsRun: msg.stepsRun,
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
    worker.postMessage({ input: STRUCTURE_SELF_TEST_INPUT });
  });
}

/**
 * Run one structure shard to completion. Worker first (proven
 * by the self-test), main thread as the honest fallback.
 * Progress callbacks fire at chunk boundaries on either path.
 * A shard that names no range in this structure rejects — the
 * claim never leaves, and the allocator's stall watch re-queues
 * the shard, exactly like a tile that failed locally.
 */
export function runStructureShard(
  spec: GenxMissionSpec,
  shardId: number,
  structure: MolStructure,
  onProgress: (p: number) => void
): StructureRunHandle {
  let cancelled = false;
  const t0 = performance.now();
  const promise = (async (): Promise<StructureRunResult> => {
    const range = spec.structure ? rangeForShard(spec, shardId) : null;
    const inputs = range ? rangeInputs(structure, range) : null;
    if (!spec.structure || !range || !inputs) {
      throw new Error("shard names no range in this structure");
    }
    const input: StructureRunInput = {
      start: inputs.start,
      target: inputs.target,
      anchorBefore: inputs.anchorBefore,
      anchorAfter: inputs.anchorAfter,
      steps: spec.structure.relaxSteps,
    };
    const workerAvailable =
      typeof Worker !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof Blob !== "undefined";
    if (workerAvailable) {
      try {
        const r = await runInWorker(input, onProgress);
        return {
          checksum: r.checksum,
          liveCells: r.residues,
          stepsRun: r.stepsRun,
          ms: performance.now() - t0,
          via: "worker",
        };
      } catch {
        // Fall through to the main-thread path — the result is
        // identical; only the chair differs, and `via` says so.
        if (cancelled) throw new Error("cancelled");
      }
    }
    const run = createRangeRun(structure, spec, shardId);
    if (!run) throw new Error("shard names no range in this structure");
    const r = await runOnMainThread(run, onProgress, () => cancelled);
    return {
      checksum: r.checksum,
      liveCells: r.residues,
      stepsRun: r.stepsRun,
      ms: performance.now() - t0,
      via: "main-thread",
    };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}
