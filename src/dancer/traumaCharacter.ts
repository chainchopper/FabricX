/**
 * traumaCharacter — Trauma, the built-in stage character.
 *
 * Terrell's Mixamo character ships WITH the stage: each GLB is the
 * full skinned character AND one looping idle clip in a single
 * file (clip "mixamo.com" — MMA idle ~5.0 s, Bouncing Fight
 * ~2.97 s; bones resolve through mixamoBones.ts). Picking an idle
 * in THIS LAYER binds that file into the character slot
 * (stageCharacter store) on the local rig; the rig loops the clip
 * as the body's base layer and the DancerDriver's note-band
 * impulses compose additively over it.
 *
 * ASSET ROUTE — read before wondering where the bytes live: the
 * GLBs are ~5 MB of BINARY each, so they are never bundled, never
 * inlined, and never pass through Metro. They are same-origin
 * static files, lazy-loaded by URL the first time the stage binds
 * them:
 *
 *   public/animations/trauma-mma-idle.glb
 *   public/animations/trauma-bouncing-fight-idles.glb
 *
 * served at the URLs below (public/ is copied to the web root,
 * the same route the soundfont packs take). The single config
 * constant CHARACTER_ASSET_BASE_URL is the one place the location
 * lives — move the files (CDN, another folder) by changing it.
 *
 * TRANSPORT (Slice 26): the repo's write path is TEXT-ONLY (no
 * binary commits, no release assets), so the GLBs actually in
 * the repo ride as base64 TEXT: each `.glb` ships as sequential
 * ≤900 KB parts `….glb.b64.00`, `.01`, … next to where the raw
 * file would live (a single `….glb.b64` file is also accepted).
 * Built-in binds resolve bytes in this order (see
 * loadBuiltinCharacterGltf below):
 *
 *   1. the raw .glb URL — a real binary upload always wins;
 *   2. the base64 transport — parts fetched in order,
 *      concatenated, decoded in the browser, handed to
 *      GLTFLoader.parseAsync.
 *
 * Either way the bytes move only when the stage binds Trauma.
 * Until decodable bytes are in place the bind simply reports
 * "failed" and the mannequin keeps the stage, like any bad
 * character file. public/animations/README.md documents both
 * forms and how to regenerate the parts.
 */

import type { GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type TraumaIdleId = "mma" | "bouncing";

export interface TraumaIdleDef {
  id: TraumaIdleId;
  /** Pill label in THIS LAYER. */
  label: string;
  /** Slot display name (menu status line, load reporting). */
  characterName: string;
  /** Same-origin URL the rig lazy-loads. */
  url: string;
}

/** The ONE config constant for built-in character asset location. */
export const CHARACTER_ASSET_BASE_URL = "/animations";

export const TRAUMA_IDLES: readonly TraumaIdleDef[] = [
  {
    id: "mma",
    label: "MMA idle",
    characterName: "Trauma — MMA idle",
    url: `${CHARACTER_ASSET_BASE_URL}/trauma-mma-idle.glb`,
  },
  {
    id: "bouncing",
    label: "Bouncing fight",
    characterName: "Trauma — Bouncing fight idles",
    url: `${CHARACTER_ASSET_BASE_URL}/trauma-bouncing-fight-idles.glb`,
  },
];

/** The idle a fresh stage pick starts from (Terrell: default MMA). */
export const DEFAULT_TRAUMA_IDLE_ID: TraumaIdleId = "mma";

/**
 * Coerce a stored `specific.stageTraumaIdle` value (or anything)
 * to a catalog entry: the matching idle, or the default when the
 * value is unset/unknown — the layer setting only ever holds ids
 * from this catalog, and anything else reads as "not picked yet"
 * at the call sites that care (they check for a string first).
 */
export function traumaIdleDef(value: unknown): TraumaIdleDef {
  const found = TRAUMA_IDLES.find((d) => d.id === value);
  return found ?? TRAUMA_IDLES.find((d) => d.id === DEFAULT_TRAUMA_IDLE_ID)!;
}

/**
 * The explicit "no built-in character" pick: THIS LAYER stores
 * this string in `specific.stageTraumaIdle` when the user chooses
 * the bare figure (Restore mannequin). It is a real stored value,
 * distinct from the setting being UNSET — unset means "no choice
 * made yet", and the stage's default (below) applies instead.
 * Before Slice 37, Restore mannequin and Load character both
 * cleared the setting to undefined, so "never picked", "picked my
 * own file" and "wants the bare figure" were indistinguishable —
 * and the stage read all three as "bind nothing".
 */
export const TRAUMA_IDLE_NONE = "none";

/**
 * Resolve a stored `specific.stageTraumaIdle` value to the
 * built-in the stage binds on mount (Slice 37):
 *   - "none"       -> null (explicit bare figure; never bind)
 *   - a catalog id -> that idle's def
 *   - unset/other  -> the DEFAULT idle (Trauma, MMA). Terrell,
 *     Nov 1: Trauma is the stage's resident character — he asked
 *     for "my gltf guy" twice while the unset gate kept the
 *     marshmallow man on stage. The mannequin is the FALLBACK
 *     (a failed bind, an explicit "none"), never the default.
 */
export function resolveBuiltinBind(value: unknown): TraumaIdleDef | null {
  if (value === TRAUMA_IDLE_NONE) return null;
  return traumaIdleDef(value);
}

// ---------------------------------------------------------------------------
// Base64 transport (Slice 26): the built-in GLBs ride the repo as
// base64 text because the repo's write path cannot carry binaries.
// Resolution order for a built-in bind: raw .glb first (a real
// binary at the same URL always wins), then the encoded transport.
// ---------------------------------------------------------------------------

/**
 * Chunked base64 → ArrayBuffer. The transport text is ~7 MB of
 * base64 per character; a single atob() over a string that long
 * is exactly the kind of call that hits engine argument limits
 * and stalls the main thread, so decoding runs in 32,764-char
 * slices — a multiple of 4, so a slice boundary never splits a
 * base64 quantum (padding lives only in the final slice).
 * Whitespace (the parts are wrapped at 76 columns) is stripped
 * first. Corrupt input throws from atob, which the bind path
 * reports as a plain failed load.
 */
export function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s+/g, "");
  const CHUNK = 32764;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const bin = atob(clean.slice(i, i + CHUNK));
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    parts.push(bytes);
    total += bytes.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
}

