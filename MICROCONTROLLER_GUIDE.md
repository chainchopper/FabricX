# Microcontroller Integration Guide for FabricX

## Overview

FabricX now supports connecting physical microcontrollers to create interactive experiences. Sensor data from devices (accelerometer, gyroscope, temperature) can drive fluid interactions, while LEDs can respond to touches on the Fabric canvas.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Fabric Web App                        │
├─────────────────────────────────────────────────────────────┤
│  Device Manager UI                                          │
│  ├─ Connection controls (USB, WiFi, BLE)                   │
│  ├─ Device status display                                   │
│  └─ Configuration interface                                 │
├─────────────────────────────────────────────────────────────┤
│  InputOrchestrator                                          │
│  ├─ Device discovery & management                          │
│  ├─ Adapter routing (Serial/WebSocket/Bluetooth)          │
│  └─ Event distribution                                      │
├─────────────────────────────────────────────────────────────┤
│  Adapters                                                    │
│  ├─ SerialAdapter (Web Serial API)                         │
│  ├─ WebSocketAdapter (WiFi devices)                        │
│  └─ BluetoothAdapter (BLE, future)                         │
├─────────────────────────────────────────────────────────────┤
│  SensorToFluidMapper                                        │
│  └─ Transform sensor data → fluid interactions             │
├─────────────────────────────────────────────────────────────┤
│  Fluid Simulation                                           │
│  └─ Render interactions from touch + devices               │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                   Microcontroller Device                     │
├─────────────────────────────────────────────────────────────┤
│  Communication Layer                                         │
│  ├─ Serial/USB (115200 baud)                               │
│  ├─ WebSocket Server (port 8080)                           │
│  └─ JSON protocol                                           │
├─────────────────────────────────────────────────────────────┤
│  Sensors                                                     │
│  ├─ MPU6050 (accelerometer + gyroscope)                    │
│  ├─ Temperature sensor                                      │
│  └─ GPIO/ADC inputs                                         │
├─────────────────────────────────────────────────────────────┤
│  Actuators                                                   │
│  ├─ WS2812 LED matrix (25 LEDs, 5x5)                      │
│  ├─ GPIO outputs                                            │
│  └─ PWM outputs                                             │
└─────────────────────────────────────────────────────────────┘
```

## Supported Devices

### Tested
- **ESP32-S3 Matrix (Waveshare)** - Full support with reference firmware

### Compatible (should work with firmware adaptation)
- ESP32 variants (ESP32, ESP32-S2, ESP32-C3)
- Arduino boards (Uno, Mega, Due, etc.)
- Raspberry Pi Pico/Pico W
- STM32 boards
- Teensy boards
- Any board with Serial/WiFi/BLE capability

## Quick Start

### 1. Hardware Setup

**ESP32-S3 Matrix:**
1. Connect via USB-C
2. No additional wiring needed (sensors and LEDs built-in)

**Custom Board:**
1. Connect MPU6050 to I2C (SDA/SCL)
2. Connect WS2812 LED strip to data pin
3. Provide adequate power (5V, >1A for LEDs)

### 2. Firmware Installation

**Option A: PlatformIO (Recommended)**
```bash
cd firmware/esp32-s3-matrix
pio run --target upload
pio device monitor
```

**Option B: Arduino IDE**
1. Install ESP32 board support
2. Install required libraries (see firmware README)
3. Open `firmware/esp32-s3-matrix/src/main.cpp`
4. Select board: ESP32-S3 Dev Module
5. Upload

See `firmware/esp32-s3-matrix/README.md` for detailed instructions.

### 3. WiFi Configuration

**First Boot:**
1. Device creates AP: `FabricX-ESP32-S3-Matrix_XXXXXX`
2. Connect with password: `fabricx123`
3. Browser opens captive portal automatically
4. Select your WiFi network and enter password
5. Device connects and shows green LED

**Find Device IP:**
- Serial monitor will show: `IP address: 192.168.x.x`
- Or check your router's DHCP client list

### 4. Connect to Fabric

**Via WiFi (Recommended):**
1. Open Fabric in browser
2. Open Device Manager
3. Enter WebSocket URL: `ws://192.168.x.x:8080/ws`
4. Click "Connect via WiFi"

**Via USB:**
1. Connect device via USB (keep it powered and connected to WiFi)
2. Open Device Manager in Chrome/Edge
3. Click "Connect via USB"
4. Select device from browser dialog

## Usage

### Sensor-to-Fluid Mapping

**Default Mapping:**
- **Tilt device forward/back** → Move interaction point vertically
- **Tilt device left/right** → Move interaction point horizontally
- **Shake/accelerate** → Increase pressure/force
- **Rotation (gyro)** → Apply directional force
- **Temperature** → Color hue (optional)

