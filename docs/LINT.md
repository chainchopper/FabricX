# Lint — the Fabric object protocol (v0)

*Slice 13, "Lint wakes up." This document is the contract. The
TypeScript source of truth is `src/lint/lintProtocol.ts`; the
reference device is `firmware/lint_esp32/`.*

## 1. What lint is

In the Fabric world model, **lint are the objects** — devices and
items attached to the fabric, to layers, and to each other: phones,
ESP32s, lights, projectors, haptics. A lint device is a room
**object, not a participant**:

- It has no canvas, no WebRTC stack, no fluid engine.
- It joins the room over the signaling WebSocket, like every client.
- Its peer id is prefixed `lint:` (mirroring the ghost's `ghost:`).
  Browsers never offer WebRTC to a `lint:` peer and never treat one
  as human presence.
- It receives **summaries** of room life, never raw streams, and it
  can send exactly **one** thing back: a touch.

## 2. Transport

All lint traffic rides inside the signaling socket's opaque `relay`
message (Hotfix 2.0 — see `server/signaling/README.md`):

```json
{ "type": "relay", "roomId": "<room>", "from": "<peerId>",
  "payload": { "fabric": "lint", "v": 0, "kind": "…" } }
```

The worker's relay discipline applies unchanged:

- The sender must have `join`ed the room it names; **`from` is
  stamped from the join attachment**, never trusted from the frame.
- Frames over **8 KB** are dropped; per-connection floods over
  **600 frames / 10 s** are dropped (silently, never a disconnect).
- The sender is **never echoed**.
- With no `to`, a relay frame goes to **all other joined members**
  of the room — browsers, lint, everyone. Receivers ignore payload
  shapes they don't know, so lint traffic is inert to older clients
  and interaction envelopes are inert to lint devices.
- Lint rides the **WebSocket room fabric, not the peer DataChannels**
  — an ESP32 has no WebRTC, and it doesn't need one.

### The dependency, stated plainly

Full lint relay requires the **Hotfix 2.0 worker extension
deployed** (PR #29 put its source in `server/signaling/`; deploy
steps are in that folder's README). Against the pre-2.0 worker,
`relay` is an unknown type and frames go nowhere — by design, the
same behavior-detection contract as the interaction relay.

Until the worker lands, the loop is still demonstrable with zero
hardware: **the bridge also publishes every frame to the in-app
`lintStore`**, and the in-app simulator (a true protocol client on
its own socket) renders those same-tab summaries as a *local
preview*, clearly badged. Its touch button reaches the canvas
through the same bridge handler (same gating code) via the local
path. Hardware has no local path — it speaks the socket protocol
or nothing.

## 3. Messages

All payloads carry `"fabric": "lint"` and `"v": 0`. Anything else
is not lint and must be ignored by lint consumers.

### 3.1 `lint-hello` — device → room

Sent right after `join`, and re-sent every ~20 s as a heartbeat
(bridges keep a device registry; late joiners learn who exists).

```json
{ "fabric": "lint", "v": 0, "kind": "lint-hello",
  "name": "Desk Lamp",
  "deviceKind": "light",
  "caps": ["glow", "pulse"],
  "hue": 265 }
```

| field       | meaning |
|---|---|
| `name`      | human label (≤ 40 chars by convention) |
| `deviceKind`| `light` \| `haptic` \| `display` \| `other` |
| `caps`      | capability verbs the device can render (free-form, ≤ 8) |
| `hue`       | the device's signature hue, degrees 0..359 — the color its touch paints |

### 3.2 `lint-frame` — bridge → room (broadcast)

One summarized room event. Always wrapped with a dedupe id:
`"<bridgePeerId>:<counter>"`.

```json
{ "fabric": "lint", "v": 0, "kind": "lint-frame",
  "id": "user-k7d2qx:41",
  "frame": { "kind": "verb", "verb": "heart", "hue": 343, "intensity": 1 } }
```

The `frame` object:

| field       | meaning |
|---|---|
| `kind`      | `verb` \| `note` \| `stroke-energy` \| `session` |
| `hue`       | degrees 0..359 — whose color this event is (see below) |
| `intensity` | 0..1 |
| `verb`      | kind=verb: the verb id (`heart`, `cheer`, `tickle`) |
| `note`/`midi` | kind=note: pitch name (`"C#4"`) and MIDI number when parseable |
| `mode`      | kind=session: the room's Slice 5 mode after the change |

Frame semantics:

- **verb** — a sensory verb landed in the room. `hue` is the
  sender's signature hue; `intensity` is the verb's pressure (1).
  Sent immediately, never batched.
- **note** — a piano/MIDI note the room heard. Note-on carries
  `intensity` = velocity; note-off is the same frame with
  `intensity` 0. `hue` is the **player's** signature hue — the
  protocol stays identity-true; devices that prefer pitch color
  derive it from `midi` (chromatic circle: `(midi mod 12) * 30 +
  15`). The firmware and the simulator both render notes by pitch.
- **stroke-energy** — the room's drawing, aggregated by the bridge:
  emitted **at most 10 Hz**, only while energy is present, plus one
  trailing `intensity: 0` frame when the room goes quiet.
  `intensity` is a 0..1 energy level; `hue` is the energy-weighted
  **dominant hue** (circular mean of recent stroke hues, ~0.5 s
  memory). Raw stroke points are **never** forwarded — a lamp does
  not need 120 points a second, and the relay's frame budget
  shouldn't carry them.
- **session** — the room's shape changed: mode flipped, host
  changed, or occupancy changed. `hue` is the host's hue when the
  event concerns a host (else the bridge's last dominant hue);
  `intensity` is occupancy scaled, `min(1, humanPeers / 4)`.

### 3.3 `lint-touch` — device → room

The device's one send. Its id is `"<lintPeerId>:<counter>"` for
dedupe (bridge keeps the last 64).

```json
{ "fabric": "lint", "v": 0, "kind": "lint-touch",
  "id": "lint:desk-lamp-9f3c2a:7", "x": 0.5, "y": 0.42, "hue": 265 }
```

`x`/`y` are normalized canvas coordinates — the position the device
**declares** for its touch (a lamp's pad is conceptually at one spot
on the canvas; richer devices may vary it per touch). On landing,
the touch becomes a pressure-1 splat in the device's hue, rendered
on every canvas — subject to the gating below.

## 4. The bridge

Summaries don't make themselves: room interactions travel
peer-to-peer over DataChannels, which the signaling worker cannot
see. So **a connected browser tab bridges**:

- The bridge consumes the exact taps the room client already has —
  its own sends at the `sendInteraction` funnel (post-gate),
  arrivals at `acceptRemote`, notes at `sendNote` and the note
  receive branch (`src/lint/lintBridge.ts`, taps in
  `useFluidMultiUser`).
- **Election:** among connected human clients (self + heard humans),
  the smallest peerId bridges. Everyone else stays off the wire. A
  departing bridge hands over to the next-smallest automatically;
  frame ids make any brief overlap harmless.
- **What never reaches lint:** ambient idle life (it never enters
  the transport funnel — local-only stays local) and **ghost**
  interactions (filtered by sender prefix — in v0 the ghost is a
  screen presence; objects hear *people*). A lint's own touch,
  re-broadcast under its `lint:` id, is likewise filtered, so a
  device can never hear its own touch summarized back.

## 5. Gating — lint under Slice 5 session modes

A lint device is a room object with a guest's rights, no more:

| | receives frames | its touch lands |
|---|---|---|
| open room / `collab` | yes | **yes** |
| `mirror` | yes | no — a guest's broadcast doesn't land either |
| `view` | yes | no — audience mode |
| `control` | yes | only if the lint were the current driver |

Receiving is never gated (everyone in the room, lint included,
witnesses the room). Sending is gated exactly as
`computeCanSend` gates a guest whose id is the lint's peer id:
in v0 a lint is never host and hosts cannot pass control to one
(the pass-control list is human announces), so the `control` row is
"no" in practice until a future slice lets a host hand a lint the
brush. A denied touch is dropped silently — the same silence a
guest's gated stroke gets.

Note the asymmetry on the bridge's side: touch injection rides the
*bridge's* `sendInteraction` under the lint's id (the ghost's
established proxy pattern). The lint's own gate is evaluated first,
in the bridge; the bridge's transport then stamps the lint's id and
sequence, and the local render shares the same object, so
`(userId, seq)` dedupe keeps the touch single on every screen.

## 6. The simulator

F menu → STUDIO — CREATE → **LINT — OBJECTS**: a virtual lamp
("Sim Lamp") that is a real `LintSocketClient` — its own socket,
its own `lint:sim-…` peer id, real hellos, real frames, a real
touch button. Its badge tells the truth about transport:
`LIVE · RELAY` when frames arrive over the socket, `LOCAL PREVIEW`
when only this tab's bridge summaries are reaching it (the
pre-worker state), `LOCAL ONLY` when signaling itself is local.
The whole golden loop — draw / verb / note on a phone → the orb
glows and the buzz bar jumps; tap the lamp's touch → a splat lands
on the canvas — is demoable with zero hardware.

## 7. Firmware

`firmware/lint_esp32/lint_esp32.ino` is the reference device:
ESP32-S3, Wi-Fi + WSS join, NeoPixel rendering of the frame
envelope (verbs pulse, notes flash pitch color, stroke-energy
glows, session changes breathe, a faint own-hue idle when
disconnected), and a capacitive touch pad that sends `lint-touch`.
Configuration (Wi-Fi, room, name, hue, pins) is one block at the
top; see that folder's README for wiring and setup.

## 8. Web Bluetooth — deliberately NOT in this slice

Bluetooth was scoped and **rejected for v0**, plainly:

- **Web Bluetooth is absent on iOS Safari** (and on iOS generally —
  every iOS browser is WebKit). Fabric's primary surface is phones;
  a BLE path that cannot exist on half of them cannot be the
  hardware story.
- It exists on Chrome desktop and Chrome for Android, so a BLE
  bridge is a legitimate **later slice, scoped to supporting
  browsers**, for peripherals that are only BLE (wearables, rings).
- v0 hardware rides the **WebSocket room fabric** instead: it works
  on every network the app itself works on, needs no pairing UX,
  and an ESP32-S3 speaks it natively (its radio does BLE too — the
  same firmware could grow a BLE transport later without touching
  the protocol in §3, which is deliberately transport-shaped).

## 9. Limits and honesty (v0)

- **Rooms are capabilities.** There is no per-device auth in v0:
  anyone who joins a room (its id is the share link) can hello as a
  lint and, in a collab room, touch it. That matches the room model
  the rest of Fabric already ships; device identity/auth is future
  work, and this doc won't pretend otherwise.
- The worker's relay bounds (8 KB, ~600 frames/10 s per connection)
  are the protocol's flood control; the bridge's aggregation
  (§3.2) keeps honest traffic far under them.
- Stroke-energy constants (contribution curve, ~0.5 s decay,
  intensity scale) are v0 tuning chosen by feel, marked in
  `lintBridge.ts` — expect them to move once real lamps are in
  real rooms.
