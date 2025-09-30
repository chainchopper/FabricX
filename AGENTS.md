# AGENTS

Overview
Fabric is the primary interactive canvas (the main event). All agents must preserve its persistence and treat UI as overlays above it. Page transitions must not remount the Fabric.

Agents

1) Docs Agent
- Keep AI_RULES.md, AGENTS.md, README.md aligned with the current plan and safety rules
- Maintain terminology: use “Reset Experience” and “Switch Experience” (never “background restart”)
- Deliver phased roadmaps and concise test checklists per feature
- Acceptance: Docs updated each sprint with clear steps and guardrails

2) UI/UX Agent
- Implement overlays/drawers (Locker, User Drawer, Overlays) with minimal chrome
- No full-screen canvas duplication; maintain single-canvas authority
- Acceptance: Fabric stays mounted; overlays animate in/out and auto-retract on Fabric interaction

3) 3D/Shader Agent
- Maintain R3F scene (FabricWeb3D), TouchParticles, and LegacyFluid engine
- Expose minimal, stable hooks (applySplatFromUser) for integrations
- Acceptance: 60fps target; quality presets; no performance regressions

4) Realtime/WebRTC Agent
- Introduce useWebRTC(roomId) data channels with fallback to BroadcastChannel
- Upgrade useFluidMultiUser to prefer WebRTC; minimal payloads; connection state monitoring
- Acceptance: multi-user splats sync; graceful reconnection; Diagnostics shows status

5) MIDI/Audio Agent
- Implement useMIDIFluid(roomId) mapping active notes → fluid interactions
- Respect audio/haptics preferences; keep mapping toggleable in controls
- Acceptance: MIDI triggers fluid/particles; intensity/quality adjustable; no audio glitches

6) AR/Camera Agent
- Keep AR camera lifecycle tied to Experience capabilities (enable/disable on switch)
- VideoTexture correctness; smooth transitions with curtain fade
- Acceptance: camera/AR toggle is stable; no black frames; accurate capability cleanup

7) Input/Devices Agent (Future)
- Scaffold InputOrchestrator and adapters (Bluetooth/Serial/WebSocket/Camera/Biometrics)
- Define transformation rules → fabric outputs; no heavy deps without approval
- Acceptance: additive scaffolding only; disabled by default; no regressions

8) Marketplace/Layer SDK Agent (Future)
- Define LayerSDK surface for safe, sandboxed extensions
- Broadcast layer events via multi‑user manager; enforce permissions
- Acceptance: opt‑in, sandboxed, minimal core impact

9) Data/DB Agent
- Supabase usage follows Database Safety Protocol (RLS, least privilege)
- No table deletions; use fabric_ prefix for new tables; migrations only
- Acceptance: security checklist satisfied; policies verified

10) QA Agent
- Enforce single-canvas authority; verify overlays never cause remounts
- Validate performance, branding (“Powered by Nirvana”), accessibility, and checklists
- Acceptance: All items in AI_RULES Testing Checklist pass

Handoffs
- UI overlays consume Experience + Preferences contexts; Diagnostics surfaces status
- 3D exposes stable hooks to Realtime/MIDI adapters
- Realtime/WebRTC and MIDI work behind feature flags/toggles; fallbacks preserved

Addendum
- “Restart Background” is disallowed. Provide “Reset Experience”.
- Diagnostics: use FabricDiagnostics to surface status and quick actions.
- Small, additive changes only; preserve backward compatibility.