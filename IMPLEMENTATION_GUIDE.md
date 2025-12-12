# FabricX Implementation Guide

## New Features Implementation Guide

This document provides detailed implementation guidance for the latest FabricX features.

---

## 1. Video Game Menu System

### Overview
The video game menu system provides professional-grade audio feedback, particle effects, and smooth animations for all menu interactions.

### Components

#### useMenuSounds Hook
Location: `src/hooks/useMenuSounds.ts`

```typescript
import { useMenuSounds } from '../src/hooks/useMenuSounds';

function MyComponent() {
  const sounds = useMenuSounds(true); // Enable sounds
  
  return (
    <button
      onMouseEnter={() => sounds.playHover()}
      onClick={() => sounds.playSelect()}
    >
      Click Me
    </button>
  );
}
```

**Available sounds:**
- `playHover()` - Subtle tone on hover
- `playSelect()` - Confirmation on selection
- `playOpen()` - Ascending chord for opening
- `playClose()` - Descending chord for closing
- `playSwitch()` - Quick transition sound
- `playError()` - Error notification
- `playSuccess()` - Success confirmation
- `playNotification()` - Alert sound

#### MenuParticles Component
Location: `src/components/menu/MenuParticles.tsx`

```typescript
import MenuParticles from '../src/components/menu/MenuParticles';

function MyMenu() {
  const [emitters, setEmitters] = useState([
    {
      id: 'button1',
      position: [0, 0, 0],
      color: '#22d3ee',
      active: true,
    }
  ]);
  
  return <MenuParticles emitters={emitters} />;
}
```

### Integration Example

```typescript
import { useMenuSounds } from '../src/hooks/useMenuSounds';
import { useHaptics } from '../app/hooks/useHaptics';

function GameMenuItem({ label, onClick }) {
  const sounds = useMenuSounds();
  const haptics = useHaptics();
  
  const handleClick = () => {
    sounds.playSelect();
    haptics.impactMedium();
    onClick?.();
  };
  
  return (
    <button
      onMouseEnter={() => sounds.playHover()}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
```

---

## 2. AR Virtual Piano

### Overview
Full 3D interactive piano keyboard with S3 Matrix device integration.

### Component
Location: `src/components/piano/ARPianoExperience.tsx`

### Basic Usage

```typescript
import ARPianoExperience from '../src/components/piano/ARPianoExperience';

function MyApp() {
  const handleKeyPress = (note, velocity) => {
    console.log(`Played ${note} at velocity ${velocity}`);
  };
  
  return (
    <ARPianoExperience
      onKeyPress={handleKeyPress}
      deviceId="esp32-device-id" // Optional S3 Matrix device
      enableARCamera={true}       // Enable camera background
      enableMIDIInput={true}       // Enable MIDI keyboard
    />
  );
}
```

### AR Camera Integration

The AR Piano now supports camera background overlay:

**Configuration:**
```typescript
{
  specific: {
    enableARCamera: true,  // Enables camera feed as background
    cameraFeed: true,      // Legacy setting
  }
}
```

**Features:**
- Camera feed rendered as 3D scene background
- Automatic initialization when piano loads
- Enhanced lighting for AR mode
- Smooth transitions
- Status indicator showing camera state

**Camera Controls:**
- Automatically requests camera permission
- Initializes on experience load
- Cleans up on experience switch
- Error handling with user feedback

### MIDI Input Support

Full MIDI keyboard integration is now available:

**Configuration:**
```typescript
{
  specific: {
    enableMIDIInput: true,  // Enable MIDI keyboard support
    midiEnabled: true,      // Legacy setting
  }
}
```

**Features:**
- Real-time MIDI note detection
- Sustain pedal support
- Velocity-sensitive playback
- Visual feedback on virtual piano
- Device LED coordination

**MIDI Capabilities:**
- Supports all MIDI controllers
- Note on/off detection
- Velocity mapping
- Control change support (sustain pedal)
- Automatic note-to-key mapping

### Device Integration

The AR Piano automatically integrates with connected S3 Matrix devices:

**Inputs from device:**
- **Gyro X**: Modulates synthesizer volume
- **Gyro Y**: Reserved for future effects
- **Gyro Z**: Camera rotation effect
- **Button 1**: Triggers short haptic feedback on device
- **Button 2**: Triggers long haptic feedback on device

**Outputs to device:**
- **LED Matrix**: Shows color-coded key presses
- **Vibration**: Haptic feedback patterns

### Switching to Piano Mode

```typescript
import { useExperience } from '../app/context/ExperienceContext';

function PianoToggle() {
  const { switchExperience } = useExperience();
  
  return (
    <button onClick={() => switchExperience('ar-piano')}>
      Switch to AR Piano
    </button>
  );
}
```

Or use the quick toggle component:

```typescript
import QuickExperienceToggle from '../app/components/QuickExperienceToggle';

// This component automatically appears when in fluid or piano mode
<QuickExperienceToggle />
```

---

## 3. Swarm Mode (Multi-Device Coordination)

### Overview
Coordinate multiple S3 Matrix devices as synchronized nodes.

