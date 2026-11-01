/**
 * nodeBridge — Fabric's client of a real GenX node-controller
 * (Slice 36, G3).
 *
 * The bridge is a CLIENT of GenX, nothing more: it polls the
 * node's documented REST surface (node-controller/api/server.js:
 * GET /health, GET /fah/stats, GET /tasks/status, GET /telemetry,
 * POST /jobs/submit, GET /jobs/:provider/:jobId/status,
 * GET /jobs/:provider/:jobId/results) and sanitizes whatever
 * comes back into a GenxNodeReading. It never invents a reading:
 * a node that does not answer produces an unreachable reading,
 * and a FAHClient that does not answer its telnet port produces
 * the node's own OFFLINE — stated, never smoothed over.
 *
 * Telemetry honesty: GenX's shipped collectTelemetry() is
 * synthetic upstream (random load, hardcoded memory — see the
 * fabric spec §1.5). The bridge therefore carries the CPU load
 * as `cpuLoadReported`, and the UI labels it "node-reported"
 * wherever it appears. FAH status and allocator counts are the
 * node's real probes of real processes and are stated plainly.
 *
 * Risk R1 (PNA/CORS): the node's shipped CORS allows only
 * localhost:3000 origins (+ a dead post-routes middleware), so
 * this page's origin is NOT allowed as shipped, and Chrome's
 * Private Network Access rules may block LAN addresses outright.
 * probeNode distinguishes the three truths — reachable (readable
 * answer), blocked (the server answers an opaque probe but the
 * browser won't let this page read it), offline (nothing
 * answers) — and THIS LAYER settings surfaces the verdict. The
 * bridge fails soft in all cases: no throw ever reaches the layer.
 *
 * Powered by Nirvana
 */

import { sanitizeNodeReading } from "./fieldState";
import type {
  GenxNodeReading,
  GenxProbeStatus,
} from "./genxTypes";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 2500;

