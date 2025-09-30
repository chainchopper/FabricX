# Fabric — Multi‑Sensory Interactive Platform (Fanalogy)

Powered by Nirvana

Project Summary
Fabric is a multi‑user, game‑like space with a liquid 3D surface (“the Fabric”) that reacts to touch with coordinated haptics, audio, and visuals. Controls live in a retractable Locker (drawer) to keep the canvas clear.

Authoritative Docs
- AI Rules: ./AI_RULES.md
- Agents: ./AGENTS.md

Design Principles
- No persistent top navigation; use a retractable “Locker” (drawer/sheet)
- Full‑screen, immersive primary canvas
- Multi‑sensory feedback for micro‑interactions
- Game UI aesthetic (glass, glow, depth), consistent branding
- Credits include “Powered by Nirvana”

Current Stack Status (Expo Variant)
- Routing: expo-router (app/)
- UI: React Native primitives; minimal deps
- Haptics: expo-haptics/Vibration
- Persistence: AsyncStorage
- Deep Link Scheme: fabric://

Planned Web Stack (requires approval)
- React Router, Tailwind CSS, shadcn/ui
- Three.js with React Three Fiber
- WebRTC and Web Audio

Fluid Fabric Architecture (Web)
- Canvas Authority: a single fixed full‑screen WebGL canvas (the Fabric) runs under all pages.
- R3F Scene: 3D overlays and effects render above the fluid; overlays remain transparent.
- FluidEngine: React‑friendly class that hosts the WebGL fluid simulation (reference implementation adapted).
- FluidFabric: React wrapper that mounts the engine, handles resize, and applies interactions.
- Multi‑User: transmit only “splats” (x,y,force,color); host can be authoritative; local prediction applies.

Integration Safety (checklist)
- [ ] Only one full‑screen background canvas; pages are transparent overlays
- [ ] Canvas uses fixed positioning and high‑performance WebGL context
- [ ] Overlays don’t block the Fabric (use pointerEvents/z‑index carefully)
- [ ] Proper GPU cleanup on unmount
- [ ] No heavy deps without prior approval

Loop‑avoidance guidance
- Verify if a feature already exists before editing (avoid re‑implementation).
- Make focused changes; refresh the preview; rollback if regressions appear.
- Keep the Fabric as the sole background—never add a second full‑screen background.
- Use an explicit full‑screen checklist (html/body/#root sizing, canvas fixed edges).
- Prefer incremental phases: wrapper → engine integration → sync → MIDI hookups.

Phased Roadmap
Phase 0 — Ground Truth (this PR)
- Add AI_RULES.md, AGENTS.md, README.md with Locker paradigm and rules
- Align roadmap; no heavy dependencies added

Phase 1 — Locker (Drawer) Implementation (Expo variant)
- Replace existing top nav with retractable Locker overlay
- Auto-hide on inactivity, toggle on intent
- Keep UI chrome off the main canvas

Phase 2 — Canvas Scaffolding
- Add placeholder Fabric canvas container (native/web)
- Provide hooks for haptic/audio visual cues

Phase 3 — Realtime Foundations
- Signaling service design
- WebRTC data channel API (web-first), native feasibility notes

Phase 4 — Liquid Fabric (Web)
- R3F pipeline + shader uniforms
- Connection glow + touch highlights

Phase 5 — Migration (If approved)
- Introduce Tailwind + shadcn/ui under src/
- Port screens and Locker to web stack

Branding
- Use Fanalogy colors (cyan/blue energy accents)
- OG tags, favicon (web)
- “Powered by Nirvana” in footer/credits overlays

Security & Data
- Use fabric_ table prefix
- Never delete existing tables
- Apply RLS policies for API access (Supabase)

Notes for Contributors
- Follow AI_RULES.md strictly
- Don’t add heavy deps or change versions without approval
- Prefer small, focused components/hooks
- Provide toasts and (where applicable) haptic feedback for user actions