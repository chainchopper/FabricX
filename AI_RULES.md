# AI Development Rules for Project Fabric

Project Identity
- Company: Fanalogy
- AI Stack: “Powered by Nirvana” (must appear in footer/credits)
- Project: Fabric — Multi‑sensory interactive platform (game‑like feel, minimal chrome)

Principle: Fabric Is The Main Event
- The Fabric canvas is the primary interactive surface, not a mere background.
- It is persistent and always on by default (default-fluid), only changing when a different experience is loaded.
- All UI should respect the Fabric as the focal point; overlays are layered above it.

Canonical Technical Stack (Web)
- TypeScript strictly
- React Router with routes in src/App.tsx
- shadcn/ui (with Radix UI) for accessible primitives
- Tailwind CSS for styling
- Three.js with React Three Fiber (R3F) for 3D/WebGL
- WebRTC (data channels) for real‑time
- Web Audio API for sound
- Vibration API for haptic feedback

Current App Stack (Expo Variant) — Mapping
- Routing: expo-router (app/ directory) maps to React Router routes
- UI components: React Native primitives; style with inline/StyleSheet
- 3D: On web, Fabric renders persistently (LegacyFluid or R3F). Native uses ripple canvas.
- Haptics: expo-haptics; Vibration API fallback
- Realtime: WebRTC planning only; no heavy deps without approval

Interaction Pattern (Authoritative)
- No persistent top nav. Use a retractable Locker (drawer) for quick actions only.
- Pages should not trigger app-level remounts. Prefer overlays and dynamic loading for content like Dashboard, Plugins, Profile, Studio.
- The Fabric must never unmount during normal navigation. Treat it as a single-canvas authority.

Naming/Actions
- Avoid “background restart”. The correct concept is “Reset Experience” (reapply defaults) or “Switch Experience”.
- Diagnostics components should be named “FabricDiagnostics”, not “BackgroundDiagnostics”.

Branding Requirements
- Include “Powered by Nirvana” in the footer/credits
- Use Fanalogy branding colors and logo (cyan/blue energy accents)
- Unique Fabric favicon on web
- OG meta tags with Fabric description on web
- Keep branding consistent across all components

Database Safety Protocol
- NEVER delete existing tables
- Use unique table prefixes: fabric_
- Include project identifiers in all operations
- Verify table existence before operations
- Use proper migrations for schema changes
- Enforce RLS when using Supabase

Component Development Rules
- Web target: pages in src/pages, components in src/components
- Update src/App.tsx routes when adding new pages (web)
- Main page is src/pages/Index.tsx (web)
- Use shadcn/ui components (unmodified) on web; create new components for customization
- Type all props using interfaces
- Expo variant: keep routes in app/, components in app/components; prefer overlays to avoid remounts

UI/UX Principles
- Primary canvas (“Fabric”) is full-screen, immersive, and game-like
- Overlays are seamless; avoid page changes for core flows
- Micro-interactions are multi-sensory (visual/haptic/audio cues)
- Game UI aesthetic; avoid heavy chrome
- Credits overlay must include “Powered by Nirvana”

Loop‑avoidance Playbook
- Single canvas authority. Do not mount another full-screen canvas.
- Ensure html/body/root are 100%; canvas fixed to viewport; high-performance WebGL
- Overlays non-blocking and z-index consistent