**Configuration:**
```typescript
import { useDeviceFluidIntegration } from './hooks/useDeviceFluidIntegration';

const { configureMapper } = useDeviceFluidIntegration({
  enabled: true,
  mapperConfig: {
    sensitivity: 1.5,        // 0.1 - 2.0
    forceMultiplier: 2.0,   // 0.1 - 5.0
    colorMapping: 'velocity', // 'velocity' | 'orientation' | 'temperature' | 'fixed'
    enableAccel: true,
    enableGyro: true,
  }
});
```

### LED Control

**From Device (autonomous):**
Firmware can control LEDs based on local sensors or patterns.

**From Fabric (remote):**
```typescript
import { useDeviceManager } from './hooks/useDeviceManager';

const { sendCommand } = useDeviceManager();

// Set single LED
await sendCommand(deviceId, {
  type: 'led',
  payload: {
    index: 12,
    color: { r: 255, g: 0, b: 0 }
  },
  timestamp: Date.now()
});

// Set all LEDs
await sendCommand(deviceId, {
  type: 'led',
  payload: {
    color: { r: 0, g: 255, b: 0 }
  },
  timestamp: Date.now()
});
```

**Future: Touch-to-LED Mapping**
Touch Fabric → Send LED commands to create responsive light patterns.

## Protocol Specification

### Message Format

All messages are JSON with newline delimiter (`\n` for Serial).

### Device → Fabric

**Handshake Response:**
```json
{
  "type": "handshake_response",
  "name": "FabricX-ESP32-S3-Matrix",
  "version": "1.0.0",
  "deviceType": "esp32-s3",
  "capabilities": [
    "accelerometer",
    "gyroscope", 
    "temperature",
    "ws2812-led",
    "gpio"
  ]
}
```

**Sensor Data (periodic):**
```json
{
  "type": "sensor",
  "sensor": "imu",
  "timestamp": 1234567890,
  "values": {
    "accel_x": 0.12,
    "accel_y": -0.05,
    "accel_z": 9.81,
    "gyro_x": 0.01,
    "gyro_y": -0.02,
    "gyro_z": 0.00,
    "temperature": 25.4
  }
}
```

### Fabric → Device

**Handshake:**
```json
{
  "type": "handshake",
  "payload": { "version": "1.0" },
  "timestamp": 1234567890
}
```

**Configure:**
```json
{
  "type": "configure",
  "payload": {
    "sampleRate": 20,
    "ledBrightness": 128,
    "autoSend": true
  },
  "timestamp": 1234567890
}
```

**LED Control:**
```json
{
  "type": "led",
  "payload": {
    "index": 12,
    "color": { "r": 255, "g": 0, "b": 0 }
  },
  "timestamp": 1234567890
}
```

**Request Sensor Reading:**
```json
{
  "type": "read_sensor",
  "payload": {},
  "timestamp": 1234567890
}
```

## Integration Examples

### Example 1: Device-Driven Fluid

```typescript
import { useDeviceFluidIntegration } from './hooks/useDeviceFluidIntegration';
import { useFluidMultiUser } from './hooks/useFluidMultiUser';

function MyExperience() {
  const { sendInteraction } = useFluidMultiUser('my-room');
  
  useDeviceFluidIntegration({
    enabled: true,
    onInteraction: (interaction) => {
      // Send device interaction to multi-user system
      sendInteraction(interaction);
    },
    mapperConfig: {
      sensitivity: 1.2,
      colorMapping: 'velocity'
    }
  });

  return <FabricCanvas />;
}
```

### Example 2: Touch-to-LED

```typescript
import { useDeviceManager } from './hooks/useDeviceManager';

function InteractiveLEDs() {
  const { devices, sendCommand } = useDeviceManager();

  const handleTouch = (x: number, y: number) => {
    // Map touch position to LED index (5x5 grid)
    const col = Math.floor(x * 5);
    const row = Math.floor(y * 5);
    const index = row * 5 + col;

    devices.forEach(device => {
      sendCommand(device.info.id, {
        type: 'led',
        payload: {
          index,
          color: { r: 255, g: 100, b: 0 }
        },
        timestamp: Date.now()
      });
    });
  };

  return <InteractiveSurface onTouch={handleTouch} />;
}
```

### Example 3: Device Status Monitoring

```typescript
import { useDeviceManager } from './hooks/useDeviceManager';

function DeviceStatus() {
  const { devices, onStatusChange } = useDeviceManager();

  useEffect(() => {
    const unsubscribe = onStatusChange((deviceId, status) => {
      console.log(`Device ${deviceId}:`, status);
      if (!status.connected) {
        alert('Device disconnected!');
      }
    });
    return unsubscribe;
  }, [onStatusChange]);

  return (
    <div>
      {devices.map(d => (
        <div key={d.info.id}>
          {d.info.name}: {d.status.connected ? '✓' : '✗'}
        </div>
      ))}
    </div>
  );
}
```

