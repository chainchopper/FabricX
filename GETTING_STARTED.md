# Getting Started with FabricX

**Powered by Nirvana** 🌟

This guide helps you get up and running with FabricX's powerful features including AI services, device integration, and interactive experiences.

## 🚀 Quick Start (Web)

### 1. Install and Run
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser to the URL shown (usually `http://localhost:8081`).

### 2. First Launch Checklist
- [ ] Click the ☰ menu icon (left edge)
- [ ] Explore the Controls tab
- [ ] Try changing Background color
- [ ] Toggle Haptics and Audio in Settings
- [ ] Test Voice Input (microphone button)

## 🎨 Using the Interface

### Navigation
- **Left Edge Icons**: Hover near the left edge to see menu icons
- **☰ Menu Button**: Opens the main controls drawer
- **⚙️ Settings**: Opens settings and preferences
- **🎤 Floating Button**: Voice input (bottom right)

### Menu Tabs
1. **Controls**: Visual settings, audio, experiences
2. **Social**: Social broadcasting (demo mode)
3. **Swarm**: Multi-device coordination

## 🤖 Setting Up AI Services

### Prerequisites
You'll need API keys from one or more providers:
- [OpenAI API Key](https://platform.openai.com/api-keys) - For GPT and Vision
- [Anthropic API Key](https://console.anthropic.com/) - For Claude
- [Google Cloud API Key](https://console.cloud.google.com/) - For Google Vision

### Configuration Steps

1. **Open AI Settings**
   ```
   Settings (⚙️) → Click "🤖 AI Services" button
   ```

2. **Configure LLM (Language Model)**
   - Click "LLM" tab
   - Select provider: OpenAI, Anthropic, or Custom
   - Paste your API key
   - (Optional) Customize endpoint and model
   - Click "Test Connection"
   - Wait for success message

3. **Configure Vision AI**
   - Click "Vision" tab
   - Select provider: OpenAI or Google
   - Paste your API key
   - (Optional) Customize endpoint
   - Click "Test Connection"

4. **Configure Voice Input**
   - Click "Voice" tab
   - Select "browser" (no API key needed!)
   - Choose your language
   - Click "Test Voice Input"
   - Grant microphone permission when prompted

### Using AI Services

#### Voice Input
1. Look for floating 🎤 button (bottom right)
2. Click to start recording
3. Speak clearly
4. Click again to stop
5. Long press button to expand transcript
6. Transcript appears in real-time

#### LLM Chat (Coming Soon)
The LLM service is configured and ready, but the chat UI is still in development. Developers can use the `getLLMService()` API directly.

#### Vision AI Analysis (Coming Soon)
Vision AI is configured and ready. Image upload UI coming soon.

## 🔌 Connecting Devices (ESP32-S3 Matrix)

### Hardware You'll Need
- ESP32-S3 Matrix board (Waveshare recommended)
- USB-C cable
- Computer running Chrome or Edge browser

### Firmware Setup

1. **Flash the Firmware**
   ```bash
   cd firmware/esp32-s3-matrix
   # Follow README.md for detailed instructions
   ```

2. **First Boot**
   - Device creates WiFi AP: `FabricX-ESP32-S3-Matrix_XXXXXX`
   - Password: `fabricx123`
   - Connect and configure your WiFi network
   - Device reboots and connects to your WiFi

### Connecting to Fabric

#### Method 1: USB Serial (Easiest for Testing)
1. Plug device into USB
2. Open Device Manager in Fabric
3. Click "Connect via USB"
4. Select device from browser prompt
5. Click "Test Device" - LEDs should flash purple!

**Requirements:**
- Chrome or Edge browser
- USB cable connected
- Web Serial API support

#### Method 2: WiFi (Best for Production)
1. Find device IP address:
   - Check serial monitor
   - OR check your router's DHCP list
   - OR use network scanner
2. Open Device Manager in Fabric
3. Enter: `ws://[device-ip]:8080/ws`
   - Example: `ws://192.168.1.100:8080/ws`
4. Click "Connect via WiFi"
5. Click "Test Device" - LEDs should flash purple!

**Requirements:**
- Device on same network
- WebSocket port 8080 open
- Correct IP address

### Testing Device Connection

Once connected, try these tests:

1. **LED Test**
   - Click "Test Device" in Device Manager
   - LEDs should light up purple for 2 seconds
   - Success: Your device is responding!

2. **Touch to LED**
   - Touch the Fabric canvas
   - Device LEDs should react to your touch
   - Colors correspond to touch location

3. **IMU to Fluid**
   - Tilt/shake the device
   - Fabric should react with fluid interactions
   - Movement creates splats and forces

## 🎛️ Customizing Your Experience

### Visual Settings

1. **Background Color**
   ```
   Menu → Controls → Background
   Choose: Cyan Glow, Deep Space, Nebula, or Transparent
   ```

2. **Particle Density**
   ```
   Menu → Controls → Particle Density
   Range: 0.3x to 1.5x (affects performance)
   ```

3. **Fluid Quality**
   ```
   Menu → Controls → Fluid Quality
   Options: Auto, Low, Medium, High
   Auto = Adaptive based on device
   ```

### Audio Settings

1. **Ambience**
   ```
   Menu → Controls → Ambience
   Toggle On/Off, Select track (ambience, A4, C5)
   ```

2. **Generative Music**
   ```
   Menu → Controls → Generative Music
   Toggle On/Off
   Adjust: Tempo (40-180 BPM), Scale, Pattern
   ```

3. **Audio Volume**
   ```
   Menu → Controls → Audio Volume
   Range: 0% to 100%
   ```

### Haptics & Feedback

1. **Global Settings**
   ```
   Settings (⚙️) → Audio & Haptics
   - Haptics: On/Off
   - Audio Cues: On/Off
   ```

2. **When Enabled:**
   - Feel vibrations on button presses
   - Hear audio feedback on interactions
   - Success/error notifications include haptics

### Icon Behavior

```
Settings (⚙️) → Menu Icon Behavior
- Auto-hide: On/Off
- Timeout: 3s, 6s, 10s, 15s, 30s
- Lock mode: Unlocked, Lock, Lock + Autohide
```

## 🎹 AR Piano Experience

### Accessing AR Piano
1. Click floating toggle button (🎹 icon), OR
2. Menu → Controls → Experience Switcher → "AR Piano"

### Features
- **3D Piano Keyboard**: Interactive keys (C3-B5)
- **Real-time Synthesis**: Polyphonic audio
- **AR Camera**: Live camera feed background (optional)
- **MIDI Input**: Connect external MIDI keyboard
- **Device Control**: Use S3 Matrix gyro for effects

### Using with S3 Matrix
1. Connect S3 Matrix device
2. Switch to AR Piano experience
3. Tilt device to modulate volume
4. Press device buttons for haptic feedback
5. LEDs light up when you play notes

## 🌊 Fluid Fabric (Default)

The classic liquid fabric experience:

### Interaction
- **Touch/Click**: Creates splats with force
- **Drag**: Creates directional flow
- **Multi-Touch**: Multiple simultaneous splats

### Multi-User
- Open multiple browser tabs/windows
- All connected to same room
- See everyone's interactions in real-time
- Uses WebRTC or BroadcastChannel

## 🔧 Troubleshooting

### Voice Input Issues

**"Microphone not working"**
- Grant microphone permission in browser
- Check browser supports Web Speech API (Chrome, Edge, Safari)
- Try refreshing the page

**"No transcript appearing"**
- Make sure Voice is enabled in AI Settings
- Provider should be "browser"
- Click microphone button to start
- Speak clearly and close to mic

### Device Connection Issues

**USB: "No device found"**
- Use Chrome or Edge (Firefox doesn't support Web Serial)
- Device must be plugged in via USB
- Try different USB cable/port
- Check device is powered on

**WiFi: "Connection failed"**
- Verify device is on same network
- Check IP address is correct
- Format: `ws://192.168.1.100:8080/ws`
- Try pinging device IP first
- Check firewall isn't blocking WebSocket

**"Device connected but not responding"**
- Click "Test Device" to verify
- Check serial monitor for errors
- Try reconnecting device
- Reflash firmware if needed

### AI Service Issues

**"API key invalid"**
- Verify API key is correct
- Check you copied entire key
- No extra spaces or characters
- Key should start with: `sk-` (OpenAI) or similar

**"Connection timeout"**
- Check internet connection
- Verify endpoint URL is correct
- Try default endpoint first
- Check API service status

### Performance Issues

**"Laggy or slow"**
```
1. Lower Fluid Quality to "Medium" or "Low"
2. Reduce Particle Density to 0.5x or less
3. Close other browser tabs
4. Try incognito/private mode
5. Update graphics drivers
```

**"High CPU usage"**
```
1. Disable Generative Music
2. Lower particle count
3. Use "Auto" quality mode
4. Close Device Manager when not needed
```

## 📚 Next Steps

### For Users
- Explore all experiences
- Connect your devices
- Try multi-user mode with friends
- Configure AI services
- Customize visual settings

### For Developers
- See `FEATURES_STATUS.md` for API examples
- Check `IMPLEMENTATION_GUIDE.md` for architecture
- Review `MICROCONTROLLER_GUIDE.md` for device integration
- Read `firmware/esp32-s3-matrix/README.md` for firmware

## 🆘 Getting Help

### Resources
- **Documentation**: See markdown files in project root
- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions

### Common Questions

**Q: Do I need API keys to use Fabric?**
A: No! Basic features work without any API keys. AI services are optional enhancements.

**Q: Can I use my own LLM/Vision endpoints?**
A: Yes! Select "Custom" provider and enter your endpoint URL.

**Q: Does this work on mobile?**
A: Yes! iOS and Android support via Expo. Some features (Web Serial) are web-only.

**Q: Is my data secure?**
A: API keys stored locally via AsyncStorage. Never sent to Fabric servers. Your API requests go directly to the provider you configured.

**Q: Can I use without internet?**
A: Yes for basic features. No for AI services or WebRTC with remote peers.

---

**Powered by Nirvana** - AI-assisted development platform

Ready to weave reality together? Start exploring! 🌈✨
