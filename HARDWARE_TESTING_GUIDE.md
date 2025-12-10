# Hardware Testing Guide - S3 Matrix Devices

## Purpose
This guide provides step-by-step instructions for testing FabricX features with physical ESP32-S3 Matrix devices.

---

## Prerequisites

### Hardware Required
- 1-4 ESP32-S3 Matrix devices (8x8 LED matrix)
- USB-C cables for initial programming
- WiFi network access
- Computer with Chrome/Edge browser (Web Serial API support)

### Software Required
- Arduino IDE or PlatformIO
- ESP32-S3 board support
- FabricX firmware (in `firmware/esp32-s3-matrix/`)
- Chrome or Edge browser (latest version)

---

## Part 1: Firmware Setup

### Step 1: Flash Initial Firmware

1. Open firmware project in Arduino IDE
   ```
   firmware/esp32-s3-matrix/esp32-s3-matrix.ino
   ```

2. Configure board settings:
   - Board: "ESP32-S3 Dev Module"
   - USB CDC On Boot: "Enabled"
   - Flash Size: "8MB (64Mb)"
   - Partition Scheme: "Default 4MB with spiffs"

3. Connect device via USB-C

4. Select correct COM port in Arduino IDE

5. Upload firmware

6. Open Serial Monitor (115200 baud) to verify:
   ```
   Fabric S3 Matrix v1.0.0
   WiFi: Connecting...
   WiFi: Connected (IP: 192.168.x.x)
   WebSocket: Ready on port 8080
   ```

### Step 2: Configure WiFi

If WiFi credentials need updating:

1. Edit `credentials.h`:
   ```cpp
   #define WIFI_SSID "YourNetworkName"
   #define WIFI_PASSWORD "YourPassword"
   ```

2. Re-upload firmware

### Step 3: Test LED Matrix

After successful boot, LEDs should:
- Show brief rainbow animation
- Display device ID pattern
- Go to idle state (dim cyan glow)

---

## Part 2: Fabric Connection Testing

### Test 1: USB Serial Connection

1. Open Fabric app in Chrome
2. Navigate to NeoLocker → Device Manager
3. Click "Connect USB Device"
4. Select S3 Matrix from serial port list
5. Verify connection indicator turns green
6. Check device appears in connected devices list

**Expected Result:**
- Device status: "Connected (Serial)"
- Device ID displayed
- LED matrix shows connection confirmation

### Test 2: WiFi WebSocket Connection

1. Note device IP from Serial Monitor
2. In Device Manager, click "Connect WiFi Device"
3. Enter device IP: `ws://192.168.x.x:8080`
4. Click Connect
5. Verify connection successful

**Expected Result:**
- Device status: "Connected (WebSocket)"
- Faster response times than serial
- More reliable for swarm operations

---

## Part 3: AR Piano Integration Testing

### Test 1: Basic Piano with Device

1. Switch to AR Piano experience (toggle button or menu)
2. Verify device is connected
3. Play keys on virtual piano
4. Observe device LED matrix

**Expected Results:**
- Each key press lights corresponding LED
- Color corresponds to note (chromatic mapping)
- Brightness matches velocity
- LEDs turn off when key released

### Test 2: Gyro/Accelerometer Control

1. While in AR Piano, tilt device left/right
2. Listen to volume changes
3. Rotate device
4. Observe camera rotation effect

**Expected Results:**
- Tilt left: volume decreases
- Tilt right: volume increases
- Rotation: camera perspective adjusts
- Smooth, responsive control

### Test 3: Button Feedback

1. Press button 1 on S3 Matrix
2. Feel vibration feedback
3. Press button 2
4. Feel longer vibration

**Expected Results:**
- Button 1: Short haptic pulse (100ms)
- Button 2: Long haptic pulse (200ms)
- Visual confirmation in app
- Reliable button detection

### Test 4: AR Camera Overlay

