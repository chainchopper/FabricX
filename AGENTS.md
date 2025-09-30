# AGENTS

Overview
Fabric is the primary interactive canvas (the main event). All agents must preserve its persistence and treat UI as overlays above it. Page transitions must not remount the Fabric.

Agents

1) Docs Agent
- Maintain AI_RULES.md, AGENTS.md, README.md reflecting Fabric-as-main-canvas
- Ensure terminology avoids “background restart”; use “Reset Experience” or “Switch Experience”

2) UI/UX Agent
- Implement game-like UI with a retractable Locker used for quick actions
- Core screens (Dashboard, Plugins, Profile, Studio) are overlays, not page navigations
- Acceptance: Fabric stays mounted; overlays never obstruct beyond intent

3) 3D/Shader Agent
- Maintain liquid fabric shaders and R3F scene layout
- Acceptance: 60fps target; responds to touch; never unmounts the canvas during UI flows

4) Realtime/WebRTC Agent
- Plan data channels for touch deltas; defer heavy deps
- Acceptance: Minimal payloads, resilient lifecycle

5) Audio/Haptics Agent
- Web Audio + Haptics with low latency; respect preferences toggles
- Acceptance: Non-blocking, synchronized cues

6) Data/DB Agent
- Tables with fabric_ prefix; RLS policies enforced
- Acceptance: No table deletions; least privilege

7) QA Agent
- Enforce Fabric persistence; overlays over page changes
- Validate performance, branding, and accessibility

Handoffs
- UI overlays consume Experience + Preferences contexts
- 3D engine exposes hooks for experience-driven parameters
- QA blocks any change that remounts the Fabric unnecessarily

Addendum
- “Restart Background” is disallowed. Provide “Reset Experience” (reapply config defaults) if recovery is needed.
- Diagnostics: use FabricDiagnostics to surface status and quick actions.