## Development

### Custom Firmware

To create firmware for a different board:

1. **Copy reference firmware:**
   ```bash
   cp -r firmware/esp32-s3-matrix firmware/my-board
   ```

2. **Adapt pins and hardware:**
   - Update pin definitions
   - Change sensor initialization
   - Modify LED configuration

3. **Implement protocol:**
   - JSON command parsing
   - Sensor data JSON formatting
   - Keep message types consistent

4. **Test:**
   - Serial communication
   - WebSocket connection
   - Sensor readings
   - LED control

### Custom Adapters

To add support for new connection types (e.g., Bluetooth):

1. **Extend BaseDeviceAdapter:**
   ```typescript
   import { BaseDeviceAdapter } from './adapters/BaseDeviceAdapter';
   
   export class BluetoothAdapter extends BaseDeviceAdapter {
     // Implement required methods
   }
   ```

2. **Register in InputOrchestrator:**
   ```typescript
   this.adapters.set("bluetooth", new BluetoothAdapter());
   ```

3. **Add UI support in DeviceManager**

### Custom Sensor Mappings

Extend SensorToFluidMapper for custom transformations:

```typescript
import { SensorToFluidMapper } from './devices/SensorToFluidMapper';

class MyCustomMapper extends SensorToFluidMapper {
  map(data: SensorData, userId: string): FluidInteraction | null {
    // Custom logic
    return {
      userId,
      position: { x: data.values.custom_x, y: data.values.custom_y },
      force: { x: 0, y: 0 },
      pressure: data.values.pressure,
      timestamp: data.timestamp
    };
  }
}
```

## Troubleshooting

### Device Not Connecting

**USB/Serial:**
- Use Chrome or Edge browser (Safari/Firefox don't support Web Serial)
- Check cable (must be data cable, not charge-only)
- Install drivers if needed (CH340, CP2102)

**WiFi/WebSocket:**
- Verify device IP address (check serial monitor)
- Ensure device and browser are on same network
- Check firewall settings
- Try `ws://` not `wss://` (SSL not configured by default)

### Sensor Data Not Appearing

- Check IMU connection (I2C wiring)
- Verify I2C address (0x68 for MPU6050)
- Monitor serial output for errors
- Try manual sensor reading: `{"type":"read_sensor"}`

### LEDs Not Working

- Check power supply (USB may not provide enough current)
- Reduce brightness in config
- Verify LED pin and count in firmware
- Test with simple color: `{"type":"led","payload":{"color":{"r":255,"g":0,"b":0}}}`

### High Latency

- Use WiFi instead of Serial when possible
- Reduce sensor sample rate
- Check network congestion
- Minimize message payload size

## Performance

### Typical Metrics
- **Sensor Rate:** 20Hz default (1-100Hz configurable)
- **WebSocket Latency:** 10-50ms (local network)
- **Serial Latency:** 20-100ms
- **LED Update Rate:** Up to 60fps

### Optimization Tips
- Reduce sensor sample rate if not needed
- Use WebSocket for best latency
- Limit LED updates (use local patterns on device)
- Filter/smooth sensor data on device before sending

## Security

⚠️ **Important:** Default passwords are for development only!

**Change in production:**
- WiFi AP password: `fabricx123` → your password
- OTA password: `fabricx123` → your password
- Implement device authentication tokens
- Use wss:// (WebSocket over SSL) for remote access

**Best Practices:**
- Keep devices on private network
- Don't expose WebSocket to internet without auth
- Use firewall rules
- Regular firmware updates via OTA

## Future Roadmap

### Short Term
- [ ] Bluetooth LE support
- [ ] Device grouping and synchronization
- [ ] Advanced LED patterns and effects
- [ ] Historical sensor data storage

### Medium Term
- [ ] Multi-device orchestration
- [ ] Voice control integration
- [ ] Machine learning on sensor patterns
- [ ] Custom experience templates

### Long Term
- [ ] Marketplace for device plugins
- [ ] Cloud device management
- [ ] Remote access via WebRTC tunneling
- [ ] Integration with smart home systems

## Resources

- **Firmware README:** `firmware/esp32-s3-matrix/README.md`
- **Project Report:** `PROJECT_STATUS_REPORT.md`
- **Main README:** `README.md`
- **AI Rules:** `AI_RULES.md`
- **Waveshare Wiki:** https://www.waveshare.com/wiki/ESP32-S3-Matrix

## Support

For questions and issues:
1. Check firmware README and this guide
2. Search GitHub issues
3. Open new issue with:
   - Device type and firmware version
   - Connection method (USB/WiFi)
   - Error messages from serial monitor
   - Browser console errors (F12)

---

**Happy Making! 🎨🔌**
