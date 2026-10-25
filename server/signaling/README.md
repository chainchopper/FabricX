# Fabric Signaling Relay

A minimal, standalone WebSocket relay that lets Fabric clients on
**different devices** find each other and set up WebRTC peer connections.
Without it, Fabric falls back to `BroadcastChannel`, which only reaches
other tabs in the same browser — two real phones can never sync.

It implements exactly the message protocol in
`src/services/SignalingService.ts` (join / leave / offer / answer /
ice-candidate in; presence / peer-joined / peer-left / relayed messages
out). Rooms are in-memory; nothing is stored.

## Run it locally

```bash
cd server/signaling
npm install
PORT=8080 npm start
# -> [fabric-signaling] listening on port 8080
# health check: curl http://localhost:8080/health
```

Then point a local web build at it:

```bash
EXPO_PUBLIC_SIGNALING_SERVER_URL=ws://localhost:8080 npm run build:web
```

## Hosting / transport options

The protocol is transport-agnostic — anything that can hold a WebSocket
per peer and route messages by room can host it. Three options, in order
of preference:

### 1. Recommended production host: Cloudflare Workers + Durable Objects

- **Free tier**, and the `wss://` URL is stable (no tunnels, no cold
  URLs to update in the app config).
- **One Durable Object per room** maps exactly onto this protocol: the
  object holds the room's peer sockets in memory, answers `join` with
  `presence`, broadcasts `peer-joined` / `peer-left`, and relays
  offer/answer/ice-candidate to the addressed peer. Because a room is a
  single object, the "all peers of a room on one instance" requirement
  is satisfied by construction.
- The Worker itself just upgrades the request and routes
  `/rooms/<roomId>` to that room's Durable Object.
- Porting note: this folder's `index.js` is the reference implementation
  of the protocol; the Durable Object version is the same message
  handling with `state.acceptWebSocket()` in place of the `ws` server.

### 2. Zero-infrastructure fallback: QR-code / manual SDP pairing (roadmap)

For same-room / same-space use, two devices can pair with **no server at
all**: one device displays its SDP offer as a QR code (or copy-paste
blob), the other scans/pastes it and returns its answer the same way,
after which the WebRTC data channel runs fully peer-to-peer.

- Pros: nothing to host, nothing to pay for, works offline on a LAN.
- Cons: manual, one pairing at a time, no presence/discovery — you
  exchange two blobs per peer.
- Status: **future client work**, noted here as the roadmap fallback for
  when no relay is reachable. Not implemented in this slice.

### 3. Kaggle notebooks: temporary test tunnel only ⚠️

A Kaggle notebook can run this relay behind a tunnel for a quick
two-phone smoke test, but it is **not production hosting**: notebook
sessions time out and shut down, and the tunnel URL is ephemeral — it
changes every session, so `EXPO_PUBLIC_SIGNALING_SERVER_URL` would need
re-setting (and the app rebuilding) each time. Fine for a 20-minute
experiment; never point a shipped build at it.

### Self-hosting this Node relay

Any host that runs a long-lived Node process also works (a small VPS,
Fly.io, Render, Railway, a container, etc.):

1. Deploy this folder (`npm install`, `npm start`; it listens on `$PORT`).
2. Put it behind TLS. **This is not optional:** Fabric is served over
   HTTPS, and browsers refuse `ws://` connections from secure pages.
   Terminate TLS at your proxy/load balancer so the public URL is
   `wss://…`.
3. Run a **single instance**. Rooms live in one process's memory, so
   peers load-balanced across instances will never see each other.

## Point the web build at it

Set the environment variable for the web build/deploy (e.g. in Vercel's
project environment variables, then rebuild/redeploy):

```bash
EXPO_PUBLIC_SIGNALING_SERVER_URL=wss://<your-relay-host>
```

No app code changes are needed — `SignalingService` already reads this
variable and defaults to `ws://localhost:8080` when it is unset.

## Quick smoke test

1. Host the relay; build the web app with the `wss://` URL above.
2. Open Fabric on two phones, same room (default room is `main`, or share
   a link with `?room=<name>`).
3. Draw on phone A — phone B should ripple and vibrate within ~1s, and
   the connection status should show transport `webrtc` with peers > 0.

Powered by Nirvana