### Hook
Location: `src/hooks/useSwarmManager.ts`

### Basic Usage

```typescript
import { useSwarmManager } from '../src/hooks/useSwarmManager';

function SwarmControl() {
  const {
    nodes,
    displayWord,
    createRippleEffect,
    broadcast,
    syncAll
  } = useSwarmManager();
  
  // Display word across devices
  const handleDisplayWord = () => {
    displayWord('HELLO', {
      color: { h: 180, s: 100, v: 255 },
      duration: 5000
    });
  };
  
  // Create ripple effect from node 1
  const handleRipple = () => {
    createRippleEffect(1, { h: 120, s: 100, v: 255 }, 150);
  };
  
  return (
    <div>
      <p>Connected nodes: {nodes.length}</p>
      <button onClick={handleDisplayWord}>Display HELLO</button>
      <button onClick={handleRipple}>Ripple from Node 1</button>
      <button onClick={syncAll}>Sync All Nodes</button>
    </div>
  );
}
```

### Registering Nodes

```typescript
const { registerNode } = useSwarmManager();

// Register a device as node 1
registerNode('device-id-123', 1, {
  isRXOnly: false, // Can be unregistered
  capabilities: ['led', 'vibrate', 'sensor']
});

// Register RX-only node (permanent)
registerNode('device-id-456', 2, {
  isRXOnly: true // Cannot be unregistered
});
```

### Broadcasting to Nodes

```typescript
// Broadcast to all nodes
broadcast('setColor', {
  color: { h: 180, s: 100, v: 255 },
  duration: 3000
});

// Send to specific nodes
sendToNodes([1, 3, 5], 'vibrate', {
  pattern: [100, 50, 100, 50, 100],
  intensity: 200
});
```

### Custom Patterns

```typescript
const pattern = [
  {
    nodeNumber: 1,
    display: [[1,0,1,0,1,0,1,0],...], // 8x8 LED matrix
    color: { h: 0, s: 100, v: 255 },
    duration: 2000
  },
  {
    nodeNumber: 2,
    display: [[0,1,0,1,0,1,0,1],...],
    color: { h: 120, s: 100, v: 255 },
    duration: 2000
  }
];

displayPattern(pattern);
```

---

## 4. Social Broadcasting

### Overview
Influencer-to-follower system with live device notifications.

### Hook
Location: `src/hooks/useSocialBroadcast.ts`

### Basic Usage

```typescript
import { useSocialBroadcast } from '../src/hooks/useSocialBroadcast';

function SocialFeatures() {
  const {
    manager,
    currentUser,
    subscribe,
    broadcast,
    getInfluencerStats
  } = useSocialBroadcast();
  
  // Subscribe to influencer
  const handleSubscribe = () => {
    subscribe(currentUser.id, 'influencer-id-123');
  };
  
  // Broadcast event (as influencer)
  const handleBroadcast = () => {
    broadcast('influencer-id-123', {
      type: 'custom',
      title: 'Live Event!',
      message: 'Hello fans!',
      effects: {
        color: { h: 180, s: 100, v: 255 },
        pattern: 'pulse',
        vibration: [100, 50, 100],
        duration: 5000
      }
    });
  };
  
  return (
    <div>
      <button onClick={handleSubscribe}>Subscribe</button>
      <button onClick={handleBroadcast}>Broadcast</button>
    </div>
  );
}
```

### Registering Users

```typescript
// Register as influencer
manager.registerInfluencer({
  id: 'inf-123',
  username: 'FabricMaster',
  displayName: 'Fabric Master',
  avatar: 'https://...',
  followerCount: 0,
  verified: false
});

// Register as follower
manager.registerFollower({
  id: 'follower-456',
  username: 'FabricFan',
  deviceIds: ['device-1', 'device-2'],
  subscriptions: [],
  preferences: {
    notifications: true,
    vibrations: true,
    ledEffects: true
  }
});
```

### Broadcast Events

```typescript
// Simple notification
broadcast('influencer-id', {
  type: 'tweet',
  title: 'New Tweet!',
  message: 'Check out my latest post',
  effects: {
    color: { h: 200, s: 100, v: 255 },
    pattern: 'pulse',
    duration: 3000
  }
});

// Custom experience
broadcast('influencer-id', {
  type: 'custom',
  title: 'Special Event',
  message: 'LIVE NOW',
  effects: {
    color: { h: 0, s: 100, v: 255 },
    pattern: 'text', // Display as text
    vibration: [200, 100, 200, 100, 200],
    duration: 10000
  }
});
```

### Personal Messages

```typescript
// Send to specific follower
sendPersonal(
  'influencer-id',
  'follower-id',
  'Thanks for your support!',
  {
    color: { h: 60, s: 100, v: 255 },
    pattern: 'wave',
    vibration: [100, 50, 100],
    duration: 5000
  }
);
```

---

## 5. Device Integration

### Connecting Devices

