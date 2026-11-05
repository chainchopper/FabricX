# Fabric

**You draw it. They feel it.**

Fabric is a live multiplayer sensory canvas. A touch drawn on one screen is
rendered on every other screen in the session as flowing fluid, synthesized
sound, and vibration — so a heart is not an emoji you tap; it is something you
draw and the other person feels. Every participant is accompanied by a
"ghostie," an on-device companion with its own name, color, and temperament
that perceives the canvas and acts on it alongside them. Fabric is a world of
standalone canvases ("fabrics") — among them a protein-folding fabric, The
Fold, where the phones in a session pool their compute on real molecular
structure work, verified shard by shard.

- **Live site:** https://fabric.fanalogy.com
- **Landing page:** https://fabric.fanalogy.com/welcome.html (source:
  `public/welcome.html` in this repo)

## Watch the demo

[![Fabric — 3-minute demo](https://img.youtube.com/vi/0tGyzgS9R3s/hqdefault.jpg)](https://youtu.be/0tGyzgS9R3s)

Fabric — 3-minute demo · Meta AI Developer Hackathon
Live: https://fabric.fanalogy.com · X post: https://x.com/iament/status/2118146431764554111

## Try it without installing anything

Open https://fabric.fanalogy.com on two phones (or a phone and a computer).
Both land in the same default room, and the session is live immediately —
no account, no install, no API key.

Things worth trying:

- **Draw together.** Touch on one screen ripples, sounds, and vibrates on
  the other, tinted with your signature color.
- **Talk to the ghostie.** Ask out loud — "show me your heartbeat," "make
  some sounds," "tickle" — it answers with acts it composes, not canned
  buttons, and its sounds are synthesized fresh each time.
- **The Dancer Stage.** A 3D stage where your ghostie is the performer,
  embodied in the built-in character.
- **The Fold.** Join a structure bounty and fold real proteins together —
  human hemoglobin (4HHB) and an AlphaFold insulin structure ship with the
  app. Your device appears as a small vehicle whose mobility grows with
  the work it has *verified*.
- **Ghostie Playground.** A fabric of the ghostie's own, where its full
  tool set is available and you can watch it work unprompted.
- **AR Piano and the other fabrics.** Each fabric is its own canvas with
  its own rules; open the fabrics gallery and switch.

One honest note: the ghostie's optional **on-device brain** (a real
language model that runs in the browser) downloads its weights the first
time you turn it on — about **700 MB** for the default tier, on Wi-Fi,
only after you say yes. Everything above works before and without that
download, and the app never asks you for an API key.

## Run it locally

Prerequisites: Node.js and npm. (The repo does not pin a Node version;
Node 20+ is a safe choice. The standalone signaling server in
`server/signaling/` declares Node ≥ 18.)

```bash
npm ci          # install exactly what the committed lockfile specifies
npm run dev     # Expo dev server (all targets); it prints a local URL + QR code
```

For the web app specifically:

```bash
npm run web             # dev server in the browser (usually http://localhost:8081)
npm run build:web       # static web export — the build that gets deployed
```

`npm run android` and `npm run ios` exist for the Expo native targets;
the shipped product, and the one this document describes, is the web
build.

## Configuration

Fabric runs fully with **no keys and no configuration** — the default
intelligence is on-device. Environment variables only *add* optional
tiers. Copy `.env.example` to `.env` to use any of them; these are the
variables the code actually reads:

| Variable | What it does |
|---|---|
| `EXPO_PUBLIC_SIGNALING_SERVER_URL` | Points the app at your own signaling relay (see below). Unset: the web app uses the built-in production relay; a localhost dev build stays in local mode. |
| `EXPO_PUBLIC_FANALOGY_LLM_API_KEY` | Turns on Fanalogy's built-in cloud tier. Production sets this on the hosting project behind a hard spend cap. **Not needed to run or evaluate the app.** |
| `EXPO_PUBLIC_FANALOGY_LLM_BASE_URL` | Cloud endpoint. Default: `https://api.meta.ai/v1` |
| `EXPO_PUBLIC_FANALOGY_LLM_MODEL` | Cloud model. Default: `muse-spark-1.3` |

`.env.example` also lists optional feature flags (AR camera, MIDI input,
WebRTC, an ESP32 device default, debug logging). A user can additionally
save *their own* model endpoint in the app's AI Services panel — a user's
own model always wins over the built-in cloud, and local/self-hosted
endpoints (for example a model server on your own network) are accepted.

`docs/AI.md` documents the full model-resolution order.

## How it works

**Stack.** One codebase: Expo 54 / React Native 0.81 / React 19,
TypeScript, Metro. The web build (react-native-web) is the deployed
target. 3D uses three.js via React Three Fiber; audio uses Tone.js and
the Web Audio API.

**Sessions and transport.** Browsers talk over WebRTC data channels.
Peers find each other through a small signaling relay — a Cloudflare
Worker backed by one Durable Object per room — whose source lives in
`server/signaling/` next to a plain Node implementation of the same
protocol. The app ships with the production relay baked in
(`wss://fabric-signaling.iaminc.workers.dev`). If a network blocks
peer-to-peer traffic, interaction frames can also relay through that
same worker; tabs in one browser can also sync over
BroadcastChannel. To run your own relay: `cd server/signaling && npm
install && npm start` (or deploy `worker.js` with the included
`wrangler.toml`), then set `EXPO_PUBLIC_SIGNALING_SERVER_URL` to its
`wss://` URL and rebuild. `server/signaling/README.md` has the details.

**Fabrics, layers, and the ghostie.** A *fabric* is a standalone canvas
with its own rules, modes, and tools — the fluid, the AR Piano, the
Dancer Stage, See, Camera Effects, The Fold, the Ghostie Playground.
A fabric's *layers* are the interface and tools it offers (drawing,
notes, camera, voice). A *ghostie* is each participant's companion: it
is born from the participant's LifePacket seed (a Game-of-Life pattern
that serves as their identity — see `src/identity/`), keeps a persistent
name and signature color, and *possesses* the loaded fabric through its
layers, acting with the fabric's own tools under the fabric's own rules.
It never produces words; it acts, draws, plays notes, and sounds — its
voice is a generative synthesizer, so the same act never sounds
identical twice.

