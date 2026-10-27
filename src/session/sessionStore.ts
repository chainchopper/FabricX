/**
 * Session store — Slice 5 "Share & Session".
 *
 * The bridge between the canvas (which owns the transport, via
 * useFluidMultiUser) and the chrome (the F menu, HUD chip, connection
 * badge, diagnostics). Same module pub/sub pattern as
 * src/ghost/ghostStore and shared/utils/realtimeStatus — no prop
 * drilling across the single persistent canvas:
 *
 * - STATUS flows canvas -> chrome: the hook publishes the room's
 *   session truth (mode, host, driver, and the enforcement result for
 *   this client) with setSessionPublicState.
 * - INTENT flows chrome -> canvas: the menu records host intent
 *   (requestHostSession / requestPassControl / requestStopHosting);
 *   the hook subscribed to intent applies it — claiming, re-moding,
 *   passing control, or resigning — and announces it to the room.
 *   Intent is state, not a fire-and-forget event, so a claim made
 *   just before a room switch is still there when the hook for the
 *   new room initializes.
 *
 * Session modes (the host picks one when sharing; it is the room's
 * live mode and is ENFORCED in the interaction path, not just shown):
 * - collab:  everyone draws on the shared canvas.
 * - mirror:  guests receive the host's canvas; guest input renders
 *            locally only and is never broadcast.
 * - view:    guests receive only; guest canvas input is disabled
 *            outright (audience mode).
 * - control: exactly one driver at a time (the host first); only the
 *            driver's client broadcasts. The host can pass control to
 *            a guest and take it back; non-drivers behave as mirror.
 *
 * Powered by Nirvana
 */

export type SessionMode = "collab" | "mirror" | "view" | "control";

/** "open" = nobody has claimed hosting in this room (free collab). */
export type SessionRole = "host" | "guest" | "open";

export interface SessionPublicState {
  roomId: string;
  /** This client's fluid userId (the id peers see on interactions). */
  selfId: string;
  role: SessionRole;
  /** The room's live mode ("collab" while the room is open). */
  mode: SessionMode;
  hostId: string | null;
  /** Control mode only: the one peer allowed to broadcast. */
  driverId: string | null;
  /**
   * Enforcement result for THIS client, computed where the transport
   * lives: may this client broadcast interactions right now?
   */
  canSend: boolean;
  /** False only for view-mode guests — their canvas input is off. */
  inputEnabled: boolean;
  /** Human peers currently in the room (ghosts never count). */
  peers: number;
  /** Signaling connection state, mirrored for presence truth. */
  online: "online" | "local" | "connecting";
  /** Human userIds heard from in this room (pass-control list). */
  guestIds: string[];
}

export const SESSION_MODES: readonly SessionMode[] = [
  "collab",
  "mirror",
  "view",
  "control",
];

export const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  collab: "Collab",
  mirror: "Mirror",
  view: "View only",
  control: "Take control",
};

export const SESSION_MODE_BLURB: Record<SessionMode, string> = {
  collab: "Everyone draws on the shared canvas, together.",
  mirror:
    "Guests watch your canvas live. Their touches stay on their own screen — they see themselves, you never do.",
  view: "Audience mode. Guests receive your canvas and can't touch it at all.",
  control:
    "One driver at a time — you first. Pass the brush to a guest whenever you like, and take it back the same way.",
};

export function isSessionMode(v: unknown): v is SessionMode {
  return (
    typeof v === "string" &&
    (SESSION_MODES as readonly string[]).includes(v)
  );
}

/** "user-ab12cd" -> "guest ab12cd" — how peers are named in the UI. */
export function shortPeerId(id: string | null | undefined): string {
  if (!id) return "—";
  const tail = id.replace(/^user-/, "").replace(/^peer-/, "").slice(0, 6);
  return `guest ${tail}`;
}

const ROOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Fresh shareable room id, e.g. "live-k7d2qx". Slug-safe, <= 40 chars. */
export function mintRoomId(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return `live-${suffix}`;
}

/**
 * The mode/room an invite LINK carried (?room=…&mode=…). Display-only:
 * it tells a freshly landed guest what they were invited into while
 * the host's first announcement is still in flight. Enforcement never
 * reads this — the host's announced session state is authoritative.
 */
