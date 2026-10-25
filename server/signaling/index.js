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
