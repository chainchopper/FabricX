# AGENTS

Overview
Fabric is the primary interactive canvas (the main event). All agents must preserve its persistence and treat UI as overlays above it. Page transitions must not remount the Fabric.

Agents

1) Docs Agent
- Keep AI_RULES.md, AGENTS.md, README.md aligned with the current plan and safety rules
- Maintain terminology: use "Reset Experience" and "Switch Experience" (never "background restart")
- Deliver phased roadmaps and concise test checklists per feature
- Acceptance: Docs updated each sprint with clear steps and guardrails

2) UI/UX Agent
- Implement overlays/drawers (Locker, User Drawer, Overlays) with minimal chrome
- No full-screen canvas duplication; maintain single-canvas authority
- Add video game-style menu interactions with sound effects and particle effects
- Implement smooth transitions and animations for all menu actions
- Acceptance: Fabric stays mounted; overlays animate in/out and auto-retract on Fabric interaction; video game feel achieved

3) 3D/Shader Agent
- Maintain R3F scene (FabricWeb3D), TouchParticles, and LegacyFluid engine
- Expose minimal, stable hooks (applySplatFromUser) for integrations
- Implement AR Piano 3D visualization and interactive keys
- Create particle effects for menu interactions
- Acceptance: 60fps target; quality presets; no performance regressions; AR Piano fully functional

4) Realtime/WebRTC Agent
- Introduce useWebRTC(roomId) data channels with fallback to BroadcastChannel
- Upgrade useFluidMultiUser to prefer WebRTC; minimal payloads; connection state monitoring
- Support swarm broadcasting for multi-device coordination
- Acceptance: multi-user splats sync; graceful reconnection; Diagnostics shows status; swarm mode operational

5) MIDI/Audio Agent
- Implement useMIDIFluid(roomId) mapping active notes → fluid interactions
- Respect audio/haptics preferences; keep mapping toggleable in controls
- Add menu sound effects system (hover, select, open, close, etc.)
- Integrate AR Piano MIDI output and synthesis
- Acceptance: MIDI triggers fluid/particles; intensity/quality adjustable; no audio glitches; menu sounds enhance UX

6) AR/Camera Agent
- Keep AR camera lifecycle tied to Experience capabilities (enable/disable on switch)
- VideoTexture correctness; smooth transitions with curtain fade
- AR Piano overlay with camera background
- Acceptance: camera/AR toggle is stable; no black frames; accurate capability cleanup; AR Piano accessible via 1-click

7) Input/Devices Agent
- Implement InputOrchestrator and adapters (Serial/WebSocket/Bluetooth)
- Define transformation rules → fabric outputs
- Add S3 Matrix bidirectional communication (gyro/accelerometer → effects, host → LED/vibration)
- Implement swarm node management and assignment
- Acceptance: Microcontroller integration complete; ESP32 firmware ready; UI functional; S3 Matrix works with AR Piano

**Status: ENHANCED IMPLEMENTATION** 🚀
- InputOrchestrator with device management ✓
- SerialAdapter (Web Serial API) ✓
- WebSocketAdapter (WiFi devices) ✓
- SensorToFluidMapper for data transformation ✓
- Device Manager UI (web & native stubs) ✓
- ESP32-S3 Matrix reference firmware ✓
- OTA update support ✓
- Comprehensive documentation ✓
- **NEW: Swarm capability with node assignment** ✓
- **NEW: Bidirectional S3 Matrix communication** ✓
- **NEW: AR Piano device integration** ✓
- Testing on hardware: In Progress

8) Social/Community Agent (NEW)
- Implement influencer-to-follower broadcasting system
- Create subscription management for multiple influencers
- Build device notification system (RGB, vibration, text patterns)
- Enable permanent device pairing (RX-only firmware lock)
- Acceptance: Followers receive live experiences; influencers can broadcast to swarms; subscription system works

9) Swarm Coordination Agent (NEW)
- Manage multiple S3 Matrix devices as coordinated nodes (1, 2, 3, 4...)
- Implement pattern synchronization across devices
- Enable text display across multiple matrices (one letter per node)
- Create ripple and wave effects across device swarms
- Acceptance: Multiple devices sync correctly; patterns coordinate; text displays span nodes; effects cascade properly

10) Marketplace/Layer SDK Agent (Future)
- Define LayerSDK surface for safe, sandboxed extensions
- Broadcast layer events via multi‑user manager; enforce permissions
- Acceptance: opt‑in, sandboxed, minimal core impact

11) Data/DB Agent
- Supabase usage follows Database Safety Protocol (RLS, least privilege)
- No table deletions; use fabric_ prefix for new tables; migrations only
- Store social subscriptions and swarm configurations
- Acceptance: security checklist satisfied; policies verified; social data persisted

12) QA Agent
- Enforce single-canvas authority; verify overlays never cause remounts
- Validate performance, branding ("Powered by Nirvana"), accessibility, and checklists
- Test menu sound effects and particle systems
- Validate AR Piano functionality with S3 Matrix
- Test swarm coordination with multiple devices
- Acceptance: All items in AI_RULES Testing Checklist pass; new features tested

Handoffs
- UI overlays consume Experience + Preferences contexts; Diagnostics surfaces status
- 3D exposes stable hooks to Realtime/MIDI adapters and AR Piano
- Realtime/WebRTC and MIDI work behind feature flags/toggles; fallbacks preserved
- Social/Swarm agents coordinate through WebRTC and device managers
- AR Piano integrates with S3 Matrix through device manager hooks

Addendum
- "Restart Background" is disallowed. Provide "Reset Experience".
- Diagnostics: use FabricDiagnostics to surface status and quick actions.
- Small, additive changes only; preserve backward compatibility.
- Video game menu feel: smooth animations, sound effects, particle feedback
- AR Piano: 1-click accessible, works with S3 Matrix gyro/buttons
- Swarm mode: coordinate multiple devices, display patterns and text