export function parseInviteHint(): { roomId: string; mode: SessionMode | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    if (!roomId) return null;
    const mode = params.get("mode");
    return { roomId, mode: isSessionMode(mode) ? mode : null };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Public state (canvas -> chrome)
// ------------------------------------------------------------------

const state: SessionPublicState = {
  roomId: "main",
  selfId: "",
  role: "open",
  mode: "collab",
  hostId: null,
  driverId: null,
  canSend: true,
  inputEnabled: true,
  peers: 0,
  online: "local",
  guestIds: [],
};
const listeners = new Set<(s: SessionPublicState) => void>();

export function getSessionPublicState(): SessionPublicState {
  return { ...state, guestIds: [...state.guestIds] };
}

export function setSessionPublicState(next: Partial<SessionPublicState>): void {
  let changed = false;
  (Object.keys(next) as (keyof SessionPublicState)[]).forEach((key) => {
    const value = next[key];
    if (value === undefined) return;
    if (key === "guestIds") {
      const a = state.guestIds;
      const b = value as string[];
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
        state.guestIds = [...b];
        changed = true;
      }
      return;
    }
    if (state[key] !== value) {
      (state as Record<string, unknown>)[key] = value;
      changed = true;
    }
  });
  if (changed) {
    listeners.forEach((l) => l(getSessionPublicState()));
  }
}

export function subscribeSessionState(
  fn: (s: SessionPublicState) => void
): () => void {
  listeners.add(fn);
  fn(getSessionPublicState());
  return () => {
    listeners.delete(fn);
  };
}

// ------------------------------------------------------------------
// Host intent (chrome -> canvas)
// ------------------------------------------------------------------

export interface HostIntent {
  roomId: string;
  mode: SessionMode;
  /** Control-mode driver override; null = the host drives. */
  driverId: string | null;
  /** Monotonic command sequence — every command bumps it. */
  seq: number;
}

let hostIntent: HostIntent | null = null;
let intentSeq = 0;
const intentListeners = new Set<(i: HostIntent | null) => void>();

function emitIntent(): void {
  intentListeners.forEach((l) => l(hostIntent ? { ...hostIntent } : null));
}

export function getHostIntent(): HostIntent | null {
  return hostIntent ? { ...hostIntent } : null;
}

export function subscribeHostIntent(
  fn: (i: HostIntent | null) => void
): () => void {
  intentListeners.add(fn);
  fn(hostIntent ? { ...hostIntent } : null);
  return () => {
    intentListeners.delete(fn);
  };
}

/**
 * Claim hosting of `roomId` with `mode` — or, if this client already
 * hosts that room, change the room's live mode. The driver override
 * survives a mode change in the same room; a fresh claim starts with
 * the host driving.
 */
export function requestHostSession(roomId: string, mode: SessionMode): void {
  const keepDriver =
    hostIntent && hostIntent.roomId === roomId ? hostIntent.driverId : null;
  hostIntent = { roomId, mode, driverId: keepDriver, seq: ++intentSeq };
  emitIntent();
}

/** Host only: hand the brush to a guest (or null = take it back). */
export function requestPassControl(toUserId: string | null): void {
  if (!hostIntent) return;
  hostIntent = { ...hostIntent, driverId: toUserId, seq: ++intentSeq };
  emitIntent();
}

/** Host only: resign. The room degrades to open collab for everyone. */
export function requestStopHosting(): void {
  if (!hostIntent) return;
  hostIntent = null;
  intentSeq += 1;
  emitIntent();
}

// ------------------------------------------------------------------
// Share-live bridge (Studio -> menu)
// ------------------------------------------------------------------

/**
 * Window event: a saved composition's "Share live" was tapped in
 * Studio. Detail: { name: string }. The Fabric menu listens, makes
 * sure a hosted session exists, opens itself on the SHARE section,
 * and shows the invite link. Playback honesty: Studio's saved list is
 * still demo data (no persisted Pattern per entry yet), so this event
 * carries identity only — the menu states the playback follow-up
 * plainly instead of pretending to play something that doesn't
 * exist. Real patterns composed this session share live through
 * FABRIC_PLAY_PATTERN_EVENT instead (see PatternComposer).
 */
export const FABRIC_SHARE_LIVE_EVENT = "fabric:share-live";
