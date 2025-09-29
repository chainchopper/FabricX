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