# AI Development Rules for Project Fabric

Project Identity
- Company: Fanalogy
- AI Stack: “Powered by Nirvana” (must appear in footer/credits)
- Project: Fabric — Multi‑sensory interactive platform (game‑like feel, minimal chrome)

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
- UI components: React Native primitives; no shadcn/ui/Tailwind (unless approved); style with inline or StyleSheet only
- 3D: Postpone R3F on native; plan for web canvas parity first
- Haptics: expo-haptics; Vibration API fallback
- Realtime: WebRTC planning only; no heavy deps without approval
- Do not add heavy dependencies or change package versions unless explicitly requested

Project Structure (Web Target)
src/
  components/          # Reusable UI components
  pages/               # Route pages
  hooks/               # Custom hooks
  utils/               # Utilities
  types/               # TypeScript types
  services/            # API + integrations (WebRTC, signaling)
  contexts/            # Global state contexts
  assets/              # Static assets
  styles/              # Global styles/Tailwind config

Expo Variant Structure (Current)
app/                   # expo-router routes
  _layout.tsx
  index.tsx
  ...
app/components         # UI components
app/hooks              # Hooks
app/context            # Context providers
app/utils              # Utilities
assets/                # Static assets

UI/UX Principles (Authoritative)
- No persistent top navigation. Use a retractable “Locker” (drawer/sheet) that:
  - Auto‑hides on inactivity
  - Opens on user intent/edge gesture/button
  - Never obstructs the main interactive surface
- Primary canvas (the “Fabric”) is full‑screen, immersive, and game‑like
- Micro‑interactions are multi‑sensory: coordinated visual/haptic/audio cues
- Buttons, cards, and panels adopt game UI aesthetics (glass, depth, glow); avoid webby chrome
- “Powered by Nirvana” must appear consistently in credits/footer overlays

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
- Enforce RLS when using Supabase (select/insert/update/delete policies)

Component Development Rules
- Web target: pages in src/pages, components in src/components
- Update src/App.tsx routes when adding new pages (web)
- Main page is src/pages/Index.tsx (web)
- Use shadcn/ui components (unmodified) on web; create new components for customization
- Type all props using interfaces
- Expo variant: keep routes in app/, components in app/components, minimal changes, and no heavy deps until migration is approved

Available Packages (Web)
- lucide-react
- shadcn/ui + Radix UI
- Three.js, @react-three/fiber, @react-three/drei
- Tailwind CSS
- react-router-dom

Migration Guidance (Web Approval Required)
- Introduce Tailwind + shadcn/ui scaffolding under src/
- Scaffold R3F canvas + shader system for liquid fabric
- Implement WebRTC signaling + data channels
- Preserve game‑like UI with Locker drawer (Radix Sheet/Dialog)

PR Checklist (reject anything that fails)
- No persistent top nav; Locker/Drawer only
- Full TypeScript typing (no implicit any)
- No heavy deps added without approval
- “Powered by Nirvana” present
- DB operations use fabric_ prefixes and RLS (if applicable)
- Web components follow shadcn/ui + Tailwind; Expo variant follows RN primitives
- All user interactions provide toasts/haptics where appropriate

Directory names MUST be all lower-case (src/pages, src/components, etc.). File names may use mixed-case if you like.

# Multi‑User Fluid Fabric Integration (Blueprint)

Core Integration Strategy
- Preserve existing React + Three.js architecture; inject a WebGL fluid simulation as its own component.
- Keep separate render loops: fluid simulation (WebGL) and 3D scene (R3F) layered together.
- Synchronize multi‑user interactions by sending compact “splat events” (position/force/color), not full simulation state.

Critical Integration Points
1) React wrapper lifecycle
- Initialize WebGL on mount; dispose GPU resources on unmount.
- React to size changes and customization updates.

2) Multi‑user synchronization
- Transmit only deltas (splats); host is authoritative if needed.
- Apply client‑side prediction locally; reconcile when host confirms.

3) Audio/Haptics coordination
- Map MIDI/audio events to splats (color/force).
- Trigger haptics on local high‑pressure interactions.

Integration Safety Rules (Preserve Existing Code)
- Do not delete/replace existing R3F components or the Locker.
- Add FluidEngine alongside; wrap with FluidFabric; connect via hooks/contexts.
- Maintain backward compatibility for current pages/overlays.

Testing Checklist
- [ ] Fluid responds to mouse/touch
- [ ] Multi‑user splats appear across sessions
- [ ] MIDI can trigger splats
- [ ] 3D overlays still render above fluid
- [ ] Customization toggles affect fluid
- [ ] No perf regression; canvas remains full‑screen

Loop‑avoidance Playbook (to prevent regressive fixes)
- Single background authority: one canvas layer is responsible for filling the viewport (fixed; z‑index 0). All pages are transparent overlays above it.
- No double‑canvas: never mount a second full‑screen background; check before adding.
- Full‑screen checklist (web):
  - html, body, #root at 100% height/width, transparent background
  - Canvas: position: fixed; top/left/right/bottom: 0; touch‑action: none
  - Prefer powerPreference: "high-performance" in WebGL context
- Before changing code: verify if the feature already exists; avoid re‑implementing.
- Make one change at a time; refresh; revert on regressions.
- Keep overlays non‑blocking (pointerEvents as needed) and use z‑indices consistently.