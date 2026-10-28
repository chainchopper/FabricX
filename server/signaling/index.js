/**
 * Fabric signaling relay — minimal WebSocket signaling for WebRTC.
 *
 * Implements exactly the protocol spoken by src/services/SignalingService.ts
 * and consumed by src/services/WebRTCManager.ts:
 *
 *   client -> server:
 *     { type: "join",          roomId, peerId }
 *     { type: "leave",         roomId, peerId }
 *     { type: "offer",         roomId, from, to, sdp }
 *     { type: "answer",        roomId, from, to, sdp }
 *     { type: "ice-candidate", roomId, from, to, candidate }
 *
 *   server -> client:
 *     { type: "presence",    roomId, peers: string[] }   (to the joiner)
 *     { type: "peer-joined", roomId, peerId }            (to existing members)
 *     { type: "peer-left",   roomId, peerId }            (to remaining members)
 *     offer / answer / ice-candidate relayed verbatim to the `to` peer.
 *
 * Hotfix 2.0 adds one message type, "relay" — the fallback transport
 * for rooms whose WebRTC data channels could not open:
 *     { type: "relay", roomId, from, to?, payload }
 *   forwarded to the OTHER joined members of the sender's room (or
 *   only to `to` when present); the sender is never echoed and the
 *   forwarded `from` is stamped from the sender's membership, never
 *   trusted from the frame. `payload` is opaque — the exact envelope
 *   the client would have sent over its data channel. Frames over
 *   RELAY_MAX_BYTES and per-connection floods over
 *   RELAY_MAX_PER_WINDOW per RELAY_WINDOW_MS are dropped silently.
 *   This mirrors the Cloudflare worker (worker.js, same folder);
 *   unknown types are still ignored, so old clients/servers interop.
 *
 * Rooms are in-memory only; a single process instance serves all rooms, so
 * every peer of a room must land on the same instance (no sticky sessions =
 * no cross-device rooms). No messages are stored or logged.
 *
 * Powered by Nirvana
 */

"use strict";

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;

/** Hotfix 2.0 relay bounds — identical to the Cloudflare worker's. */
const RELAY_MAX_BYTES = 8192;
const RELAY_WINDOW_MS = 10000;
const RELAY_MAX_PER_WINDOW = 600;

/** @type {Map<string, Map<string, import("ws").WebSocket>>} roomId -> peerId -> socket */
const rooms = new Map();

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }
  return room;
}

function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(room, exceptPeerId, message) {
  room.forEach((ws, peerId) => {
    if (peerId !== exceptPeerId) send(ws, message);
  });
}

function removeFromRoom(roomId, peerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(peerId);
  broadcast(room, peerId, { type: "peer-left", roomId, peerId });
  if (room.size === 0) rooms.delete(roomId);
}

const server = http.createServer((req, res) => {
  // Tiny health endpoint so hosts/proxies can confirm the process is up.
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fabric-signaling", rooms: rooms.size }));
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  /** Rooms this socket has joined, for disconnect cleanup. @type {Map<string, string>} roomId -> peerId */
  const memberships = new Map();
  /** Hotfix 2.0: this connection's relay rate window. */
  let relayWindow = { start: 0, count: 0 };
  const relayAllowed = () => {
    const now = Date.now();
    if (now - relayWindow.start >= RELAY_WINDOW_MS) {
      relayWindow = { start: now, count: 0 };
    }
    relayWindow.count += 1;
    return relayWindow.count <= RELAY_MAX_PER_WINDOW;
  };

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // Ignore malformed frames.
    }
    if (!msg || typeof msg.type !== "string" || typeof msg.roomId !== "string") return;

    switch (msg.type) {
      case "join": {
        if (typeof msg.peerId !== "string") return;
        const room = getRoom(msg.roomId);
        // Tell the joiner who is already here (WebRTCManager initiates
        // to listed peers based on peer-id ordering).
        send(ws, { type: "presence", roomId: msg.roomId, peers: Array.from(room.keys()) });
        room.set(msg.peerId, ws);
        memberships.set(msg.roomId, msg.peerId);
        // Existing members initiate to the newcomer on peer-joined.
        broadcast(room, msg.peerId, { type: "peer-joined", roomId: msg.roomId, peerId: msg.peerId });
        break;
      }
      case "leave": {
        if (typeof msg.peerId !== "string") return;
        removeFromRoom(msg.roomId, msg.peerId);
        memberships.delete(msg.roomId);
        break;
      }
      case "offer":
      case "answer":
      case "ice-candidate": {
        if (typeof msg.to !== "string") return;
        const room = rooms.get(msg.roomId);
        const target = room && room.get(msg.to);
        if (target) send(target, msg); // Relay verbatim.
        break;
      }
      case "relay": {
        // Hotfix 2.0: opaque interaction relay (see header). The
        // sender must be a joined member of the room it names.
        const peerId = memberships.get(msg.roomId);
        if (!peerId) return;
        if (!msg.payload || typeof msg.payload !== "object") return;
        const rawLen = raw ? raw.length : 0; // Buffer bytes / string chars
        if (typeof rawLen !== "number" || rawLen > RELAY_MAX_BYTES) return;
        if (!relayAllowed()) return; // excess dropped, never a disconnect
        const room = rooms.get(msg.roomId);
        if (!room) return;
        const out = { type: "relay", roomId: msg.roomId, from: peerId, payload: msg.payload };
        if (typeof msg.to === "string" && msg.to) {
          out.to = msg.to;
          const target = room.get(msg.to);
          if (target && target !== ws) send(target, out);
        } else {
          broadcast(room, peerId, out); // never echoes the sender
        }
        break;
      }
      default:
        break; // Unknown types are ignored, never fatal.
    }
  });

  const cleanup = () => {
    memberships.forEach((peerId, roomId) => removeFromRoom(roomId, peerId));
    memberships.clear();
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

server.listen(PORT, () => {
  console.log(`[fabric-signaling] listening on port ${PORT}`);
});
