// fabric-signaling — Cloudflare Worker + Durable Object relay for Fabric (FabricX).
// Deploy AS-IS. One Worker, one Durable Object class, nothing else.
// Protocol matches FabricX src/services/SignalingService.ts and server/signaling/index.js:
//   Client connects ONE WebSocket to the base URL (no path/query). Room travels in messages.
//   Client -> server: join/leave {roomId, peerId}; offer/answer/ice-candidate {roomId, from, to, sdp/candidate}
//   Server -> client: presence {roomId, peers[]}, peer-joined {roomId, peerId}, peer-left {roomId, peerId}, verbatim relays.
//   GET /health -> { ok: true, service: "fabric-signaling", rooms: n }
//
// Hotfix 2.0 adds ONE message type, "relay" — the fallback transport for
// rooms whose WebRTC data channels could not open (hostile NATs /
// firewalls that pass WSS but kill P2P):
//   Client -> server: relay {roomId, from, to?, payload}
//   Server -> client: relay {roomId, from, to?, payload} forwarded to the
//     OTHER joined members of the sender's room (or only to `to` when the
//     sender narrows delivery); the sender is never echoed.
//   `payload` is OPAQUE to the server — it is the exact interaction
//   envelope the client would have sent over its data channel, sequence
//   numbers included, so receivers run one dedupe/order path for both
//   transports. Bounds: frames over RELAY_MAX_BYTES and per-connection
//   floods over RELAY_MAX_PER_WINDOW frames per RELAY_WINDOW_MS are
//   dropped silently (never a disconnect). The forwarded `from` is
//   stamped from the sender's join attachment, never trusted from the
//   frame. Backward compatible both ways: old servers ignore the
//   unknown type; old clients ignore relay frames they receive.
//
// Because roomId travels INSIDE messages, a single global Durable Object holds all rooms:
// the Worker routes every connection to idFromName("global"). Hibernation API is used
// (ctx.acceptWebSocket), so idle rooms cost nothing and sockets survive DO eviction.

/** Hotfix 2.0 relay bounds (see header). Relay frames carry batched
 * stroke points and small control envelopes — a few hundred bytes in
 * practice; 8KB is generous headroom, not a target. The rate window
 * allows ~60 relay frames/sec sustained (an active drawing client
 * emits ~33/sec of batches) while stopping floods cold. */
const RELAY_MAX_BYTES = 8192;
const RELAY_WINDOW_MS = 10000;
const RELAY_MAX_PER_WINDOW = 600;

