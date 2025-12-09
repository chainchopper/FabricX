# ESP32-S3 Matrix Firmware for FabricX

Firmware for the Waveshare ESP32-S3-Matrix board to integrate with FabricX platform.

## Features

- **WiFi Configuration:** Auto-connect with WiFiManager (AP mode fallback)
- **WebSocket Server:** Real-time communication with FabricX web app
- **Serial Communication:** USB serial for development and alternative connection
- **IMU Sensor:** MPU6050 accelerometer + gyroscope + temperature
- **LED Matrix Control:** 25 WS2812 RGB LEDs (5x5 matrix)
- **OTA Updates:** Over-the-air firmware updates via Arduino OTA

## Hardware Requirements

- Waveshare ESP32-S3-Matrix board
- USB-C cable for programming and power
- (Optional) External 5V power supply for full LED brightness

## Pin Configuration

```cpp
#define LED_PIN 21          // WS2812 LED data pin
#define LED_COUNT 25        // 5x5 matrix
#define IMU_SDA 8          // I2C data for MPU6050
#define IMU_SCL 9          // I2C clock for MPU6050
#define BUTTON_PIN 0       // Boot button
```

## Setup & Installation

### Using PlatformIO (Recommended)

1. Install [PlatformIO](https://platformio.org/) 
2. Navigate to firmware directory:
   ```bash
   cd firmware/esp32-s3-matrix
   ```
3. Build and upload:
   ```bash
   pio run --target upload
   ```
4. Monitor serial output:
   ```bash
   pio device monitor
   ```

### Using Arduino IDE

1. Install Arduino IDE 2.x
2. Add ESP32 board support:
   - File → Preferences → Additional Board Manager URLs
   - Add: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Install board: Tools → Board → Boards Manager → "ESP32" → Install
4. Install libraries (Sketch → Include Library → Manage Libraries):
   - Adafruit MPU6050
   - Adafruit Unified Sensor
   - ArduinoJson (v7)
   - NeoPixelBus
   - ESPAsyncWebServer
   - AsyncTCP
   - WiFiManager
5. Select board: Tools → Board → ESP32 Arduino → ESP32-S3 Dev Module
6. Configure:
   - USB CDC On Boot: Enabled
   - Upload Speed: 921600
7. Upload sketch

## First Boot & WiFi Setup

1. **Power on device** - LEDs will show blue if in config mode
2. **Connect to AP:**
   - SSID: `FabricX-ESP32-S3-Matrix_XXXXXX`
   - Password: `fabricx123`
3. **Configure WiFi:**
   - Browser should auto-open to captive portal
   - If not, go to `http://192.168.4.1`
   - Select your WiFi network and enter password
4. **Device connects** - LED briefly shows green
5. **Find device IP:**
   - Check serial monitor: `IP address: 192.168.x.x`
   - Or check your router's DHCP client list

## Communication Protocols

### WebSocket (Preferred)

**Connect to:** `ws://[device-ip]:8080/ws`

**Message Format:** JSON

#### Commands (FabricX → Device)

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

**Control LED:**
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

**Control All LEDs:**
```json
{
  "type": "led",
  "payload": {
    "color": { "r": 0, "g": 255, "b": 0 }
  },
  "timestamp": 1234567890
}
```

**Read Sensor:**
```json
{
  "type": "read_sensor",
  "payload": {},
  "timestamp": 1234567890
}
```

#### Responses (Device → FabricX)

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

**Sensor Data (auto-sent at configured rate):**
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

### Serial (Alternative)

**Baud Rate:** 115200  
**Format:** Same JSON protocol as WebSocket  
**Delimiter:** Newline (`\n`)

Send commands via Serial:
```
{"type":"led","payload":{"color":{"r":255,"g":0,"b":0}},"timestamp":1234567890}
```

## OTA Updates

### Method 1: Arduino OTA (Network)

1. Device must be on same network
2. Arduino IDE: Tools → Port → [Device Name] at [IP]
3. Upload as normal

### Method 2: Web Browser OTA

Coming soon - upload .bin file via web interface

### Method 3: PlatformIO OTA

1. Configure `platformio.ini`:
   ```ini
   upload_protocol = espota
   upload_port = [device-ip]
   upload_flags = --auth=fabricx123
   ```
2. Upload: `pio run --target upload`

**OTA Password:** `fabricx123` (change in code for security)

## LED Matrix Layout

```
 0   1   2   3   4
 5   6   7   8   9
10  11  12  13  14
15  16  17  18  19
20  21  22  23  24
```

## Sensor Specifications

### MPU6050 IMU

- **Accelerometer Range:** ±8g
- **Gyroscope Range:** ±500°/s
- **Sample Rate:** Configurable (default 20Hz)
- **Filter:** 21Hz bandwidth

**Axes Orientation:**
- X: Parallel to longer edge
- Y: Parallel to shorter edge
- Z: Perpendicular (up when board is flat)

## Troubleshooting

### Device not connecting to WiFi
- Hold boot button for 5 seconds to reset WiFi settings
- Or visit `http://[device-ip]/reset` before it loses connection

### IMU not detected
- Check I2C wiring (SDA=8, SCL=9)
- Verify MPU6050 address (should be 0x68)

### LEDs not working
- Check power supply (USB may not provide enough current for all LEDs at full brightness)
- Reduce brightness: `config.ledBrightness = 64;`

### WebSocket connection fails
- Check firewall settings
- Verify device IP address
- Ensure browser supports WebSocket

### Serial not working
- Set "USB CDC On Boot: Enabled" in Arduino IDE
- Or add `-D ARDUINO_USB_CDC_ON_BOOT=1` build flag

## Performance Notes

- **Sensor Rate:** 20Hz default (adjustable 1-100Hz)
- **WebSocket Latency:** ~10-50ms on local network
- **LED Update Rate:** Up to 60fps
- **WiFi Range:** Typical ESP32 range (~50m indoor)

## Power Consumption

- **Idle:** ~100mA @ 5V
- **WiFi Active:** ~150mA @ 5V
- **All LEDs Full White:** ~1.5A @ 5V (requires external power)
- **Recommended:** Limit brightness or use external 5V supply

## Security Notes

⚠️ **Default Passwords:**
- WiFi AP: `fabricx123`
- OTA: `fabricx123`

**Change these in production!** Edit `main.cpp` and recompile.

## License

Part of the FabricX project. See main repository for license details.

## Support

For issues specific to this firmware, please see:
- FabricX GitHub repository
- Waveshare ESP32-S3-Matrix wiki: https://www.waveshare.com/wiki/ESP32-S3-Matrix
