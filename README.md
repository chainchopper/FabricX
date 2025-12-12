# Fabric — Multi‑Sensory Interactive Platform (Fanalogy)

**Powered by Nirvana** 🌟

## Project Summary

Fabric is a revolutionary multi‑user, game‑like platform with a liquid 3D surface ("the Fabric") that reacts to touch with coordinated haptics, audio, and visuals. Experience video game-style menus, AR Piano, swarm device coordination, and social broadcasting—all while the Fabric stays persistent as the main event.

---

## ✨ What's New

### 🎮 Video Game Menu System
- **Sound Effects**: Hover, select, open, close animations with professional audio feedback
- **Particle Effects**: Visual feedback on menu interactions
- **Smooth Animations**: Drawer transitions with haptic feedback
- **Tabbed Interface**: Controls, Social, and Swarm modes in one organized menu

### 🎹 AR Virtual Piano
- **Full 3D Piano**: Interactive keyboard with 3 octaves (C3-B5)
- **Real-time Synthesis**: Polyphonic Tone.js synth engine
- **S3 Matrix Integration**: 
  - Gyro/accelerometer controls volume and effects
  - Button presses send haptic feedback
  - LED feedback on key presses
- **1-Click Toggle**: Floating button to switch between Fluid and Piano modes
- **Visual Feedback**: Colored keys light up on press

### 📡 Swarm Mode (Multi-Device Coordination)
- **Node Assignment**: Coordinate multiple S3 Matrix devices as nodes (1, 2, 3, 4...)
- **Text Display**: Show words across devices (one letter per node)
- **Synchronized Effects**: Ripple and wave patterns across swarm
- **Broadcast Controls**: Send commands to all or specific nodes
- **Health Monitoring**: Real-time node status tracking

### 🌐 Social Broadcasting
- **Influencer-Follower System**: Subscribe to favorite creators
- **Live Experiences**: Receive personalized device notifications
- **Broadcast Events**: Creators send synchronized lighting, vibrations, and text
- **Subscription Management**: Follow/unfollow multiple influencers
- **Creator Mode**: Demo broadcasting to your followers

---

## Current Stack (Expo Variant)

- **Routing**: expo-router (app/)
- **UI**: React Native primitives with video game-style overlays
- **3D Graphics**: R3F FabricWeb3D and LegacyFluid (single-canvas authority)
- **Multi-user**: WebRTC data channels with BroadcastChannel fallback
- **Audio/Haptics**: Tone.js + Web Audio + expo-haptics/Vibration
- **Persistence**: AsyncStorage
- **AR**: getUserMedia → VideoTexture via ARContext
- **Devices**: Web Serial API, WebSocket, Bluetooth LE (planned)

---

## What Exists Today

### Core Features ✓
- **Persistent Fabric**: ExperienceRenderer on web; FabricCanvas on native
- **Modern Menu System**: Video game-style with sound effects and particles
- **Locker + Drawers**: Left-edge tabs with "Powered by Nirvana"
- **TouchParticles + Fluid Engines**: LegacyFluid + FabricWeb3D surface
- **Experience System**: default-fluid, ar-piano, camera-effects

### AR & Piano ✓
- **AR Piano Experience**: Full 3D interactive keyboard
- **AR Camera Overlay**: Live camera feed as background ✓ NEW
- **MIDI Integration**: External MIDI keyboard support ✓ NEW
- **Device Control**: S3 Matrix gyro/accelerometer integration
- **Quick Toggle**: Floating button for instant experience switching

### Device Integration ✓
- **Microcontroller Support**: ESP32, Arduino, Raspberry Pi, etc.
- **Web Serial API**: USB connections for devices
- **WebSocket**: WiFi-connected device support
- **InputOrchestrator**: Unified device management
- **Sensor Mapping**: Gyro/accelerometer → fluid interactions
- **ESP32-S3 Matrix Firmware**: Full featured with OTA updates