/** Clamp a user-typed node address to a base URL, or null. */
export function sanitizeNodeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim().slice(0, 200);
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  try {
    const u = new URL(text);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  fetchImpl: FetchLike,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<unknown> {
  const ctrl =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl
    ? setTimeout(() => ctrl.abort(), timeoutMs)
    : null;
  try {
    const res = await fetchImpl(url, {
      ...init,
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* The probe (settings surface — reachable / blocked / offline)        */
/* ------------------------------------------------------------------ */

export async function probeNode(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<GenxProbeStatus> {
  const at = Date.now();
  try {
    const health = (await fetchJson(`${baseUrl}/health`, fetchImpl)) as {
      status?: unknown;
    } | null;
    if (health && typeof health === "object") {
      return {
        state: "reachable",
        url: baseUrl,
        at,
        detail: "The node answered /health and this browser may read it.",
      };
    }
    throw new Error("empty health body");
  } catch {
    // The readable path failed. Is anything there at all? An
    // opaque (no-cors) probe resolves if a server answers, even
    // when CORS/PNA forbids reading the response — that is the
    // blocked case, a different fact from a dead address.
    try {
      await fetchImpl(`${baseUrl}/health`, { mode: "no-cors" });
      return {
        state: "blocked",
        url: baseUrl,
        at,
        detail:
          "A server answers at that address, but this browser will not let the page read it (CORS / Private Network Access). The node's shipped CORS allows only localhost:3000 — widening it for this origin is a GenX-side change.",
      };
    } catch {
      return {
        state: "offline",
        url: baseUrl,
        at,
        detail:
          "Nothing answered. Is the node-controller running (node start-node.js in node-controller/) at that address?",
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Readings                                                            */
/* ------------------------------------------------------------------ */

function offlineReading(label: string): GenxNodeReading {
  return {
    label,
    at: Date.now(),
    reachable: false,
    fahStatus: "UNKNOWN",
    fahPointsPerDay: 0,
    fahSlots: [],
    nodes: 0,
    queuedTasks: 0,
    activeTasks: 0,
    providersInstalled: [],
    cpuLoadReported: null,
  };
}

/**
 * Take one full reading. Never throws: any failure along the way
 * yields the honest partial (or the unreachable reading).
 */
export async function fetchNodeReading(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<GenxNodeReading> {
  let label = baseUrl;
  try {
    label = new URL(baseUrl).host;
  } catch {
    /* keep the raw string */
  }
  let health: Record<string, unknown>;
  try {
    health = (await fetchJson(`${baseUrl}/health`, fetchImpl)) as Record<
      string,
      unknown
    >;
    if (!health || typeof health !== "object") throw new Error("bad health");
  } catch {
    return offlineReading(label);
  }
  const providersInstalled: string[] = [];
  const providers = health.providers as Record<string, unknown> | undefined;
  if (providers && typeof providers === "object") {
    for (const [name, info] of Object.entries(providers)) {
      if (
        info &&
        typeof info === "object" &&
        (info as Record<string, unknown>).installed === true
      ) {
        providersInstalled.push(name);
      }
    }
  }
  const [fah, tasks, telemetry] = await Promise.all([
    fetchJson(`${baseUrl}/fah/stats`, fetchImpl).catch(() => null),
    fetchJson(`${baseUrl}/tasks/status`, fetchImpl).catch(() => null),
    fetchJson(`${baseUrl}/telemetry`, fetchImpl).catch(() => null),
  ]);
  const fahRec = (fah ?? {}) as Record<string, unknown>;
  const tasksRec = (tasks ?? {}) as Record<string, unknown>;
  const telRec = (telemetry ?? {}) as Record<string, unknown>;
  const cpu = telRec.cpu as Record<string, unknown> | undefined;
  const raw = {
    label,
    at: Date.now(),
    reachable: true,
    fahStatus: typeof fahRec.status === "string" ? fahRec.status : "UNKNOWN",
    fahPointsPerDay:
      typeof fahRec.pointsPerDay === "number" ? fahRec.pointsPerDay : 0,
    fahSlots: Array.isArray(fahRec.slots) ? fahRec.slots : [],
    nodes: Array.isArray(tasksRec.nodes) ? tasksRec.nodes.length : 0,
    queuedTasks:
      typeof tasksRec.queuedTasks === "number" ? tasksRec.queuedTasks : 0,
    activeTasks:
      typeof tasksRec.activeTasks === "number" ? tasksRec.activeTasks : 0,
    providersInstalled,
    cpuLoadReported:
      cpu && typeof cpu.load === "number" ? cpu.load : null,
  };
  return sanitizeNodeReading(raw) ?? offlineReading(label);
}

/* ------------------------------------------------------------------ */
/* Jobs through the node's real API                                    */
/* ------------------------------------------------------------------ */

export interface NodeSubmitResult {
  ok: boolean;
  provider: string;
  jobId: string | null;
  status: string;
  error: string | null;
}

/**
 * Submit a job through POST /jobs/submit {framework, ...params}.
 * The response shape is the provider's own; the job id and
 * status are extracted when present and reported as absent when
 * they are not — a submit the node accepted without returning an
 * id is shown as exactly that, never dressed up with a local one.
 */
export async function submitNodeJob(
  baseUrl: string,
  framework: string,
  params: Record<string, string>,
  fetchImpl: FetchLike = fetch
): Promise<NodeSubmitResult> {
  try {
    const res = (await fetchJson(`${baseUrl}/jobs/submit`, fetchImpl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ framework, ...params }),
    })) as Record<string, unknown> | null;
    if (!res || typeof res !== "object") {
      return { ok: false, provider: framework, jobId: null, status: "", error: "empty response" };
    }
    const jobId =
      typeof res.jobId === "string" || typeof res.jobId === "number"
        ? String(res.jobId)
        : null;
    return {
      ok: true,
      provider: framework,
      jobId,
      status: typeof res.status === "string" ? res.status : "submitted",
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      provider: framework,
      jobId: null,
      status: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface NodeJobPoll {
  status: string;
  /** 0..1 when the provider reports progress (providers report percent; normalized here). */
  progress: number | null;
  hasResults: boolean;
}

/**
 * Poll GET /jobs/:provider/:jobId/status once, and — when the
 * provider's own status reads terminal — check the results
 * endpoint. Never throws; a failed poll reports status "unknown".
 */
export async function fetchNodeJobStatus(
  baseUrl: string,
  provider: string,
  jobId: string,
  fetchImpl: FetchLike = fetch
): Promise<NodeJobPoll> {
  try {
    const res = (await fetchJson(
      `${baseUrl}/jobs/${encodeURIComponent(provider)}/${encodeURIComponent(jobId)}/status`,
      fetchImpl
    )) as Record<string, unknown> | null;
    if (!res || typeof res !== "object") {
      return { status: "unknown", progress: null, hasResults: false };
    }
    const status = typeof res.status === "string" ? res.status : "unknown";
    let progress: number | null = null;
    if (typeof res.progress === "number" && Number.isFinite(res.progress)) {
      progress = res.progress > 1 ? res.progress / 100 : res.progress;
      progress = Math.min(1, Math.max(0, progress));
    }
    let hasResults = false;
    if (/complete|done|succeed|finished/i.test(status) || progress === 1) {
      try {
        const results = await fetchJson(
          `${baseUrl}/jobs/${encodeURIComponent(provider)}/${encodeURIComponent(jobId)}/results`,
          fetchImpl
        );
        hasResults = results !== null && typeof results === "object";
      } catch {
        hasResults = false;
      }
    }
    return { status, progress, hasResults };
  } catch {
    return { status: "unknown", progress: null, hasResults: false };
  }
}

/* ------------------------------------------------------------------ */
/* The bridge loop                                                     */
/* ------------------------------------------------------------------ */

export interface NodeBridge {
  stop: () => void;
}

const BRIDGE_POLL_MS = 2000;
const BRIDGE_OFFLINE_POLL_MS = 10_000;

/**
 * Poll a node and hand each reading to `onReading`. Online, the
 * cadence is the node's own telemetry cadence (2s); offline, the
 * bridge backs off and keeps quietly retrying (the SAM
 * availability pattern) — the layer hears about every change of
 * fortune through the readings themselves.
 */
export function createNodeBridge(args: {
  url: string;
  onReading: (reading: GenxNodeReading) => void;
  fetchImpl?: FetchLike;
}): NodeBridge {
  const fetchImpl = args.fetchImpl ?? fetch;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    if (stopped) return;
    const reading = await fetchNodeReading(args.url, fetchImpl);
    if (stopped) return;
    args.onReading(reading);
    timer = setTimeout(
      tick,
      reading.reachable ? BRIDGE_POLL_MS : BRIDGE_OFFLINE_POLL_MS
    );
  };
  void tick();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