**The Fold — verified compute.** The Fold turns a session into a small
distributed computer. Folding jobs are posted as bounties on a board and
split into shards (residue ranges of a structure). A device computes a
shard and submits a claim; **a claim counts only when the host
recomputes the shard and the resulting checksum matches** — that is the
only door to verified work, and the in-app currency (Juice) is paid
pro-rata for verified shards only. The structures are real: human
deoxyhemoglobin (4HHB, 574 residues, from RCSB) and the AlphaFold
prediction for human insulin (AF-P01308, 110 residues), served from
`public/structures/`. One honesty line, stated in the code as well:
the relaxation the room computes is a **deterministic demonstration
computation** — its checksum proves the specified work ran; it is not
a scientific folding prediction.

**Hardware (optional).** ESP32-S3 firmware for a physical LED-matrix
device lives under `firmware/`. No hardware is needed to evaluate
anything above.

## Meta AI in this project

- **Muse Spark (Meta Model API)** is the cloud deliberation tier:
  when a cloud model is configured, Spark deliberates for the ghostie
  and composes open-ended performances for the pattern composer
  (`muse-spark-1.3` via `https://api.meta.ai/v1`; see
  `src/ai/PatternComposer.ts` and `docs/AI.md`). With nothing
  configured, the on-device tiers below answer instead.
- **A Spark-distilled decision corpus.** The ghostie's decision
  behavior was taught with **3,383 scenario→decision pairs distilled
  from Muse Spark**, covering the possession model (a ghost acting
  through a fabric's layers), per-fabric tool rules and refusals,
  waveform sound-craft, and the Ghostie Playground. The corpus and the
  training pipeline live in Fanalogy's training workspace, **not in
  this repo**; this repo carries the decision schema, the strict
  validator every model answer must pass, and the in-browser decision
  floor the tiers fall back to.
- **SAM 3.1** powers segmentation for the **See** fabric (cloud SAM 3.1
  when a model is configured; on-device grounding otherwise) —
  natural commands like "touch the apple" are grounded to regions the
  ghostie can then act on (`src/sam/`).
- **On-device models (WebLLM / MLC over WebGPU).** Three named tiers,
  chosen in AI Services: **Ghostie 1B** (Llama 3.2 1B, ≈700 MB —
  the default), **Ghostie 1.5B** (Qwen 2.5 1.5B, ≈1 GB), and
  **Ghostie 3B** (Llama 3.2 3B, ≈1.8 GB). The runtime library loads
  from the esm.sh CDN at first use; weights download once, only after
  an explicit yes, are cached by the browser, and then work offline.
- **Muse Code**, Meta's coding agent, was used extensively in
  developing this project.

## Checks

The repo carries 43 headless check programs in `scripts/`, named
`*-check.mjs`. They run under Node — no browser, no device — and prove
behavior rather than eyeball it: the ghostie's voice articulation, the
canvas/chrome discipline, the Fold's verification door and camera rig,
the settings and naming law, the structure data's integrity, and more.
Run one from the repo root after `npm ci`:

```bash
node scripts/chrome-check.mjs
```

Most checks are self-contained like that; a few take pre-built bundles
as arguments, with the exact `esbuild` commands printed in the check
file's own header (for example `scripts/ghostvoice-check.mjs`).

An honest note so a full battery run doesn't surprise you: at this
commit, three checks carry pre-existing failures — `hotfix24-check`
(44 passed / 4 failed), `agent-answers-check` (31 passed / 4 failed),
and `cleanup2-check` (68 passed / 3 failed). The rest of the battery
passes.

## Repo layout

- `app/` — expo-router routes and screens.
- `src/` — the application itself: `ai/` (model resolution, composer,
  on-device brain), `ghost/` (the ghostie's brain, peer, voice, tools),
  `genx/` (The Fold: shards, structures, verification, bounty board
  data), `sam/` (See-layer segmentation), `identity/` (LifePacket /
  fDNA identity), `services/` (WebRTC, signaling, LLM, voice, devices),
  `session/`, `components/`, and the feature areas they serve.
- `server/signaling/` — the signaling relay: Node server, Cloudflare
  Worker, and its own README with deploy/self-host instructions.
- `public/` — static assets served with the app: `structures/` (the
  Fold's PDB files + index), `animations/` (the Dancer Stage
  character's animation data), `soundfonts/` (piano sample packs), and
  `welcome.html` (the landing page).
- `scripts/` — the headless check programs described above, plus their
  fixtures.
- `firmware/` — ESP32-S3 firmware for the optional physical device.
- `docs/` — `AI.md` (model defaults and resolution order), `DANCER.md`,
  `LINT.md`.

## Status

Built by **Fanalogy** (Terrell Hill) during the **Meta Global AI
Developer Hackathon, October 26 – November 4, 2026** (Startup track —
Build for Your World). Live at https://fabric.fanalogy.com.

No license file is included in this repo yet; all rights are reserved
by Fanalogy unless and until a license is added.
