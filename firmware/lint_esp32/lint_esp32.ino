/*
 * Fabric Lint — ESP32-S3 reference device (Slice 13, protocol v0)
 * ================================================================
 *
 * A lint is a room OBJECT: it joins a Fabric room over the signaling
 * WebSocket, announces itself (lint-hello), renders the room's
 * summarized events (lint-frames) as light, and sends exactly one
 * thing back — a touch (lint-touch) when its capacitive pad is
 * pressed. Full protocol: docs/LINT.md in this repo.
 *
 * What it does:
 *   - verbs (heart/cheer/tickle)  -> a pulse in the sender's hue
 *   - notes                       -> a flash in the note's pitch color
 *   - stroke-energy               -> a sustained glow while the room draws
 *   - session changes             -> a slow breathe in the host's hue
 *   - capacitive touch on the pad -> a splat on every canvas in the
 *                                    room, at this device's declared
 *                                    position, in its own hue
 *
 * Libraries (install via the Arduino Library Manager):
 *   - "WebSockets" by Markus Sattler (arduinoWebSockets)
 *   - "Adafruit NeoPixel" by Adafruit
 *   - "ArduinoJson" by Benoit Blanchon (v7)
 * ESP32 core: use the Espressif ESP32 Arduino core (3.x) and select
 * an ESP32-S3 board.
 *
 * Transport dependency, honestly: lint frames ride the signaling
 * socket's `relay` message (Hotfix 2.0). The relay Worker must be
 * the 2.0 build for frames to flow; against the older Worker this
 * sketch connects and joins, and simply never hears frames.
 *
 * Powered by Nirvana
 */

// ------------------------------------------------------------------
// CONFIG — edit these
// ------------------------------------------------------------------
#define WIFI_SSID "YourWiFiName"
#define WIFI_PASSWORD "YourWiFiPassword"

// The Fabric room to join. "main" is the default canvas room; a
// shared session uses its room id (e.g. "live-k7d2qx" from the
// invite link).
#define LINT_ROOM "main"

// Who this object is, and its signature color (degrees, 0..359) —
// the hue its touch paints on the canvas.
#define LINT_NAME "Desk Lamp"
#define LINT_KIND "light" // light | haptic | display | other
#define LINT_HUE 265

// Where this device's touch lands on the canvas (normalized 0..1).
#define LINT_TOUCH_X 0.5f
#define LINT_TOUCH_Y 0.42f

// Signaling endpoint (the same public relay the browsers use).
#define WS_HOST "fabric-signaling.iaminc.workers.dev"
#define WS_PORT 443

// Hardware. GPIO48 is the onboard WS2812 on most ESP32-S3 devkits;
// for a strip or matrix, set the data pin and count to yours.
// Touch pads on the S3 are GPIO1..GPIO14; GPIO4 (TOUCH4) is a
// convenient exposed one — touch is read through the bare pin or a
// coin/pad soldered to it.
#define NEOPIXEL_PIN 48
#define NUM_PIXELS 1
#define TOUCH_PIN 4

// ------------------------------------------------------------------

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>

