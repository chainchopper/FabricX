/**
 * Wake word — Slice 58: how the ghostie's attention is got,
 * as a pure machine the headless check can drive.
 *
 * The wake phrase is the ghostie's NAME — persistent, chosen
 * by its person in settings, already the word the room uses
 * for it. No second wake phrase to invent or forget.
 *
 * There is no conversation here and nothing opens
 * (Terrell's correction, Nov 3): the ghostie makes no
 * words, and nothing about being heard is a chat. The
 * machine knows only whether the ghostie is ATTENDING:
 *
 *   idle      — finals are listened to and DISCARDED unless
 *               they carry the name. A match is a "wake": the
 *               ghostie perks up (its own body says so — see
 *               GhostPeer.expressAttention), and whatever was
 *               said around the name in that same breath
 *               ("{name}, show me your heartbeat") is handed
 *               over as the first ask, verbatim — the name
 *               itself is the only thing consumed.
 *
 *   attending — the ghostie has you. Every final is an ask
 *               for the ask path, exactly as spoken — no
 *               name per sentence, no command syntax, no
 *               tapping anything. Saying the name again just
 *               refreshes its attention (and a sentence said
 *               around the name is taken whole, name aside).
 *               Attention is a state of the ghostie, not a
 *               timed box: it relaxes only after a stretch
 *               of silence (ATTENTION_LAPSE_MS of no heard
 *               final), the way a person's does — plumbing
 *               that lives here and in the recognizer loop,
 *               never drawn, never worded, never a surface.
 *
 * Matching is on whole words, case- and punctuation-blind:
 * the name inside another word ("Boo" in "book") never
 * triggers, and a name with spaces ("Sir Bounce") matches as
 * a phrase. This module hears TEXT only — the recognizer
 * lifecycle lives in useWakeWord; what a heard final MEANS
 * lives here, where it can be proven.
 *
 * Powered by Nirvana
 */

/**
 * Silence (no heard final) after which attention relaxes.
 * Recognizer plumbing — not a product surface, never shown.
 */
export const ATTENTION_LAPSE_MS = 12_000;

interface Token {
  text: string;
  start: number;
  end: number;
}

const WORD_RE = /[\p{L}\p{N}']+/gu;

/** Word tokens of a raw transcript, with their raw spans. */
function tokenize(raw: string): Token[] {
  const out: Token[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(raw)) !== null) {
    out.push({
      text: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
    if (m[0].length === 0) WORD_RE.lastIndex += 1;
  }
  return out;
}

export interface WakeMatch {
  matched: boolean;
  /** What was said around the name, verbatim ("" when bare). */
  command: string;
}

/**
 * Find the wake phrase in a transcript as whole words.
 * The command is the words after the name; when the name
 * comes last ("show me your heartbeat, {name}") the words
 * before it are the command. Separators around the consumed
 * name are trimmed; the command's own words are untouched.
 */
export function matchWakePhrase(raw: string, phrase: string): WakeMatch {
  const nameTokens = tokenize(phrase ?? "").map((t) => t.text);
  if (nameTokens.length === 0) return { matched: false, command: "" };
  const tokens = tokenize(raw ?? "");
  if (tokens.length < nameTokens.length) return { matched: false, command: "" };
  for (let i = 0; i + nameTokens.length <= tokens.length; i++) {
    let hit = true;
    for (let j = 0; j < nameTokens.length; j++) {
      if (tokens[i + j].text !== nameTokens[j]) {
        hit = false;
        break;
      }
    }
    if (!hit) continue;
    const after = raw
      .slice(tokens[i + nameTokens.length - 1].end)
      .replace(/^[\s,.:;!?—–-]+/, "")
      .trim();
    if (after) return { matched: true, command: after };
    const before = raw
      .slice(0, tokens[i].start)
      .replace(/[\s,.:;!?—–-]+$/, "")
      .trim();
    return { matched: true, command: before };
  }
  return { matched: false, command: "" };
}

export type AttentionState = "idle" | "attending";

export type WakeEvent =
  /** The name was heard while idle: the ghostie attends now. */
  | { type: "wake"; command: string }
  /** A final while attending: an ask for the ask path. */
  | { type: "utterance"; text: string }
  /** The name again while attending: attention refreshed. */
  | { type: "attend" }
  /** A final while idle with no name in it: heard, discarded. */
  | { type: "ignore" };

export interface WakeWordMachine {
  state(): AttentionState;
  /** Feed one FINAL transcript. Interim text never comes here. */
  hearFinal(text: string): WakeEvent;
  /** Advance time; returns true when attention just relaxed. */
  tick(): boolean;
  /** The ghostie was renamed: listen for the new name now. */
  setPhrase(phrase: string): void;
}

export function createWakeWordMachine(opts: {
  phrase: string;
  lapseMs?: number;
  now?: () => number;
}): WakeWordMachine {
  const lapseMs =
    typeof opts.lapseMs === "number" && opts.lapseMs > 0
      ? opts.lapseMs
      : ATTENTION_LAPSE_MS;
  const now = opts.now ?? (() => Date.now());
  let phrase = opts.phrase ?? "";
  let state: AttentionState = "idle";
  let lastHeardAt = 0;

  const relaxIfSilent = (at: number): boolean => {
    if (state === "attending" && at - lastHeardAt > lapseMs) {
      state = "idle";
      return true;
    }
    return false;
  };

  return {
    state: () => state,
    setPhrase(next: string) {
      phrase = next ?? "";
    },
    tick() {
      return relaxIfSilent(now());
    },
    hearFinal(text: string): WakeEvent {
      const raw = (text ?? "").trim();
      const at = now();
      // Silence may have already relaxed attention before
      // this final arrived: judge it as an idle final, never
      // smuggle it in on attention that has lapsed.
      relaxIfSilent(at);
      if (!raw) return { type: "ignore" };
      if (state === "attending") {
        lastHeardAt = at;
        const m = matchWakePhrase(raw, phrase);
        if (m.matched) {
          return m.command
            ? { type: "utterance", text: m.command }
            : { type: "attend" };
        }
        return { type: "utterance", text: raw };
      }
      const m = matchWakePhrase(raw, phrase);
      if (m.matched) {
        state = "attending";
        lastHeardAt = at;
        return { type: "wake", command: m.command };
      }
      return { type: "ignore" };
    },
  };
}