1. Enable AR camera in piano settings
2. Grant camera permission
3. Verify camera feed shows behind piano
4. Check lighting adjusts for AR mode

**Expected Results:**
- Camera feed visible as background
- Piano keys visible over camera
- Lighting brighter in AR mode
- Smooth frame rate (30+ fps)

### Test 5: MIDI Keyboard Integration

1. Connect MIDI keyboard via USB
2. Switch to AR Piano
3. Play notes on MIDI keyboard
4. Observe virtual piano and device LEDs

**Expected Results:**
- Virtual keys light up for MIDI notes
- Device LEDs match MIDI input
- Audio plays from MIDI notes
- Visual and audio sync perfectly

---

## Part 4: Swarm Mode Testing

### Test 1: Two-Device Swarm

**Setup:**
1. Connect 2 S3 Matrix devices
2. Open NeoLocker → Swarm tab
3. Verify both devices listed as nodes

**Test: Text Display**
1. Type "HI" in text input
2. Click "Display on Nodes"
3. Check devices

**Expected Results:**
- Device 1 (Node 1): Shows "H"
- Device 2 (Node 2): Shows "I"
- Both devices same color
- Synchronized timing

**Test: Ripple Effect**
1. Click "Ripple from Node 1"
2. Observe both devices

**Expected Results:**
- Node 1: Immediate effect
- Node 2: Delayed cascade
- Smooth color gradient
- Returns to idle state

**Test: Sync All**
1. Click "Sync All Nodes"
2. Check both devices

**Expected Results:**
- Both flash simultaneously
- Same color and pattern
- Heartbeat confirmation

### Test 2: Four-Device Swarm

**Setup:**
1. Connect 4 S3 Matrix devices
2. Verify all in swarm control

**Test: Word Display**
1. Type "HELLO" (will use first 4 letters)
2. Display on nodes

**Expected Results:**
- Node 1: "H"
- Node 2: "E"  
- Node 3: "L"
- Node 4: "L"
- All synchronized

**Test: Wave Pattern**
1. Create wave effect
2. Watch cascade across nodes

**Expected Results:**
- Sequential activation 1→2→3→4
- Smooth color transitions
- Predictable timing
- Return to idle

### Test 3: Node Assignment

**Test RX-Only Mode** (when implemented):
1. Select a device
2. Mark as "RX-Only"
3. Try to disconnect
4. Verify permanent pairing

**Expected Results:**
- Device cannot be disconnected normally
- Requires factory reset to unpair
- Receives all broadcasts
- No device-to-host commands

---

## Part 5: Social Broadcasting Testing

### Test 1: Subscription Flow

**Setup:**
1. Open Social tab in NeoLocker
2. Connect at least one device
3. Subscribe to test influencer

**Test: Broadcast Reception**
1. As influencer, send broadcast
2. Observe connected device(s)

**Expected Results:**
- Device receives notification
- LED pattern matches broadcast effect
- Vibration plays if specified
- Message displayed if text pattern

### Test 2: Multiple Subscribers

**Setup:**
1. Connect 2+ devices
2. Subscribe both to influencer
3. Send broadcast

**Expected Results:**
- All devices receive simultaneously
- Synchronized effects
- No lag or desync
- Clean return to idle

### Test 3: Custom Broadcast Effects

**Test Different Patterns:**

1. **Color Broadcast:**
   ```
   Effect: Color pulse
   Color: Cyan (h:180, s:100, v:255)
   Duration: 3 seconds
   ```
   Result: Devices pulse cyan

2. **Vibration Pattern:**
   ```
   Pattern: [100, 50, 100, 50, 100]
   ```
   Result: Devices vibrate in rhythm

3. **Text Pattern:**
   ```
   Message: "LIVE"
   Duration: 5 seconds
   ```
   Result: Devices show letters

---

## Part 6: Performance Testing

### Test 1: Frame Rate Monitoring