WebSocketsClient webSocket;
Adafruit_NeoPixel strip(NUM_PIXELS, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

String peerId; // "lint:<slug>-<chip tail>", assigned at join

// Render state (all envelope math is non-blocking, in loop()).
float sustainLevel = 0.0f; // stroke-energy glow
int sustainHue = 210;
unsigned long sustainStamp = 0;
float pulseLevel = 0.0f; // verb / note flash
int pulseHue = 210;
unsigned long pulseUntil = 0;
int breatheHue = 210; // session breathe
unsigned long breatheUntil = 0;
float dispLevel = 0.0f; // smoothed level actually shown

// Touch state.
uint32_t touchBaseline = 0;
bool touchArmed = true;
int touchLowCount = 0;
unsigned long lastTouchSent = 0;

unsigned long lastHello = 0;
bool wsJoined = false;

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------

// HSV (hue degrees, s/v 0..1) -> packed RGB for the strip.
uint32_t hsvColor(int hueDeg, float v) {
  float h = ((hueDeg % 360) + 360) % 360;
  float c = v;
  float x = c * (1.0f - fabsf(fmodf(h / 60.0f, 2.0f) - 1.0f));
  float r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return strip.Color((uint8_t)(r * 255), (uint8_t)(g * 255), (uint8_t)(b * 255));
}

void showColor(int hueDeg, float level) {
  uint32_t col = hsvColor(hueDeg, level);
  for (int i = 0; i < NUM_PIXELS; i++) strip.setPixelColor(i, col);
  strip.show();
}

void sendJson(JsonDocument &doc) {
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
}

void sendHello() {
  JsonDocument doc;
  doc["type"] = "relay";
  doc["roomId"] = LINT_ROOM;
  doc["from"] = peerId;
  JsonObject payload = doc["payload"].to<JsonObject>();
  payload["fabric"] = "lint";
  payload["v"] = 0;
  payload["kind"] = "lint-hello";
  payload["name"] = LINT_NAME;
  payload["deviceKind"] = LINT_KIND;
  JsonArray caps = payload["caps"].to<JsonArray>();
  caps.add("glow");
  caps.add("pulse");
  payload["hue"] = LINT_HUE;
  sendJson(doc);
  lastHello = millis();
}

void sendTouch() {
  static unsigned long counter = 0;
  JsonDocument doc;
  doc["type"] = "relay";
  doc["roomId"] = LINT_ROOM;
  doc["from"] = peerId;
  JsonObject payload = doc["payload"].to<JsonObject>();
  payload["fabric"] = "lint";
  payload["v"] = 0;
  payload["kind"] = "lint-touch";
  payload["id"] = peerId + ":" + String(++counter);
  payload["x"] = LINT_TOUCH_X;
  payload["y"] = LINT_TOUCH_Y;
  payload["hue"] = LINT_HUE;
  sendJson(doc);
  Serial.println("[lint] touch sent");
}

// ------------------------------------------------------------------
// Frame handling
// ------------------------------------------------------------------

void handleLintFrame(JsonObject frame) {
  const char *kind = frame["kind"] | "";
  int hue = frame["hue"] | 210;
  float intensity = frame["intensity"] | 0.0f;
  if (intensity < 0) intensity = 0;
  if (intensity > 1) intensity = 1;
  unsigned long now = millis();

  if (strcmp(kind, "verb") == 0) {
    const char *verb = frame["verb"] | "?";
    pulseHue = hue;
    pulseLevel = 1.0f;
    pulseUntil = now + 450;
    Serial.printf("[lint] verb %s\n", verb);
  } else if (strcmp(kind, "note") == 0) {
    if (intensity > 0) {
      // Notes flash their pitch color; the frame's own hue is the
      // player's identity hue (see docs/LINT.md).
      if (!frame["midi"].isNull()) {
        int midi = frame["midi"] | 60;
        int cls = ((midi % 12) + 12) % 12;
        pulseHue = cls * 30 + 15;
      } else {
        pulseHue = hue;
      }
      pulseLevel = intensity < 0.2f ? 0.2f : intensity;
      pulseUntil = now + 320;
    }
  } else if (strcmp(kind, "stroke-energy") == 0) {
    sustainHue = hue;
    sustainLevel = intensity;
    sustainStamp = now;
  } else if (strcmp(kind, "session") == 0) {
    breatheHue = hue;
    breatheUntil = now + 2500;
  }
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      Serial.println("[lint] socket connected — joining room");
      JsonDocument join;
      join["type"] = "join";
      join["roomId"] = LINT_ROOM;
      join["peerId"] = peerId;
      sendJson(join);
      wsJoined = true;
      sendHello();
      break;
    }
    case WStype_DISCONNECTED:
      Serial.println("[lint] socket disconnected");
      wsJoined = false;
      break;
    case WStype_TEXT: {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) return;
      const char *msgType = doc["type"] | "";
      if (strcmp(msgType, "relay") != 0) return;
      JsonObject p = doc["payload"].as<JsonObject>();
      if (p.isNull()) return;
      if (strcmp(p["fabric"] | "", "lint") != 0) return;
      if (strcmp(p["kind"] | "", "lint-frame") != 0) return;
      JsonObject frame = p["frame"].as<JsonObject>();
      if (!frame.isNull()) handleLintFrame(frame);
      break;
    }
    default:
      break;
  }
}