### Multi-Device Coordination ✓
- **Swarm Manager**: Coordinate multiple S3 Matrix devices
- **Node Assignment**: Assign devices as nodes 1, 2, 3, 4...
- **Pattern Sync**: Display synchronized patterns across devices
- **Text Display**: Show words spanning multiple matrices
- **Effect Broadcasting**: Ripple, wave, pulse across swarm

### Social Features ✓
- **Social Broadcast System**: Influencer-to-follower communication
- **Subscription Management**: Follow multiple creators
- **Live Notifications**: Device lights, vibrations, and patterns
- **Creator Tools**: Broadcasting interface for influencers
- **Event System**: Coordinated multi-sensory experiences

### Networking ✓
- **useWebRTC Hook**: Real-time data channels
- **useFluidMultiUser**: Multi-user fluid interactions
- **Connection Status**: Diagnostics with live monitoring
- **Fallback Support**: BroadcastChannel for local connections

---

## Complete Feature List

### User Interface
- ✅ Persistent Fabric canvas (single-canvas authority)
- ✅ Video game-style menu system
- ✅ Sound effects (hover, select, open, close, success, error)
- ✅ Particle effects on menu interactions
- ✅ Haptic feedback throughout
- ✅ Tabbed drawer interface (Controls, Social, Swarm)
- ✅ Quick experience toggle button
- ✅ Auto-hiding icon system
- ✅ Smooth animations and transitions

### Experiences
- ✅ Fluid Fabric (default) - Liquid 3D surface with touch interaction
- ✅ AR Piano - Full 3D keyboard with AR camera overlay ✓ NEW
- ✅ Camera Effects - Real-time filters and effects
- ⏳ Custom Experiences (via Layer SDK - future)

### Audio & Music
- ✅ Menu sound effects system
- ✅ Polyphonic piano synthesizer
- ✅ Ambient soundscapes
- ✅ Audio-reactive visualizations
- ✅ MIDI input support (keyboard, controllers) ✓ NEW
- ⏳ MIDI output routing (architecture ready)
- ⏳ Music controls and composition tools (planned)

### Device Integration
- ✅ ESP32-S3 Matrix support
- ✅ Web Serial API (USB)
- ✅ WebSocket (WiFi)
- ✅ Gyro/accelerometer input
- ✅ LED matrix output (8x8)
- ✅ Vibration control
- ✅ Two-button input
- ✅ OTA firmware updates
- ⏳ Bluetooth LE (planned)

### Swarm & Coordination
- ✅ Multi-device node system
- ✅ Broadcast messaging
- ✅ Targeted messaging
- ✅ Pattern synchronization
- ✅ Text display across devices
- ✅ Ripple and wave effects
- ✅ Health monitoring
- ⏳ RX-only firmware lock (UI pending)

### Social & Community
- ✅ Influencer registration
- ✅ Follower subscriptions
- ✅ Broadcast events
- ✅ Live notifications
- ✅ Creator tools
- ⏳ Social feed (UI complete, backend pending)
- ⏳ Event history and replay (planned)
- ⏳ Content moderation (planned)
- ⏳ Analytics dashboard (planned)

### Multi-user & Networking
- ✅ WebRTC data channels
- ✅ BroadcastChannel fallback
- ✅ Room-based sessions
- ✅ Real-time fluid sync
- ✅ Connection diagnostics
- ✅ Graceful reconnection

---

## Microcontroller Integration

Fabric supports physical devices to create tangible interactive experiences:

### Supported Connections
- **USB Serial** (Web Serial API)
- **WiFi/Network** (WebSocket)
- **Bluetooth LE** (planned)

### Supported Boards
- **ESP32-S3** (full support with firmware)
- ESP32 variants
- Arduino boards
- Raspberry Pi
- ARM-based boards
- Generic microcontrollers

### Features
- Real-time sensor streaming (accelerometer, gyroscope, temperature)
- LED matrix control (WS2812/NeoPixel)
- Sensor-to-fluid interaction mapping
- Over-the-air (OTA) firmware updates
- WebSocket and Serial protocols
- Device discovery and management UI