```typescript
import { useDeviceManager } from '../src/hooks/useDeviceManager';

function DeviceControl() {
  const { devices, sendCommand, connectDevice } = useDeviceManager();
  
  // Connect via Serial
  const handleConnectSerial = async () => {
    await connectDevice('serial');
  };
  
  // Connect via WebSocket
  const handleConnectWifi = async () => {
    await connectDevice('websocket', { url: 'ws://192.168.1.100:8080' });
  };
  
  // Send command to device
  const handleSetLED = () => {
    sendCommand('device-id', 'setLED', {
      index: 0,
      color: { h: 180, s: 100, v: 255 }
    });
  };
  
  return (
    <div>
      <button onClick={handleConnectSerial}>Connect USB</button>
      <button onClick={handleConnectWifi}>Connect WiFi</button>
      <p>Connected devices: {devices.length}</p>
    </div>
  );
}
```

### Device Commands

**LED Control:**
```typescript
sendCommand(deviceId, 'setLED', {
  index: 0-63, // LED matrix position
  color: { h: 0-360, s: 0-100, v: 0-255 }
});
```

**Vibration:**
```typescript
sendCommand(deviceId, 'vibrate', {
  duration: 100, // milliseconds
  intensity: 128 // 0-255
});
```

**Pattern:**
```typescript
sendCommand(deviceId, 'vibrate', {
  pattern: [100, 50, 100, 50, 200], // on/off pattern in ms
});
```

---

## 6. UI Components

### SwarmControlDrawer

Location: `app/components/neo/SwarmControlDrawer.tsx`

Provides UI for:
- Node status display
- Text distribution input
- Effect triggers
- Node selection

### SocialFeedDrawer

Location: `app/components/neo/SocialFeedDrawer.tsx`

Provides UI for:
- Creator discovery
- Subscription management
- Broadcasting interface
- Follower stats

### QuickExperienceToggle

Location: `app/components/QuickExperienceToggle.tsx`

Floating button for instant switching between Fluid and AR Piano modes.

---

## 7. Testing

### Menu Sounds
```typescript
import { useMenuSounds } from '../src/hooks/useMenuSounds';

function TestSounds() {
  const sounds = useMenuSounds(true);
  
  return (
    <div>
      <button onClick={() => sounds.playHover()}>Hover</button>
      <button onClick={() => sounds.playSelect()}>Select</button>
      <button onClick={() => sounds.playSuccess()}>Success</button>
      <button onClick={() => sounds.playError()}>Error</button>
    </div>
  );
}
```

### Swarm Mode
1. Connect at least 2 S3 Matrix devices
2. Open SwarmControlDrawer
3. Verify node status shows both devices
4. Test text display: "HI" should show H on device 1, I on device 2
5. Test ripple effect from each node

### Social Broadcasting
1. Open SocialFeedDrawer
2. Subscribe to a test influencer
3. Send a broadcast
4. Verify device receives notification with effects

---

## Best Practices

### 1. Always Use Haptic Feedback
```typescript
import { useHaptics } from '../app/hooks/useHaptics';

const haptics = useHaptics();
haptics.impactLight(); // For hover/minor actions
haptics.impactMedium(); // For clicks/selections
haptics.impactHeavy(); // For major actions
```

### 2. Combine Audio and Haptics
```typescript
const sounds = useMenuSounds();
const haptics = useHaptics();

const handleClick = () => {
  sounds.playSelect();
  haptics.impactMedium();
  // ... your action
};
```

### 3. Check Device Availability
```typescript
const { nodes } = useSwarmManager();

if (nodes.length === 0) {
  return <p>Connect devices to use swarm mode</p>;
}
```

### 4. Handle Errors Gracefully
```typescript
try {
  await switchExperience('ar-piano');
  sounds.playSuccess();
} catch (error) {
  console.error(error);
  sounds.playError();
  // Show error message to user
}
```

---

## Troubleshooting

### Menu Sounds Not Playing
- Check that Tone.js is initialized: `await Tone.start()`
- Verify audio context permissions in browser
- Check volume settings in preferences

### Devices Not Connecting
- For Serial: Check Web Serial API browser support
- For WebSocket: Verify device IP and port
- Check device firmware is running and responsive

### Swarm Patterns Not Syncing
- Verify all devices are online (check node status)
- Test health check is running
- Check network connectivity for WiFi devices

### Social Broadcasts Not Received
- Verify follower subscriptions are registered
- Check follower preferences (notifications enabled)
- Ensure devices are connected and online

---

## Performance Optimization

### 1. Lazy Load Heavy Components
```typescript
const ARPianoExperience = lazy(() =>
  import('../src/components/piano/ARPianoExperience')
);
```

### 2. Debounce Rapid Events
```typescript
const debouncedRipple = debounce(() => {
  createRippleEffect(1, color, speed);
}, 100);
```

### 3. Limit Particle Count
```typescript
<MenuParticles
  emitters={emitters.slice(0, 5)} // Max 5 active emitters
/>
```

---

## Next Steps

1. Review the main README.md for feature overview
2. Check AGENTS.md for agent responsibilities
3. See AI_RULES.md for development guidelines
4. Explore firmware/esp32-s3-matrix/ for device firmware
5. Read PROJECT_STATUS_REPORT.md for architecture details

---

**Questions?** Open an issue on GitHub or check the discussions!

**Powered by Nirvana** 🌟