1. Open browser DevTools
2. Monitor FPS (should be 60fps target)
3. With 0 devices connected
4. With 1 device
5. With 4 devices

**Acceptable Results:**
- 0 devices: 60 FPS
- 1 device: 55-60 FPS
- 4 devices: 50-60 FPS

### Test 2: Latency Measurement

**Touch to LED:**
1. Touch piano key
2. Measure time to LED response
3. Repeat 10 times, average

**Target:** <100ms for serial, <50ms for WiFi

**Device Command:**
1. Send LED command
2. Measure to actual LED change
3. Repeat 10 times

**Target:** <80ms

### Test 3: Swarm Synchronization

**Test Setup:**
1. 4 devices in swarm
2. Send synchronized pattern
3. Use high-speed camera if available
4. Measure timing delta between devices

**Target:** <50ms delta between first and last device

### Test 4: Sustained Operation

**Duration Test:**
1. Run piano experience for 30 minutes
2. Monitor memory usage
3. Check device temperature
4. Verify no disconnections

**Expected Results:**
- Memory stable (no leaks)
- Device temp <50°C
- No random disconnects
- Consistent performance

---

## Part 7: Edge Case Testing

### Test 1: Rapid Reconnection

1. Connect device
2. Immediately disconnect
3. Immediately reconnect
4. Repeat 5 times

**Expected:** Clean connection each time

### Test 2: Network Interruption

1. Connect device via WiFi
2. Disable WiFi router briefly
3. Re-enable router
4. Check reconnection

**Expected:** Automatic reconnection within 10s

### Test 3: Multiple Apps

1. Open Fabric in two browser tabs
2. Connect same device to both
3. Send commands from each

**Expected:** Last connected app controls device

### Test 4: Power Cycle

1. During operation, power off device
2. Power on device
3. Check automatic reconnection

**Expected:** Device reconnects automatically

---

## Troubleshooting

### Device Not Found
- Check USB cable connection
- Verify Web Serial API supported (Chrome/Edge)
- Try different USB port
- Check device is powered on

### LEDs Not Responding
- Verify firmware version matches
- Check serial monitor for errors
- Test LED with button press
- Reflash firmware if needed

### WiFi Connection Fails
- Verify credentials in firmware
- Check device is on same network
- Confirm IP address correct
- Check firewall settings

### High Latency
- WiFi connection preferred over Serial
- Check network congestion
- Reduce number of connected devices
- Close other browser tabs

### Desync in Swarm
- Verify all devices same firmware
- Check network stability
- Reduce command frequency
- Use sync command to reset

---

## Test Results Template

```
Test Date: ___________
Tester: ___________
Firmware Version: ___________

Device Configuration:
[ ] 1 Device
[ ] 2 Devices  
[ ] 4 Devices

Connection Type:
[ ] USB Serial
[ ] WiFi WebSocket

Test Results:
[ ] AR Piano - Device Integration
[ ] AR Piano - Gyro Control
[ ] AR Piano - Button Feedback
[ ] AR Piano - Camera Overlay
[ ] AR Piano - MIDI Input
[ ] Swarm - Text Display
[ ] Swarm - Ripple Effect
[ ] Swarm - Synchronization
[ ] Social - Broadcast Reception
[ ] Performance - Frame Rate
[ ] Performance - Latency

Issues Found:
_________________________________
_________________________________
_________________________________

Notes:
_________________________________
_________________________________
_________________________________
```

---

## Reporting Issues

When reporting hardware-related issues, include:

1. Device info (model, firmware version)
2. Connection type (Serial/WiFi)
3. Browser info (Chrome version)
4. Network setup (if WiFi)
5. Steps to reproduce
6. Expected vs actual behavior
7. Serial monitor logs
8. Browser console logs
9. Photos/videos if relevant

Submit to: GitHub Issues with label "hardware-testing"

---

**Last Updated:** December 10, 2024  
**Version:** 1.0  
**Status:** Ready for Testing
