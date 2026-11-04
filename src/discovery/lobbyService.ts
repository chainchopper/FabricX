/**
 * Lobby service — Slice 59 "Finding people" (the client).
 *
 * Owns this device's seat in the lobby room (LOBBY_ROOM_ID): a
 * SECOND signaling socket + WebRTCManager, entirely separate
 * from the session room's transport, speaking only the worker's
 * core protocol (join / presence / offer / answer / ice — the
 * path two-phone touch proved on Oct 27). The deployed worker
 * drops Hotfix 2.0 `relay` frames (live-probed Nov 3, 2026), so
 * discovery frames ride the lobby mesh's control channels via
 * the manager's ordinary send/sendTo. No worker change is made
 * or needed; if a future worker deploys relay support, the
 * manager's built-in fallback only adds a second path under the
 * same frames.
 *
 * Lifecycle is need-driven (three independent needs, one seat):
 * - BROWSING — the Find gallery is open.
 * - WATCHING — the user follows or friends someone: the seat is
 *   held so arrivals are encounters even with the gallery shut.
 * - LISTING  — this device hosts with "List my fabric" on: the
 *   beacon loop runs and join requests are answered.
 * When no need stands, the seat is given up (room left, socket
 * closed, book cleared) — an unlisted, unwatched lobby presence
 * is exactly nothing on the air, per the consent rule.
 *
 * The beat: while listing, the service watches the session
 * public state the menu already lives on; any change in the
 * room's company or conduct (peers, guests, mode, driver, host)
 * re-stamps the beat. That is the heartbeat the Find rows read
 * ("live now" / "active Nm ago" / "quiet Nm").
 *
 * Known wart, stated once: WebRTCManager registers itself as
 * the diag panel's active manager on construction, so while the
 * lobby seat exists, ?diag=1's transport-path line reads the
 * lobby's path rather than the canvas room's. Diagnostics only —
 * no user surface reads it, and the registration clears when
 * the seat is given up.
 *
 * Powered by Nirvana
 */

import { SignalingService } from "../services/SignalingService";
import { WebRTCManager } from "../services/WebRTCManager";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionMode,
} from "../session/sessionStore";
import {
  BEACON_MS,
  ENCOUNTER_SETTLE_MS,
  LOBBY_ROOM_ID,
  REQUEST_TIMEOUT_MS,
  createEncounterTracker,
  createListingBook,
  encounterGone,
  encounterSeen,
  encounterWarmUp,
  expireListings,
  mintRequestId,
  pruneJoinRequests,
  reduceOutgoing,
  removeListing,
  sanitizeFrame,
  upsertJoinRequest,
  upsertListing,
  type EncounterTracker,
  type JoinRequest,
  type ListingBook,
  type ListingEntry,
  bookRows,
  type LobbyIdentity,
  type LobbyListing,
  type OutgoingState,
} from "./lobbyProtocol";
import { getFollowTags, getFriendTags } from "./socialStore";

/* ------------------------------------------------------------------ */
/* Transport seam (the check drives a fake; production uses WebRTC)    */
/* ------------------------------------------------------------------ */

export interface LobbyTransport {
  peerId: string;
  start(): void;
  destroy(): void;
  send(frame: unknown): void;
  sendTo(peerId: string, frame: unknown): void;
  onFrame(fn: (frame: unknown, fromPeerId: string) => void): () => void;
  onPeersChanged(fn: (peerIds: string[]) => void): () => void;
}

const PEER_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomLobbyPeerId(): string {
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += PEER_ALPHABET[Math.floor(Math.random() * PEER_ALPHABET.length)];
  }
  return `peer-${suffix}`;
}

