/**
 * samSegment — SAM 3.1 segmentation for the "See" layer (Slice 14).
 *
 * PROVEN CONTRACT (Oct 26 spike, fabric-spikes/sam-wonder-probe):
 * - Route: POST {endpoint}/responses (chat/completions 404s for SAM).
 * - The request carries an input_image part plus an input_text part
 *   whose text is the BARE referring expression ("the performer").
 *   Instruction-style text ("Segment: …") returns an EMPTY message —
 *   this module never decorates the user's phrase.
 * - The reply's output_text carries box tags in a model coordinate
 *   space:  <|box;x1;y1;x2;y2;w=1600;h=1600|>
 *   plus encoded mask runs:  <|mask;…data…|>
 *   Concept phrases return EVERY instance ("the glowing phones" ->
 *   60 boxes on the concert key art). Zero billed tokens were
 *   reported on the spike calls.
 *
 * Boxes are the v0 deliverable. Masks: attemptDecodeMask below makes
 * one honest attempt at the encoded run; the spike payload is an
 * opaque encoded string with no parseable header (no dimensions, no
 * scheme marker), so the attempt returns null and boxes ship. The
 * raw mask's presence/length is still recorded per region so a
 * future decoder can pair masks to boxes by index.
 *
 * Privacy discipline (the layer's contract, enforced here):
 * - A frame is sent ONLY from segmentFrame(), which the UI calls
 *   from one explicit Segment tap. Nothing in this module polls,
 *   streams, or retries on a timer.
 * - The frame data URL lives in a local variable for the duration of
 *   the call and is never stored, logged, or attached anywhere else.
 * - The key comes from the user's own AI Services config (the Meta
 *   preset writes it to fabric_ai_config_v1's llm section — the same
 *   configured-model path the Slice 4 composer reads). No env vars,
 *   no hardcoded secrets.
 *
 * This module is framework-free (no React, no RN imports) so the
 * node contract check (scripts/sam-check.mjs) can exercise the real
 * parser against a fixture shaped like the spike's response.
 *
 * Powered by Nirvana
 */

export const SAM_MODEL = "sam-3.1";

/** Regions rendered/listed per segmentation — top by area. */
export const SAM_REGION_CAP = 24;

/** Referring-expression hygiene: bare phrase, bounded length. */
export const SAM_EXPRESSION_MAX = 80;

export interface SamConfig {
"apiKey": string;
  /** OpenAI-style base, e.g. "https://api.meta.ai/v1". */
  endpoint: string;
}

export interface SamBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Model coordinate space the box was reported in. */
  spaceW: number;
  spaceH: number;
}

export interface SamRegion {
  /** Stable within one segmentation result: "sam-<index>". */
  id: string;
  /** The bare referring expression that produced this region. */
  expression: string;
  /** 0-based position in the area-sorted, capped list. */
  index: number;
  /** Tray label: "<expression> #<index+1>". */
  label: string;
  /** Normalized 0..1 box (x,y = top-left). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Normalized area (w*h) — the sort/cap key. */
  area: number;
  /** A mask run was returned at this box's index (undecoded in v0). */
  hasMask: boolean;
  /** Character length of the paired mask run, if any. */
  maskChars?: number;
}

// ---------------------------------------------------------------------------
// Expression hygiene
// ---------------------------------------------------------------------------

/**
 * Normalize a referring expression WITHOUT turning it into an
 * instruction: SAM's contract is the bare phrase. We trim, collapse
 * whitespace, and cap length — nothing is prepended or appended.
 * Returns null for empty/unsendable input.
 */
export function normalizeExpression(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ").slice(0, SAM_EXPRESSION_MAX);
  return text.length >= 2 ? text : null;
}

// ---------------------------------------------------------------------------
// Response parsing — boxes (deliverable) + masks (recorded, decode attempted)
// ---------------------------------------------------------------------------

const BOX_RE = /<\|box;([^|]+)\|>/g;
const MASK_RE = /<\|mask;([^|]+)\|>/g;

function parseBoxBody(body: string): SamBox | null {
  // "x1;y1;x2;y2;w=1600;h=1600" — w/h may be absent (default 1000,
  // the normalized space several SAM exports use).
  const parts = body.split(";").map((p) => p.trim());
  if (parts.length < 4) return null;
  const nums = parts.slice(0, 4).map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  let spaceW = 1000;
  let spaceH = 1000;
  for (const part of parts.slice(4)) {
    const m = /^([wh])=(\d+(?:\.\d+)?)$/.exec(part);
    if (m) {
      if (m[1] === "w") spaceW = Number(m[2]);
      else spaceH = Number(m[2]);
    }
  }
  if (spaceW <= 0 || spaceH <= 0) return null;
  const [x1, y1, x2, y2] = nums;
  if (x2 <= x1 || y2 <= y1) return null;
  return { x1, y1, x2, y2, spaceW, spaceH };
}

/** Extract every box tag from a blob of SAM output_text. */
export function parseBoxTags(text: string): SamBox[] {
  if (!text) return [];
  const boxes: SamBox[] = [];
  for (const match of text.matchAll(BOX_RE)) {
    const box = parseBoxBody(match[1]);
    if (box) boxes.push(box);
  }
  return boxes;
}

/** Extract the raw encoded mask runs (strings) in order. */
export function parseMaskTags(text: string): string[] {
  if (!text) return [];
  const masks: string[] = [];
  for (const match of text.matchAll(MASK_RE)) {
    masks.push(match[1]);
  }
  return masks;
}

