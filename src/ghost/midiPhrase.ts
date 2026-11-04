/**
 * MIDI Phrase Seam (Slice 68) — the door Terrell's MIDI packs
 * walk through.
 *
 * Terrell holds thousands of MIDI files and offered them as
 * model material (Nov 4, 2026). This module is the seam they
 * land in:
 *
 *   - LOCATION: packs live in `public/music-packs/` beside the
 *     protein structures' `public/structures/` convention, with
 *     an `INDEX.json` manifest ({ packs: [{ id, file, title,
 *     encoding?, sha256? }] }) — the same manifest shape the
 *     structures use. A pack file comes in two forms: the raw
 *     `.mid`, or base64 TEXT — an entry carrying
 *     `"encoding": "base64"` names a `.b64` text file whose
 *     decoded bytes ARE the `.mid`. The repo's write path is
 *     text-only (the Trauma GLB transport, Slice 26), so the
 *     one bundled phrase ships encoded; a raw `.mid` placed by
 *     a binary-capable route loads exactly the same way.
 *     Either way, dropping the file in and adding one INDEX
 *     line is the whole integration for a new pack.
 *   - PARSE: parseMidiPhrase below is a small dependency-free
 *     Standard MIDI File reader. It extracts the melodic line
 *     (the busiest channel's notes, in order) plus the file's
 *     tempo when one is declared.
 *   - USE: the parsed notes are handed to GhostPeer as a SEED
 *     (setMusicPackNotes). The brain may quote the seed's
 *     contour — transposed into the human's chosen scale — and
 *     vary onward in its own temperament. A pack never plays
 *     itself, and nothing here claims Terrell's library is
 *     integrated: exactly ONE small test phrase ships in the
 *     folder today so the path is real end-to-end.
 *
 * Pure and Tone-free, so the music check can drive it
 * headlessly against the bundled test pack's real bytes.
 *
 * Powered by Nirvana
 */

export interface MidiPhraseSeed {
  /** MIDI note numbers of the melodic line, in play order. */
  notes: number[];
  /** The file's declared tempo, when it carries one. */
  bpm: number | null;
}

export const MUSIC_PACKS_INDEX_PATH = "/music-packs/INDEX.json";

/**
 * Parse a Standard MIDI File's bytes into a phrase seed, or
 * null when the bytes are not a readable SMF (or carry no
 * notes). Handles formats 0/1, PPQ timing, running status,
 * note on/off pairing and the tempo meta event. SMPTE-timed
 * files and exotic chunk layouts return null rather than a
 * guess — a seed the brain quotes must be read honestly.
 */
export function parseMidiPhrase(bytes: ArrayBuffer | Uint8Array): MidiPhraseSeed | null {
  try {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const tag = (off: number): string =>
      String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
    if (buf.byteLength < 14 || tag(0) !== "MThd") return null;
    const headerLen = view.getUint32(4);
    const ntrks = view.getUint16(10);
    const division = view.getUint16(12);
    if (division & 0x8000) return null; // SMPTE timing — not read here.
    let offset = 8 + headerLen;

    let bpm: number | null = null;
    const byChannel = new Map<number, number[]>();

    const readVlq = (pos: number): { value: number; next: number } => {
      let value = 0;
      let p = pos;
      for (let i = 0; i < 5 && p < buf.byteLength; i++) {
        const b = buf[p++];
        value = (value << 7) | (b & 0x7f);
        if ((b & 0x80) === 0) break;
      }
      return { value, next: p };
    };

    for (let track = 0; track < ntrks; track++) {
      if (offset + 8 > buf.byteLength || tag(offset) !== "MTrk") break;
      const trackLen = view.getUint32(offset + 4);
      const trackEnd = Math.min(buf.byteLength, offset + 8 + trackLen);
      let p = offset + 8;
      let runningStatus = 0;
      const open = new Map<string, number>();
      const channelNotes = new Map<number, { note: number; tick: number }[]>();
      let tick = 0;
      while (p < trackEnd) {
        const delta = readVlq(p);
        tick += delta.value;
        p = delta.next;
        if (p >= trackEnd) break;
        let status = buf[p];
        if (status < 0x80) {
          status = runningStatus;
        } else {
          p++;
          if (status < 0xf0) runningStatus = status;
        }
        if (status === 0xff) {
          // Meta event.
          if (p >= trackEnd) break;
          const type = buf[p++];
          const len = readVlq(p);
          p = len.next;
          if (type === 0x51 && len.value === 3 && p + 3 <= trackEnd) {
            const micros = (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2];
            if (micros > 0 && bpm === null) {
              bpm = Math.round(60_000_000 / micros);
            }
          }
          p += len.value;
          continue;
        }
        if (status === 0xf0 || status === 0xf7) {
          const len = readVlq(p);
          p = len.next + len.value;
          continue;
        }
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const dataLen = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
        if (p + dataLen > trackEnd) break;
        const d1 = buf[p];
        const d2 = dataLen === 2 ? buf[p + 1] : 0;
        p += dataLen;
        if (kind === 0x90 && d2 > 0) {
          open.set(`${channel}:${d1}`, tick);
          if (!channelNotes.has(channel)) channelNotes.set(channel, []);
          channelNotes.get(channel)!.push({ note: d1, tick });
        } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
          open.delete(`${channel}:${d1}`);
        }
      }
      for (const [channel, list] of channelNotes) {
        list.sort((a, b) => a.tick - b.tick);
        const existing = byChannel.get(channel) ?? [];
        byChannel.set(channel, existing.concat(list.map((n) => n.note)));
      }
      offset = trackEnd;
    }

    // The melodic line: the channel carrying the most notes.
    let melody: number[] = [];
    for (const list of byChannel.values()) {
      if (list.length > melody.length) melody = list;
    }
    if (melody.length === 0) return null;
    return { notes: melody.slice(0, 64), bpm };
  } catch {
    return null;
  }
}

/**
 * Base64 text → bytes: the transport decode, in the Trauma
 * transport's shape but kept local so this module stays pure
 * and headlessly drivable. Whitespace is stripped first (the
 * transport text may be wrapped), then atob does the work.
 * Corrupt input throws from atob — the one fetching caller
 * below turns every failure into null, so a bad transport
 * reads as "no seed", never a guessed one.
 */
export function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Load the bundled packs' first seed phrase through the seam:
 * INDEX.json names the packs; the first one's bytes — fetched
 * raw, or decoded from its base64 text transport when the
 * INDEX entry carries `"encoding": "base64"` — parse into the
 * seed through the SAME parser either way. Best-effort by
 * design — any failure returns null and the brain simply
 * authors without a quote.
 */
export async function fetchFirstMusicPackSeed(
  fetchImpl: typeof fetch = fetch
): Promise<MidiPhraseSeed | null> {
  try {
    const indexRes = await fetchImpl(MUSIC_PACKS_INDEX_PATH);
    if (!indexRes.ok) return null;
    const index = (await indexRes.json()) as {
      packs?: { id?: string; file?: string; encoding?: string }[];
    };
    const first = index.packs?.find((p) => typeof p.file === "string");
    if (!first?.file) return null;
    const fileRes = await fetchImpl(`/music-packs/${first.file}`);
    if (!fileRes.ok) return null;
    if (first.encoding === "base64") {
      return parseMidiPhrase(decodeBase64ToBytes(await fileRes.text()));
    }
    return parseMidiPhrase(await fileRes.arrayBuffer());
  } catch {
    return null;
  }
}