function createWebRTCTransport(pollMs: number): LobbyTransport {
  const signaling = new SignalingService();
  const peerId = randomLobbyPeerId();
  const manager = new WebRTCManager(LOBBY_ROOM_ID, peerId, signaling);
  let lastPeers = "";
  let poll: ReturnType<typeof setInterval> | null = null;
  const peerFns = new Set<(ids: string[]) => void>();
  return {
    peerId,
    start() {
      void signaling.connect();
      poll = setInterval(() => {
        const ids = manager.getPeerIds();
        const key = ids.join(",");
        if (key !== lastPeers) {
          lastPeers = key;
          peerFns.forEach((fn) => fn(ids));
        }
      }, pollMs);
    },
    destroy() {
      if (poll) clearInterval(poll);
      poll = null;
      manager.destroy();
      signaling.disconnect();
    },
    send(frame) {
      manager.send(frame);
    },
    sendTo(to, frame) {
      manager.sendTo(to, frame);
    },
    onFrame(fn) {
      return manager.onMessage((data, from) => fn(data, from));
    },
    onPeersChanged(fn) {
      peerFns.add(fn);
      return () => {
        peerFns.delete(fn);
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export interface LobbyHostFields {
  fabricId: string;
  fabricName: string;
  roomId: string;
  mode: SessionMode;
  ghostName: string | null;
  badges: string[];
}

export interface LobbySnapshot {
  transportUp: boolean;
  listed: boolean;
  rows: ListingEntry[];
  requests: JoinRequest[];
  outgoing: OutgoingState;
  readyPeers: string[];
}

export interface LobbyEncounter {
  tag: string;
  name: string;
}

export interface LobbyServiceOptions {
  beaconMs?: number;
  pollMs?: number;
  requestTimeoutMs?: number;
  settleMs?: number;
  transportFactory?: (pollMs: number) => LobbyTransport;
}

const HOUSE_TICK_MS = 1_000;

export class LobbyService {
  private beaconMs: number;
  private pollMs: number;
  private requestTimeoutMs: number;
  private settleMs: number;
  private factory: (pollMs: number) => LobbyTransport;

  private transport: LobbyTransport | null = null;
  private transportUnsubs: (() => void)[] = [];
  private needBrowse = false;
  private needWatch = false;

  private identity: LobbyIdentity | null = null;
  private hostFields: LobbyHostFields | null = null;
  private listed = false;

  private book: ListingBook = createListingBook();
  private requests: JoinRequest[] = [];
  private outgoing: OutgoingState = { phase: "idle" };
  private readyPeers: string[] = [];

  private beat = 0;
  private sessionUnsub: (() => void) | null = null;
  private lastSessionTuple = "";

  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private houseTimer: ReturnType<typeof setInterval> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private tracker: EncounterTracker = createEncounterTracker();

  private listeners = new Set<(s: LobbySnapshot) => void>();
  private encounterListeners = new Set<(e: LobbyEncounter) => void>();

  constructor(options: LobbyServiceOptions = {}) {
    this.beaconMs = options.beaconMs ?? BEACON_MS;
    this.pollMs = options.pollMs ?? 1_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.settleMs = options.settleMs ?? ENCOUNTER_SETTLE_MS;
    this.factory = options.transportFactory ?? createWebRTCTransport;
  }

  /* ---------------- snapshots + encounters ---------------- */

  subscribe(fn: (s: LobbySnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  onEncounter(fn: (e: LobbyEncounter) => void): () => void {
    this.encounterListeners.add(fn);
    return () => {
      this.encounterListeners.delete(fn);
    };
  }

  getSnapshot(): LobbySnapshot {
    expireListings(this.book, Date.now());
    return {
      transportUp: this.transport !== null,
      listed: this.listed,
      rows: bookRows(this.book),
      requests: [...this.requests],
      outgoing: this.outgoing,
      readyPeers: [...this.readyPeers],
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private fireEncounter(e: LobbyEncounter): void {
    this.encounterListeners.forEach((fn) => fn(e));
  }

  /* ---------------- identity + host fields ---------------- */

  setIdentity(identity: LobbyIdentity | null): void {
    this.identity = identity;
    if (identity && this.listed) this.beaconNow();
  }

  setHostFields(fields: LobbyHostFields | null): void {
    const prev = JSON.stringify(this.hostFields);
    this.hostFields = fields;
    if (fields && this.listed && JSON.stringify(fields) !== prev) {
      this.beaconNow();
    }
  }

  /* ---------------- needs ---------------- */

  startBrowsing(): void {
    this.needBrowse = true;
    this.ensureTransport();
  }

  stopBrowsing(): void {
    this.needBrowse = false;
    this.maybeStopTransport();
  }

  startWatching(): void {
    this.needWatch = true;
    this.ensureTransport();
  }

  stopWatching(): void {
    this.needWatch = false;
    this.maybeStopTransport();
  }

  /* ---------------- listing ---------------- */

  setListed(on: boolean): void {
    if (on === this.listed) return;
    if (on) {
      this.listed = true;
      this.ensureTransport();
      this.beat = Date.now();
      this.lastSessionTuple = "";
      this.sessionUnsub = subscribeSessionState((s) => {
        const tuple = [
          s.peers,
          s.guestIds.join(","),
          s.mode,
          s.driverId ?? "",
          s.hostId ?? "",
          s.role,
        ].join("|");
        if (tuple !== this.lastSessionTuple) {
          this.lastSessionTuple = tuple;
          this.beat = Date.now();
        }
      });
      this.beaconTimer = setInterval(() => this.beaconNow(), this.beaconMs);
      this.beaconNow();
    } else {
      this.listed = false;
      this.sendUnlist();
      if (this.sessionUnsub) this.sessionUnsub();
      this.sessionUnsub = null;
      if (this.beaconTimer) clearInterval(this.beaconTimer);
      this.beaconTimer = null;
      this.requests = [];
      this.maybeStopTransport();
    }
    this.emit();
  }

  private beaconNow(): void {
    // THE consent gate: unlisted means silent — no frame exists
    // to send, and this early return is the whole proof.
    if (!this.listed || !this.hostFields || !this.identity || !this.transport) {
      return;
    }
    const f = this.hostFields;
    const listing: LobbyListing = {
      fabricId: f.fabricId,
      fabricName: f.fabricName,
      roomId: f.roomId,
      mode: f.mode,
      hostName: this.identity.name,
      hostHue: this.identity.hue,
      hostTag: this.identity.tag,
      participants: getSessionPublicState().peers + 1,
      beat: this.beat,
      ...(f.ghostName ? { ghostName: f.ghostName } : {}),
      ...(f.badges.length > 0 ? { badges: [...f.badges] } : {}),
    };
    this.transport.send({ v: 1, kind: "listing", listing });
  }

  private sendUnlist(): void {
    if (!this.identity || !this.transport) return;
    this.transport.send({ v: 1, kind: "unlist", tag: this.identity.tag });
  }

  /* ---------------- asking + answering ---------------- */

  askToJoin(entry: ListingEntry): void {
    if (!this.identity || !this.transport) return;
    const requestId = mintRequestId();
    this.outgoing = reduceOutgoing(
      this.outgoing,
      {
        type: "ask",
        requestId,
        hostPeerId: entry.fromPeerId,
        hostTag: entry.listing.hostTag,
        hostName: entry.listing.hostName,
        now: Date.now(),
      },
      this.requestTimeoutMs
    );
    this.transport.sendTo(entry.fromPeerId, {
      v: 1,
      kind: "join-request",
      requestId,
      from: this.identity,
    });
    this.emit();
  }

  resetOutgoing(): void {
    if (this.outgoing.phase === "idle") return;
    this.outgoing = reduceOutgoing(this.outgoing, { type: "reset" });
    this.emit();
  }

  respondToRequest(requestId: string, grant: boolean): void {
    const req = this.requests.find((r) => r.requestId === requestId);
    if (!req || !this.transport) return;
    this.requests = this.requests.filter((r) => r.requestId !== requestId);
    if (grant && this.hostFields) {
      this.transport.sendTo(req.fromPeerId, {
        v: 1,
        kind: "join-granted",
        requestId,
        roomId: this.hostFields.roomId,
        mode: this.hostFields.mode,
        fabricId: this.hostFields.fabricId,
      });
    } else {
      // A denial, or a grant whose room is already gone — either
      // way the answer the guest gets is an honest no.
      this.transport.sendTo(req.fromPeerId, {
        v: 1,
        kind: "join-denied",
        requestId,
      });
    }
    this.emit();
  }

  /* ---------------- transport lifecycle ---------------- */

  private ensureTransport(): void {
    if (this.transport) return;
    const transport = this.factory(this.pollMs);
    this.transport = transport;
    this.transportUnsubs.push(
      transport.onFrame((frame, from) => this.onFrame(frame, from)),
      transport.onPeersChanged((ids) => {
        this.readyPeers = ids;
        this.emit();
      })
    );
    this.tracker = createEncounterTracker();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      encounterWarmUp(this.tracker, [...this.book.keys()]);
    }, this.settleMs);
    this.houseTimer = setInterval(() => this.houseTick(), HOUSE_TICK_MS);
    transport.start();
    if (this.listed) this.beaconNow();
    this.emit();
  }

  private maybeStopTransport(): void {
    if (this.needBrowse || this.needWatch || this.listed) return;
    if (!this.transport) return;
    this.transportUnsubs.forEach((u) => u());
    this.transportUnsubs = [];
    this.transport.destroy();
    this.transport = null;
    if (this.houseTimer) clearInterval(this.houseTimer);
    this.houseTimer = null;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.book = createListingBook();
    this.readyPeers = [];
    this.tracker = createEncounterTracker();
    this.emit();
  }

  /** Full teardown (checks, and a future app shutdown path). */
  destroy(): void {
    this.setListed(false);
    this.needBrowse = false;
    this.needWatch = false;
    this.maybeStopTransport();
    this.listeners.clear();
    this.encounterListeners.clear();
  }

  /* ---------------- frame routing + housekeeping ---------------- */

  private onFrame(raw: unknown, fromPeerId: string): void {
    const frame = sanitizeFrame(raw, Date.now());
    if (!frame) return;
    switch (frame.kind) {
      case "listing": {
        const tag = frame.listing.hostTag;
        const wasPresent = this.book.has(tag);
        const changed = upsertListing(this.book, frame.listing, fromPeerId, Date.now());
        if (!wasPresent) {
          const deliberate =
            getFollowTags().has(tag) || getFriendTags().has(tag);
          if (encounterSeen(this.tracker, tag, deliberate, Date.now())) {
            this.fireEncounter({ tag, name: frame.listing.hostName });
          }
        }
        if (changed) this.emit();
        break;
      }
      case "unlist": {
        if (removeListing(this.book, frame.tag)) {
          encounterGone(this.tracker, frame.tag);
          this.emit();
        }
        break;
      }
      case "join-request": {
        // Only a listed host answers asks; a browser ignores them.
        if (!this.listed) break;
        this.requests = pruneJoinRequests(
          upsertJoinRequest(this.requests, {
            requestId: frame.requestId,
            fromPeerId,
            from: frame.from,
            at: Date.now(),
          }),
          Date.now()
        );
        this.emit();
        break;
      }
      case "join-granted": {
        this.outgoing = reduceOutgoing(
          this.outgoing,
          {
            type: "granted",
            requestId: frame.requestId,
            roomId: frame.roomId,
            mode: frame.mode,
            fabricId: frame.fabricId,
          },
          this.requestTimeoutMs
        );
        this.emit();
        break;
      }
      case "join-denied": {
        this.outgoing = reduceOutgoing(
          this.outgoing,
          { type: "denied", requestId: frame.requestId, now: Date.now() },
          this.requestTimeoutMs
        );
        this.emit();
        break;
      }
    }
  }

  private houseTick(): void {
    const now = Date.now();
    let changed = false;
    const before = [...this.book.keys()];
    if (expireListings(this.book, now)) {
      changed = true;
      for (const tag of before) {
        if (!this.book.has(tag)) encounterGone(this.tracker, tag);
      }
    }
    const pruned = pruneJoinRequests(this.requests, now);
    if (pruned.length !== this.requests.length) {
      this.requests = pruned;
      changed = true;
    }
    const next = reduceOutgoing(
      this.outgoing,
      { type: "tick", now },
      this.requestTimeoutMs
    );
    if (next !== this.outgoing) {
      this.outgoing = next;
      changed = true;
    }
    if (changed) this.emit();
  }
}

/** The app-wide seat. One lobby connection per client, ever. */
export const lobbyService = new LobbyService();
