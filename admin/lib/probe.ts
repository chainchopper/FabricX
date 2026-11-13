import { PROBE_FRAME_DATA_URL } from "./probe-frame";

// Health probes (spec §4.3): a probe is the cheapest REAL inference the
// endpoint supports, in the ASSIGNED ROUTE'S shape — never a TCP connect,
// never a /models call standing in for inference. A chat-shaped probe may
// never stand in for a segmentation assignment.

export type ErrorClass =
  | "ok"
  | "auth"
  | "blocked_or_quota"
  | "not_found"
  | "timeout"
  | "down"
  | "slow"
  | "bad_response";

export interface ProbeResult {
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  errorClass: ErrorClass;
  detail: string;
}

const SLOW_MS = 5000;
const BLOCKED_BODY =
  /block|suspend|quota|rate.?limit|exceeded|insufficient|account.*disabled|disabled.*account/i;

export interface ProbeTarget {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  providerKind: string;
  timeoutMs: number;
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

async function doFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ res: Response; text: string; latencyMs: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    return { res, text, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function classifyHttp(
  status: number,
  bodyText: string,
  latencyMs: number,
  parseOk: boolean
): ProbeResult {
  if (status !== 200 && BLOCKED_BODY.test(bodyText)) {
    return {
      ok: false,
      httpStatus: status,
      latencyMs,
      errorClass: "blocked_or_quota",
      detail: `HTTP ${status} with block/quota indication in body`,
    };
  }
  if (status === 401) {
    return { ok: false, httpStatus: status, latencyMs, errorClass: "auth", detail: "HTTP 401 — credential rejected" };
  }
  if (status === 403) {
    return { ok: false, httpStatus: status, latencyMs, errorClass: "auth", detail: "HTTP 403 — forbidden (no block/quota indication in body)" };
  }
  if (status === 429) {
    return { ok: false, httpStatus: status, latencyMs, errorClass: "blocked_or_quota", detail: "HTTP 429 — rate limited / quota" };
  }
  if (status === 404) {
    return { ok: false, httpStatus: status, latencyMs, errorClass: "not_found", detail: "HTTP 404 — model or path not found" };
  }
  if (status === 200) {
    if (!parseOk) {
      return { ok: false, httpStatus: status, latencyMs, errorClass: "bad_response", detail: "HTTP 200 but body is not a parseable result in the route's shape" };
    }
    if (latencyMs > SLOW_MS) {
      return { ok: false, httpStatus: status, latencyMs, errorClass: "slow", detail: `inference succeeded but took ${latencyMs}ms (> ${SLOW_MS}ms)` };
    }
    return { ok: true, httpStatus: status, latencyMs, errorClass: "ok", detail: "real inference succeeded" };
  }
  return {
    ok: false,
    httpStatus: status,
    latencyMs,
    errorClass: "bad_response",
    detail: `HTTP ${status}: ${bodyText.slice(0, 160)}`,
  };
}

function classifyError(e: unknown, timeoutMs: number): ProbeResult {
  const err = e as Error & { cause?: { code?: string } };
  const name = err.name ?? "";
  const code = err.cause?.code ?? "";
  if (name === "AbortError" || code === "ABORT_ERR") {
    return {
      ok: false,
      httpStatus: null,
      latencyMs: timeoutMs,
      errorClass: "timeout",
      detail: `no response within ${timeoutMs}ms`,
    };
  }
  // Connect/DNS/TLS failures: the endpoint is unreachable FROM THE ADMIN
  // HOST. The panel labels these "not checkable from here" where the URL is
  // LAN/tailnet (spec §4.3 reachability honesty) — never dressed up as a
  // provider verdict beyond what was observed.
  return {
    ok: false,
    httpStatus: null,
    latencyMs: null,
    errorClass: "down",
    detail: `unreachable from admin host: ${err.message}${code ? ` (${code})` : ""}`,
  };
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Chat-shaped probe (§4.3 table), per provider kind. */
export async function probeChat(t: ProbeTarget): Promise<ProbeResult> {
  const timeout = Math.min(Math.max(t.timeoutMs || 10000, 1000), 15000);
  try {
    if (t.providerKind === "ollama") {
      const { res, text, latencyMs } = await doFetch(
        joinUrl(t.baseUrl, "/api/generate"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: t.model, prompt: "ok", stream: false }),
        },
        timeout
      );
      const json = parseJson(text);
      return classifyHttp(res.status, text, latencyMs, !!json && typeof json.response === "string");
    }
    if (t.providerKind === "anthropic") {
      const { res, text, latencyMs } = await doFetch(
        joinUrl(t.baseUrl, "/v1/messages"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": t.apiKey ?? "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: t.model,
            max_tokens: 4,
            messages: [{ role: "user", content: "Reply with: ok" }],
          }),
        },
        timeout
      );
      const json = parseJson(text);
      return classifyHttp(res.status, text, latencyMs, !!json && Array.isArray(json.content));
    }
    // openai_compatible | meta_model_api | fireworks | private
    const { res, text, latencyMs } = await doFetch(
      joinUrl(t.baseUrl, "/chat/completions"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(t.apiKey ? { authorization: `Bearer ${t.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: t.model,
          messages: [{ role: "user", content: "Reply with: ok" }],
          max_tokens: 4,
          temperature: 0,
        }),
      },
      timeout
    );
    const json = parseJson(text);
    const parseOk =
      !!json &&
      Array.isArray(json.choices) &&
      (json.choices as unknown[]).length > 0;
    return classifyHttp(res.status, text, latencyMs, parseOk);
  } catch (e) {
    return classifyError(e, timeout);
  }
}

/**
 * Segmentation-shaped probe (§4.3): one tiny fixed test image + one fixed
 * expression, through the endpoint's segmentation shape (SAM-style
 * /responses contract: input_image + input_text). Pass = HTTP 200 AND a
 * parseable mask/box result.
 */
export async function probeSegmentation(t: ProbeTarget): Promise<ProbeResult> {
  const timeout = Math.min(Math.max(t.timeoutMs || 10000, 1000), 15000);
  try {
    const { res, text, latencyMs } = await doFetch(
      joinUrl(t.baseUrl, "/responses"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(t.apiKey ? { authorization: `Bearer ${t.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: t.model,
          input_image: PROBE_FRAME_DATA_URL,
          input_text: "frame",
        }),
      },
      timeout
    );
    const json = parseJson(text);
    const parseOk =
      !!json &&
      ["output", "results", "masks", "boxes", "segments", "predictions"].some(
        (k) => k in json
      );
    return classifyHttp(res.status, text, latencyMs, parseOk);
  } catch (e) {
    return classifyError(e, timeout);
  }
}

/** Endpoint key resolution: env: reference wins, else the stored secret. */
export function resolveEndpointKey(endpoint: {
  credential_ref: string | null;
  api_key_secret: string | null;
}): string | null {
  if (endpoint.credential_ref?.startsWith("env:")) {
    return process.env[endpoint.credential_ref.slice(4)] ?? null;
  }
  return endpoint.api_key_secret ?? null;
}

export function endpointConfigured(endpoint: {
  credential_ref: string | null;
  api_key_secret: string | null;
}): boolean {
  if (endpoint.credential_ref?.startsWith("env:")) {
    return !!process.env[endpoint.credential_ref.slice(4)];
  }
  return !!endpoint.credential_ref || !!endpoint.api_key_secret;
}