// ------------------------------------------------------------------
// Setup / loop
// ------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[lint] Fabric lint waking up");

  strip.begin();
  strip.setBrightness(255);
  showColor(LINT_HUE, 0.05f); // faint own-hue idle while we connect

  // peerId: "lint:" + name slug + "-" + chip id tail (hex).
  String slug = String(LINT_NAME);
  slug.toLowerCase();
  slug.replace(" ", "-");
  uint32_t chipTail = (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF);
  peerId = "lint:" + slug + "-" + String(chipTail, HEX);
  Serial.printf("[lint] peer id: %s\n", peerId.c_str());

  // Capacitive baseline: average the untouched pad. NOTE: touch
  // thresholds vary by board/pad — if the pad mis-fires, print
  // touchRead() values and adjust the 0.62 factor below.
  delay(300);
  uint32_t sum = 0;
  for (int i = 0; i < 32; i++) {
    sum += touchRead(TOUCH_PIN);
    delay(5);
  }
  touchBaseline = sum / 32;
  Serial.printf("[lint] touch baseline: %u\n", (unsigned)touchBaseline);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[lint] Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\n[lint] Wi-Fi up: %s\n", WiFi.localIP().toString().c_str());

  webSocket.beginSSL(WS_HOST, WS_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void loop() {
  webSocket.loop();
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(250);
    return;
  }

  // Hello heartbeat: bridges keep a device registry; a quiet device
  // re-announces so late joiners learn it exists.
  if (wsJoined && now - lastHello > 20000) sendHello();

  // --- capacitive touch (polled, debounced, re-arming) ---
  if (now - lastTouchSent > 350) {
    uint32_t v = touchRead(TOUCH_PIN);
    if (touchArmed) {
      if (v < (uint32_t)(touchBaseline * 0.62f)) {
        if (++touchLowCount >= 2) {
          touchArmed = false;
          touchLowCount = 0;
          lastTouchSent = now;
          if (wsJoined) sendTouch();
          // Local confirmation flash in our own hue.
          pulseHue = LINT_HUE;
          pulseLevel = 1.0f;
          pulseUntil = now + 300;
        }
      } else {
        touchLowCount = 0;
      }
    } else if (v > (uint32_t)(touchBaseline * 0.8f)) {
      touchArmed = true;
    }
  }

  // --- render envelope (every ~16ms) ---
  static unsigned long lastRender = 0;
  if (now - lastRender >= 16) {
    lastRender = now;
    if (now - sustainStamp > 1600) sustainLevel *= 0.92f; // settle

    float pulse = (now < pulseUntil) ? pulseLevel : 0.0f;
    float breathe = 0.0f;
    if (now < breatheUntil) breathe = 0.30f + 0.18f * sinf(now / 450.0f);

    float level = sustainLevel;
    int hue = sustainHue;
    if (breathe > level) { level = breathe; hue = breatheHue; }
    if (pulse > level) { level = pulse; hue = pulseHue; }

    if (!wsJoined) {
      // Disconnected idle: a faint own-hue breathing so the object
      // still feels alive on the shelf.
      level = 0.05f + 0.03f * sinf(now / 900.0f);
      hue = LINT_HUE;
    }

    dispLevel += (level - dispLevel) * 0.35f;
    if (dispLevel < 0.004f) dispLevel = 0.0f;
    showColor(hue, dispLevel);
  }
}