/**
 * Fetch one transport candidate's text, or null when it isn't
 * there. A missing static path on the SPA host answers 200 with
 * the app's index.html — HTML is not transport data, so anything
 * that looks like markup counts as absent.
 */
async function fetchTransportText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trimStart().startsWith("<")) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Resolve a built-in character's bytes from its base64 transport:
 * a single `${url}.b64` when present, else sequential parts
 * `${url}.b64.00`, `.01`, … fetched in order until one is absent,
 * concatenated. The decoded bytes must carry the binary GLB
 * magic ("glTF") — anything else is a failed load, never a parse
 * surprise downstream. Throws on every failure mode; the caller
 * (the rig's bind) already turns throws into "failed".
 */
export async function fetchBase64Transport(url: string): Promise<ArrayBuffer> {
  let text = await fetchTransportText(`${url}.b64`);
  if (text === null) {
    const parts: string[] = [];
    // The real assets ship 8 parts each; the cap only guards
    // against a host that answers every path with junk.
    for (let i = 0; i < 100; i++) {
      const part = await fetchTransportText(
        `${url}.b64.${String(i).padStart(2, "0")}`
      );
      if (part === null) break;
      parts.push(part);
    }
    if (parts.length === 0) {
      throw new Error(`traumaCharacter: no base64 transport for ${url}`);
    }
    text = parts.join("");
  }
  const buffer = decodeBase64ToArrayBuffer(text);
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isGlb =
    head.length === 4 &&
    head[0] === 0x67 && // g
    head[1] === 0x6c && // l
    head[2] === 0x54 && // T
    head[3] === 0x46; // F
  if (!isGlb) {
    throw new Error(`traumaCharacter: transport for ${url} is not a GLB`);
  }
  return buffer;
}

/**
 * Load a BUILT-IN character (Trauma) for the rig's bind: try the
 * raw .glb URL first — if a real binary ever lands at that path
 * it takes precedence and the transport is never touched — and
 * on any failure fall back to the base64 transport, decoded and
 * parsed in memory. Picked files and remote URLs do NOT come
 * through here; the rig keeps loading those with plain
 * GLTFLoader.loadAsync, untouched.
 */
export async function loadBuiltinCharacterGltf(
  loader: GLTFLoader,
  url: string
): Promise<GLTF> {
  try {
    return await loader.loadAsync(url);
  } catch {
    // No usable raw .glb at that URL — try the encoded transport.
  }
  const buffer = await fetchBase64Transport(url);
  return loader.parseAsync(buffer, "");
}