### Quick Start
1. Flash firmware to ESP32-S3 Matrix (see `firmware/esp32-s3-matrix/`)
2. Open Device Manager in Fabric
3. Connect via USB or WiFi
4. Tilt/shake device to create fluid interactions
5. Control LEDs from Fabric touches

See `PROJECT_STATUS_REPORT.md` for comprehensive architecture details.

---

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build:web

# Run on iOS
npm run ios

# Run on Android
npm run android
```

### Environment Configuration

Fabric uses environment variables for configurable endpoints and feature flags. Create a `.env` file in the project root (see `.env.example` for reference):

```bash
# WebRTC Signaling Server (for multi-user features)
EXPO_PUBLIC_SIGNALING_SERVER_URL=ws://localhost:8080
# Production: wss://your-signaling-server.com

# Feature Flags (optional)
# EXPO_PUBLIC_ENABLE_AR_CAMERA=true
# EXPO_PUBLIC_ENABLE_MIDI_INPUT=true
# EXPO_PUBLIC_ENABLE_WEBRTC=true

# Debug Settings (optional)
# EXPO_PUBLIC_DEBUG_MODE=false
# EXPO_PUBLIC_LOG_LEVEL=info
```

**Note**: The WebRTC signaling server is optional. When not available, Fabric automatically falls back to `BroadcastChannel` for local multi-tab communication. For production deployments, configure a proper signaling server URL.

### Using AR Piano

1. Click the floating toggle button (🎹 icon) or select "AR Piano" in the experience switcher
2. **Grant camera permission** for AR overlay (optional) ✓ NEW
3. Touch the piano keys on screen to play notes
4. **Connect MIDI keyboard** for external input (optional) ✓ NEW
5. Connect an S3 Matrix device for enhanced control:
   - Tilt device to modulate volume
   - Use buttons for haptic feedback
   - See LED feedback on key presses

**New Features:**
- **AR Camera Background**: Live camera feed displays behind the piano
- **MIDI Input**: Connect any MIDI keyboard for real-time playing
- **Visual Status**: Shows camera state and active MIDI notes

### Using Swarm Mode

1. Open NeoLocker drawer (☰ menu)
2. Switch to "Swarm" tab
3. Connect multiple S3 Matrix devices
4. Each device becomes a node (1, 2, 3, 4...)
5. Try:
   - **Display Text**: Type a word and watch it span across devices
   - **Sync All**: Synchronize all nodes
   - **Ripple Effects**: Trigger cascading patterns

### Using Social Features

1. Open NeoLocker drawer
2. Switch to "Social" tab
3. Subscribe to featured creators
4. Try broadcasting (creator demo)
5. Your connected devices will light up when creators send events

---

## Architecture

### Core Principles
- **Single Canvas Authority**: Fabric canvas never unmounts
- **Additive Features**: New features alongside existing ones
- **Modular Design**: Hook-based architecture
- **Event-Driven**: Real-time coordination
- **Safety First**: No breaking changes, backwards compatible

### Key Hooks
- `useMenuSounds()` - Video game menu audio
- `useSwarmManager()` - Multi-device coordination
- `useSocialBroadcast()` - Influencer broadcasting
- `useFluidMultiUser()` - Multi-user fluid sync
- `useWebRTC()` - Real-time data channels
- `useDeviceManager()` - Physical device integration
- `useExperience()` - Experience switching
- `useHaptics()` - Tactile feedback
- `useAudioCues()` - Sound effects

### Component Structure
```
app/
├── components/
│   ├── neo/                    # Modern drawer system
│   │   ├── NeoLocker.tsx       # Main menu drawer
│   │   ├── SwarmControlDrawer.tsx  # Swarm coordination
│   │   ├── SocialFeedDrawer.tsx    # Social features
│   │   └── ...
│   ├── QuickExperienceToggle.tsx  # Floating toggle
│   └── ...
src/
├── components/
│   ├── menu/
│   │   └── MenuParticles.tsx   # Particle effects
│   ├── piano/
│   │   └── ARPianoExperience.tsx  # AR Piano
│   └── ...
├── hooks/
│   ├── useMenuSounds.ts        # Menu audio
│   ├── useSwarmManager.ts      # Swarm coordination
│   ├── useSocialBroadcast.ts   # Social features
│   └── ...
```

---

## Roadmap

### Completed ✓
- ✅ Multi-user WebRTC with fallback
- ✅ Microcontroller integration (ESP32)
- ✅ Video game menu system
- ✅ AR Piano experience
- ✅ Swarm device coordination
- ✅ Social broadcasting system
- ✅ Device Manager UI
- ✅ Experience switching
- ✅ Sound effects and haptics

### In Progress ⏳
- ⏳ MIDI input/output routing
- ⏳ AR camera overlay for piano
- ⏳ RX-only firmware lock
- ⏳ Hardware testing with multiple devices
- ⏳ Performance optimization
- ⏳ Cross-platform testing

### Planned 📋
- 📋 Bluetooth LE device support
- 📋 Layer SDK for custom experiences
- 📋 Social feed with persistent storage
- 📋 Event history and replay
- 📋 Content moderation tools
- 📋 Analytics dashboard
- 📋 Marketplace for experiences
- 📋 Creator monetization tools

---

## Safety Rules

### Non-Negotiable
- ✅ Preserve R3F scene, LegacyFluid, contexts
- ✅ Never add another full-screen canvas
- ✅ No app remounts during navigation
- ✅ Features default off or gated
- ✅ Small, focused changes only
- ✅ No heavy dependencies without approval

### Database Safety
- ✅ NEVER delete existing tables
- ✅ Use `fabric_` prefix for new tables
- ✅ RLS policies for all tables
- ✅ Migrations only for schema changes
- ✅ Least privilege access

---

## Contributing

1. Verify feature doesn't already exist
2. Use additive code over invasive edits
3. Maintain backwards compatibility
4. Use overlays/drawers for UI
5. Keep Fabric canvas persistent
6. Include test checklist in PR
7. Maintain "Powered by Nirvana" branding

### Testing Checklist
- [ ] 60fps maintained
- [ ] Multi-user sync works
- [ ] MIDI triggers correctly
- [ ] Experience switches smoothly
- [ ] Devices connect properly
- [ ] Swarm coordination functions
- [ ] Social features operational
- [ ] Sound effects play correctly
- [ ] Haptics feel appropriate
- [ ] No memory leaks
- [ ] Cross-platform compatibility

---

## Documentation

- **README.md** (this file) - Complete feature overview and getting started
- **IMPLEMENTATION_GUIDE.md** - Developer guide with API reference and examples
- **IMPLEMENTATION_SUMMARY.md** - Executive summary of implementation
- **HARDWARE_TESTING_GUIDE.md** - Comprehensive hardware testing procedures ✓ NEW
- **AGENTS.md** - Agent responsibilities and handoffs
- **AI_RULES.md** - Development guidelines and stack details
- **MICROCONTROLLER_GUIDE.md** - Device integration guide
- **PROJECT_STATUS_REPORT.md** - Comprehensive architecture
- **firmware/esp32-s3-matrix/README.md** - Firmware documentation

---

## Support & Community

- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions
- **Discord**: Coming soon
- **Twitter**: Follow for updates

---

## License

[Add license information]

---

## Acknowledgments

**Powered by Nirvana** - AI-assisted development platform

Built with love by the Fanalogy team and the open source community.

---

## Tech Stack Summary

- **Frontend**: React + React Native (Expo)
- **3D Graphics**: Three.js + React Three Fiber
- **Audio**: Tone.js + Web Audio API
- **Networking**: WebRTC + WebSocket
- **Devices**: Web Serial API + ESP32 firmware
- **UI**: Custom game-style components
- **State**: React Hooks + Context
- **Routing**: Expo Router
- **Storage**: AsyncStorage + Supabase (planned)

---

**Ready to weave reality together? Start with `npm run dev` and explore the Fabric! 🌈✨**