export class SignalingRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.rooms = new Map(); // roomId -> Set<WebSocket>
    // Per-connection relay rate windows (Hotfix 2.0): ws -> {start, count}.
    // Soft state by design — a hibernation wake resets the windows,
    // which only ever makes the limit briefly more permissive.
    this.relayWindows = new Map();
    // Rebuild room membership from live sockets after a hibernation wake.
    for (const ws of this.ctx.getWebSockets()) {
      const a = safeAttachment(ws);
      if (a && a.roomId) this._add(a.roomId, ws);
    }
  }

  _add(roomId, ws) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId).add(ws);
  }

  _removeEverywhere(ws) {
    const a = safeAttachment(ws);
    for (const [roomId, set] of this.rooms) {
      if (set.delete(ws) && set.size === 0) this.rooms.delete(roomId);
    }
    return a;
  }

  _peers(roomId) {
    const set = this.rooms.get(roomId);
    if (!set) return [];
    const out = [];
    for (const ws of set) {
      const a = safeAttachment(ws);
      if (a && a.peerId) out.push(a.peerId);
    }
    return out;
  }

  _find(roomId, peerId) {
    const set = this.rooms.get(roomId);
    if (!set) return null;
    for (const ws of set) {
      const a = safeAttachment(ws);
      if (a && a.peerId === peerId) return ws;
    }
    return null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health" || (url.pathname === "/" && request.headers.get("Upgrade") !== "websocket")) {
      return Response.json({ ok: true, service: "fabric-signaling", rooms: this.rooms.size });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return; // malformed frame: drop quietly
    }
    if (!msg || typeof msg.type !== "string") return;
    const roomId = msg.roomId || "default";

    if (msg.type === "join") {
      const peerId = msg.peerId;
      if (!peerId) return;
      ws.serializeAttachment({ roomId, peerId });
      // Presence FIRST, computed before adding self: the joiner must see who was
      // ALREADY here, never itself (matches the Node reference relay — a client that
      // initiates to listed peers would otherwise try to connect to itself).
      try { ws.send(JSON.stringify({ type: "presence", roomId, peers: this._peers(roomId) })); } catch {}
      this._add(roomId, ws);
      // Tell everyone else it arrived.
      for (const other of this.rooms.get(roomId) || []) {
        if (other !== ws) {
          try { other.send(JSON.stringify({ type: "peer-joined", roomId, peerId })); } catch {}
        }
      }
      return;
    }

    if (msg.type === "leave") {
      this._depart(ws);
      return;
    }

    if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice-candidate") {
      const target = msg.to ? this._find(roomId, msg.to) : null;
      if (target) {
        try { target.send(JSON.stringify(msg)); } catch {}
      }
      return;
    }

    if (msg.type === "relay") {
      // Hotfix 2.0: opaque interaction relay (see header). Membership
      // is the authorization: the sender must be a JOINED member of
      // the room it names — its socket attachment, written at join,
      // is the only membership proof the server trusts.
      const a = safeAttachment(ws);
      if (!a || !a.roomId || !a.peerId || a.roomId !== roomId) return;
      if (!msg.payload || typeof msg.payload !== "object") return;
      // Size bound on the raw frame. Applies to relay frames ONLY —
      // SDP signaling above keeps its existing (unbounded) behavior.
      const rawLen = typeof raw === "string" ? raw.length : raw.byteLength;
      if (typeof rawLen !== "number" || rawLen > RELAY_MAX_BYTES) return;
      // Flood bound: excess frames are dropped, never punished with
      // a disconnect (a drawing client at the cap is indistinguishable
      // from a flooding one at the margins, and dropping is enough).
      if (!this._relayAllowed(ws)) return;

      // `from` is stamped from the attachment — a client cannot speak
      // in another peer's name through the relay. `to`, when present
      // and a string, narrows delivery to that one member (the sender
      // uses it when only some peers lack a data channel, so nobody
      // receives a payload twice — once per transport).
      const out = { type: "relay", roomId, from: a.peerId, payload: msg.payload };
      if (typeof msg.to === "string" && msg.to) out.to = msg.to;
      const frame = JSON.stringify(out);
      const set = this.rooms.get(roomId);
      if (!set) return;
      for (const other of set) {
        if (other === ws) continue; // never echo the sender
        if (out.to) {
          const oa = safeAttachment(other);
          if (!oa || oa.peerId !== out.to) continue;
        }
        try { other.send(frame); } catch {}
      }
      return;
    }
    // Unknown types are ignored by design (forward-compatible).
  }

  /** Hotfix 2.0: rolling-window relay budget for one connection. */
  _relayAllowed(ws) {
    const now = Date.now();
    let w = this.relayWindows.get(ws);
    if (!w || now - w.start >= RELAY_WINDOW_MS) {
      w = { start: now, count: 0 };
      this.relayWindows.set(ws, w);
    }
    w.count += 1;
    return w.count <= RELAY_MAX_PER_WINDOW;
  }

  _depart(ws) {
    const a = safeAttachment(ws);
    this.relayWindows.delete(ws);
    this._removeEverywhere(ws);
    if (a && a.roomId && a.peerId) {
      const set = this.rooms.get(a.roomId);
      if (set) {
        for (const other of set) {
          try { other.send(JSON.stringify({ type: "peer-left", roomId: a.roomId, peerId: a.peerId })); } catch {}
        }
      }
    }
    try { ws.serializeAttachment({}); } catch {}
  }

  async webSocketClose(ws) { this._depart(ws); }
  async webSocketError(ws) { this._depart(ws); }
}

function safeAttachment(ws) {
  try {
    return ws.deserializeAttachment();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const stub = env.SIGNALING.get(env.SIGNALING.idFromName("global"));
    return stub.fetch(request);
  },
};
