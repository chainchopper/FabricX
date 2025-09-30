# AGENTS

Overview
Fabric is delivered by coordinated agents with clear responsibilities and handoff rules. Each agent must follow AI_RULES.md and the Locker (retractable) UI paradigm.

Agents

1) Docs Agent
- Purpose: Maintain AI_RULES.md, AGENTS.md, README.md as the single source of truth
- Inputs: Product directives, branding guidelines
- Outputs: Up-to-date docs, migration notes, acceptance checklists
- Acceptance: Docs are current before any code change; mismatches flagged

2) UI/UX Agent
- Purpose: Implement game-like UI with a retractable Locker (no top nav)
- Inputs: Design tokens, branding, component specs
- Outputs: Drawer/Locker, overlays, control panels, toasts
- Acceptance: No persistent top nav; all controls retractable; “Powered by Nirvana” visible

3) 3D/Shader Agent
- Purpose: Liquid fabric shaders, R3F scene layout, visual feedback
- Inputs: Shader specs, customization variables
- Outputs: GLSL shaders, R3F components, uniform wiring
- Acceptance: Stable 60fps target on desktop; responsive to touch/connection uniforms

4) Realtime/WebRTC Agent
- Purpose: Low-latency data channels, signaling, multi-user touch events
- Inputs: Room IDs, user sessions
- Outputs: Connection lifecycle, touch propagation, connection events
- Acceptance: Join/offer/answer/ICE flows; resilient reconnect; minimal packet size

5) Audio/Haptics Agent
- Purpose: Web Audio (web), haptics/vibration (web/native), synchronized cues
- Inputs: Interaction events, connection events
- Outputs: Short synthesized audio cues, vibration patterns, expo-haptics triggers
- Acceptance: Non-blocking, low-latency feedback; user volume/respect device settings

6) Data/DB Agent
- Purpose: Tables with fabric_ prefix, migrations, RLS policies
- Inputs: Data models, access rules
- Outputs: SQL migrations, access layers
- Acceptance: No table deletions; policies applied; telemetry without PII

7) QA Agent
- Purpose: Enforce PR checklist; scenario coverage
- Inputs: Stories, requirements
- Outputs: Test plans, acceptance reports
- Acceptance: All rules in AI_RULES.md satisfied; performance and UX validated

Handoffs
- Docs Agent updates rules; UI/UX Agent implements Locker; 3D Agent integrates canvas; Realtime + Audio coordinate on events; DB Agent provides safe endpoints; QA blocks non-conforming PRs.

# Multi‑User Fluid Fabric Integration (Addendum)

Core Integration Strategy
- Keep the current R3F scene and Locker; add a WebGL fluid simulation as a React component (FluidFabric) that runs alongside.
- Use a FluidEngine class to host the reference fluid code, adapted for React lifecycle and resize.
- Maintain separate loops: FluidEngine.step (requestAnimationFrame/useFrame) and R3F render loop.

Critical Integration Points
- React wrapper: init/resize/cleanup; non‑blocking to main UI.
- Multi‑user: send only “splats” (x,y,force,color,timestamp); host can be authoritative.
- Prediction: apply local splats immediately; reconcile if host differs.
- Haptics/audio: tie splat pressure/velocity to cues.

Agent Handoffs
- 3D/Shader Agent: port reference GLSL + passes into FluidEngine methods.
- Realtime Agent: wire useFluidMultiUser hook to signaling; keep payloads minimal.
- Audio/Haptics Agent: map interactions to cues; respect preferences context.
- QA Agent: verify full‑screen + single canvas authority + perf guardrails; test overlays.

Pitfalls to Avoid
- Double‑canvas conflicts (only one full‑screen background authority).
- Z‑index/pointerEvents that block the canvas.
- Partial cleanups causing GPU leaks; always dispose framebuffers/programs on unmount.