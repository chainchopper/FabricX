# Fabric — Multi‑Sensory Interactive Platform (Fanalogy)

Powered by Nirvana

Project Summary
Fabric is a multi‑user, game‑like space with a liquid 3D surface (“the Fabric”) that reacts to touch with coordinated haptics, audio, and visuals. Controls live in a retractable Locker (drawer) to keep the canvas clear. The Fabric is the main event and stays mounted while overlays come and go.

Current Stack (Expo Variant)
- Routing: expo-router (app/)
- UI: React Native primitives; overlays (Locker, User Drawer)
- Web: R3F FabricWeb3D and LegacyFluid (single-canvas authority)
- Multi-user: BroadcastChannel baseline (room-scoped), WebRTC planned
- Audio/Haptics: Web Audio + expo-haptics/Vibration
- Persistence: AsyncStorage
- AR (web): getUserMedia → VideoTexture via ARContext

What Exists Today
- Persistent Fabric (ExperienceRenderer on web; FabricCanvas on native)
- Locker + User Drawer (left-edge tabs) with “Powered by Nirvana”
- TouchParticles + fluid engines (LegacyFluid + FabricWeb3D surface)
- Experience system (default-fluid, ar-piano, camera-effects)
- SafetyBackground fallback and Diagnostics overlay
- useFluidMultiUser with WebRTC (preferred) and BroadcastChannel fallback
- Microcontroller Integration (ESP32, Arduino, etc.)
  - Web Serial API support for USB connections
  - WebSocket support for WiFi-connected devices
  - InputOrchestrator for device management
  - Sensor-to-fluid interaction mapping
  - ESP32-S3 Matrix firmware with OTA updates

Roadmap (Phased, Safe, Additive)
- Phase 1: Multi‑User WebRTC (data channels) with fallback ✓ COMPLETED
  - Create useWebRTC(roomId) hook (no heavy deps) ✓
  - Upgrade useFluidMultiUser to prefer WebRTC, fallback to BroadcastChannel ✓
  - Keep payloads small: { userId, position, force, pressure, color?, timestamp } ✓
  - Add connection status indicator in Diagnostics
- Phase 2: MIDI → Fluid (PARTIALLY COMPLETE)
  - Add useMIDIFluid(roomId) using Web MIDI (web only)
  - Map note→x, velocity→pressure/force, hue→color; dispatch via sendInteraction
  - Toggle in Experience controls; respect user audio prefs
- Phase 3: Enhanced Web Scene Integration
  - Keep single canvas; compose FabricWeb3D with particles and camera background
  - Expose minimal engine hooks (applySplatFromUser) and keep APIs stable
  - Add safe quality presets tied to device class
- Phase 4: Microcontroller Integration ✓ CORE COMPLETE
  - InputOrchestrator with device management ✓
  - Web Serial/WebSocket adapters ✓
  - Sensor-to-fluid mapping ✓
  - ESP32-S3 Matrix firmware with OTA ✓
  - Device Manager UI ✓
  - Testing on hardware (pending)
- Phase 5: Advanced Features (Future)
  - Bluetooth LE support
  - Multi-device coordination
  - Historical data storage & RAG integration
  - Analytics dashboard

Safety Rules (Non‑Negotiable)
- Preserve: R3F scene, LegacyFluid, Experience/AR/Overlay contexts, multi‑user baseline
- Never add another full‑screen canvas or cause app remounts
- Introduce new features alongside existing ones; default off or gated via experience
- Only small, focused changes; no heavy dependencies without approval

Contributor Workflow
- Before coding, verify if a feature already exists
- Additive code > invasive edits; maintain backwards compatibility
- Use overlays/drawers for UI; keep the Fabric canvas persistent
- Provide a quick test checklist in PR (FPS, multi‑user, MIDI, experience switches)
- Keep “Powered by Nirvana” visible in Credits/Locker

Sprint Plan (Next Two)
- Sprint A (Sync Foundations) ✓ COMPLETE
  - Implement useWebRTC(roomId) + Diagnostics readout ✓
  - Upgrade useFluidMultiUser to prefer WebRTC, fallback to BroadcastChannel ✓
  - Add connection indicator and error states
- Sprint B (MIDI + Fluid) PARTIAL
  - Implement useMIDIFluid(roomId) (web-only)
  - Add Locker controls to enable/disable MIDI mapping and set intensity
  - Validate MIDI → interaction mapping and multi‑user mirroring
- Sprint C (Microcontroller Integration) ✓ COMPLETE
  - Device infrastructure and adapters ✓
  - ESP32-S3 Matrix firmware ✓
  - Device Manager UI ✓
  - Sensor-to-fluid mapping ✓
  - Documentation ✓

Microcontroller Integration
Fabric now supports connecting physical devices (ESP32, Arduino, Raspberry Pi, etc.) to create interactive experiences:

**Supported Connections:**
- USB Serial (Web Serial API)
- WiFi/Network (WebSocket)
- Bluetooth LE (planned)

**Supported Boards:**
- ESP32-S3 (full support with firmware)
- ESP32 variants
- Arduino boards
- Raspberry Pi
- ARM-based boards
- Generic microcontrollers with serial/WiFi

**Features:**
- Real-time sensor data streaming (accelerometer, gyroscope, temperature)
- LED matrix control (WS2812/NeoPixel)
- Sensor-to-fluid interaction mapping
- Over-the-air (OTA) firmware updates
- WebSocket and Serial protocols
- Device discovery and management UI

**Quick Start:**
1. Flash firmware to ESP32-S3 Matrix (see `firmware/esp32-s3-matrix/`)
2. Open Device Manager in Fabric
3. Connect via USB or WiFi
4. Tilt/shake device to create fluid interactions
5. Control LEDs from Fabric touches

See `PROJECT_STATUS_REPORT.md` for comprehensive architecture details.

Acceptance Checklist
- Fabric does not unmount during navigation
- Interactions produce haptic/audio cues (based on preferences)
- Multi‑user sync works with WebRTC or falls back gracefully
- MIDI mapping works and can be toggled off
- Diagnostics shows Ready + status; Credits include “Powered by Nirvana”

Branding
- Fanalogy cyan/blue energy; unique favicon + OG meta tags (index.html)
- “Powered by Nirvana” in credits/overlays

Appendix: Terminology
- “Reset Experience” re-applies defaults
- “Switch Experience” transitions Experience (handles AR/camera state safely)