/**
 * One honest attempt at decoding a spike-format mask run.
 *
 * Recognized-and-decoded formats would return polygon points in the
 * box's coordinate space. The spike payload is a long opaque encoded
 * string: no JSON structure, no "w;h" header, no scheme prefix — it
 * is the model's compressed run-length encoding, whose bit layout is
 * not documented in anything the spike captured. Guessing a layout
 * would produce WRONG silhouettes, which is worse than honest boxes,
 * so unrecognized encodings return null and the caller ships boxes.
 */
export function attemptDecodeMask(
  raw: string
): { points: Array<{ x: number; y: number }> } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // A JSON polygon would be decodable — accept it if it ever appears.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed as { points?: unknown }).points;
      if (Array.isArray(arr) && arr.length >= 3) {
        const points = arr
          .map((p) => {
            const pt = p as { x?: unknown; y?: unknown };
            return typeof pt.x === "number" && typeof pt.y === "number"
              ? { x: pt.x, y: pt.y }
              : null;
          })
          .filter((p): p is { x: number; y: number } => p !== null);
        if (points.length >= 3) return { points };
      }
    } catch {
      // Not JSON — fall through to the honest null.
    }
  }
  return null;
}

/** Concatenate output_text from a /v1/responses payload (defensive). */
export function extractSamText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as Record<string, unknown>;
  const chunks: string[] = [];
  const output = obj.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as Record<string, unknown>)?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const p = part as Record<string, unknown>;
        if (p?.type === "output_text" && typeof p.text === "string") {
          chunks.push(p.text);
        }
      }
    }
  }
  if (chunks.length) return chunks.join("\n");
  // Defensive: an OpenAI-shaped fallback if a proxy ever translates.
  const choices = obj.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

export interface SamParseResult {
  boxes: SamBox[];
  masks: string[];
  text: string;
}

export function parseSamResponse(raw: unknown): SamParseResult {
  const text = extractSamText(raw);
  return { boxes: parseBoxTags(text), masks: parseMaskTags(text), text };
}

// ---------------------------------------------------------------------------
// Boxes -> region objects (the world model's OBJECTS on a layer)
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Normalize boxes into region objects: clamp to the frame, drop
 * degenerate slivers, sort by area descending, cap at SAM_REGION_CAP,
 * pair masks by index (presence only in v0 — see attemptDecodeMask).
 */
export function boxesToRegions(
  boxes: SamBox[],
  expression: string,
  masks: string[] = [],
  cap: number = SAM_REGION_CAP
): SamRegion[] {
  const normalized = boxes
    .map((b, i) => {
      const x = clamp01(b.x1 / b.spaceW);
      const y = clamp01(b.y1 / b.spaceH);
      const x2 = clamp01(b.x2 / b.spaceW);
      const y2 = clamp01(b.y2 / b.spaceH);
      const w = x2 - x;
      const h = y2 - y;
      return { x, y, w, h, area: w * h, mask: masks[i] };
    })
    .filter((r) => r.w >= 0.005 && r.h >= 0.005)
    .sort((a, b) => b.area - a.area)
    .slice(0, Math.max(0, cap));
  return normalized.map((r, index) => ({
    id: `sam-${index}`,
    expression,
    index,
    label: `${expression} #${index + 1}`,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    area: r.area,
    hasMask: typeof r.mask === "string" && r.mask.length > 0,
    maskChars: typeof r.mask === "string" ? r.mask.length : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Request — the proven /v1/responses shape
// ---------------------------------------------------------------------------

export function buildSamRequestBody(expression: string, imageDataUrl: string) {
  return {
    model: SAM_MODEL,
    input: [
      {
        role: "user",
        content: [
          // BARE referring expression — instruction text returns
          // empty messages (spike, round one). Do not decorate.
          { type: "input_text", text: expression },
          { type: "input_image", image_url: imageDataUrl },
        ],
      },
    ],
  };
}

export class SamError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SamError";
    this.status = status;
  }
}

type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

/**
 * Segment ONE frame for ONE expression. Called only from the UI's
 * explicit Segment action. The frame is a local data URL passed in
 * by the caller; it is sent in this request body and nowhere else,
 * and this module keeps no copy after the call settles.
 */
export async function segmentFrame(
  config: SamConfig,
  expressionRaw: string,
  imageDataUrl: string,
  fetchFn: FetchFn = fetch as unknown as FetchFn
): Promise<SamRegion[]> {
  const expression = normalizeExpression(expressionRaw);
  if (!expression) {
    throw new SamError("Type what to look for first — a bare phrase like “the performer”.");
  }
  if (!config.apiKey) {
    throw new SamError("No Meta Model API key is saved in AI Services.");
  }
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    throw new SamError("No camera frame to segment yet.");
  }
  const base = (config.endpoint || "https://api.meta.ai/v1").replace(/\/+$/, "");
  let response: Awaited<ReturnType<FetchFn>>;
  try {
    response = await fetchFn(`${base}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(buildSamRequestBody(expression, imageDataUrl)),
    });
  } catch (err) {
    throw new SamError(
      `SAM request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 240);
    } catch {
      // Body unreadable — the status alone still tells the story.
    }
    throw new SamError(
      `SAM returned ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status
    );
  }
  const raw = await response.json();
  const { boxes, masks } = parseSamResponse(raw);
  return boxesToRegions(boxes, expression, masks);
}
