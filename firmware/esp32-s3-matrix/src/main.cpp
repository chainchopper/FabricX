/**
 * ESP32-S3 Matrix Firmware for FabricX
 * Waveshare ESP32-S3-Matrix Support
 * 
 * Features:
 * - WiFi configuration via WiFiManager
 * - WebSocket server for remote control
 * - Serial communication
 * - IMU sensor (MPU6050) reading
 * - WS2812 LED matrix control (5x5 = 25 LEDs)
 * - OTA updates
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <NeoPixelBus.h>
#include <ArduinoOTA.h>

// Pin definitions (adjust based on actual board)
#define LED_PIN 21
#define LED_COUNT 25        // 5x5 matrix
#define IMU_SDA 8
#define IMU_SCL 9
#define BUTTON_PIN 0       // Boot button

// Device info
#define DEVICE_NAME "FabricX-ESP32-S3-Matrix"
#define DEVICE_VERSION "1.0.0"
#define WS_PORT 8080

// Global objects
Adafruit_MPU6050 mpu;
NeoPixelBus<NeoGrbFeature, Neo800KbpsMethod> pixels(LED_COUNT, LED_PIN);
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// State
bool imuConnected = false;
unsigned long lastSensorRead = 0;
unsigned long sensorInterval = 50; // 20Hz
bool wifiConfigMode = false;

// Configuration
struct Config {
  int sampleRate = 20; // Hz
  int ledBrightness = 128; // 0-255
  bool autoSend = true;
} config;

/**
 * Initialize IMU sensor
 */
void setupIMU() {
  Wire.begin(IMU_SDA, IMU_SCL);
  
  if (mpu.begin(0x68, &Wire)) {
    Serial.println("MPU6050 found!");
    
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    
    imuConnected = true;
  } else {
    Serial.println("Failed to find MPU6050 chip");
    imuConnected = false;
  }
}

/**
 * Read IMU data and return as JSON
 */
String readIMU() {
  if (!imuConnected) return "{}";
  
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);
  
  JsonDocument doc;
  doc["type"] = "sensor";
  doc["sensor"] = "imu";
  doc["timestamp"] = millis();
  
  JsonObject values = doc["values"].to<JsonObject>();
  values["accel_x"] = accel.acceleration.x;
  values["accel_y"] = accel.acceleration.y;
  values["accel_z"] = accel.acceleration.z;
  values["gyro_x"] = gyro.gyro.x;
  values["gyro_y"] = gyro.gyro.y;
  values["gyro_z"] = gyro.gyro.z;
  values["temperature"] = temp.temperature;
  
  String output;
  serializeJson(doc, output);
  return output;
}

/**
 * Set LED color at specific index
 */
void setLED(int index, uint8_t r, uint8_t g, uint8_t b) {
  if (index < 0 || index >= LED_COUNT) return;
  
  // Apply brightness scaling
  float scale = config.ledBrightness / 255.0;
  pixels.SetPixelColor(index, RgbColor(
    (uint8_t)(r * scale),
    (uint8_t)(g * scale),
    (uint8_t)(b * scale)
  ));
}

/**
 * Set all LEDs to same color
 */
void setAllLEDs(uint8_t r, uint8_t g, uint8_t b) {
  for (int i = 0; i < LED_COUNT; i++) {
    setLED(i, r, g, b);
  }
  pixels.Show();
}

/**
 * Process incoming command
 */
void processCommand(const JsonDocument& doc) {
  const char* type = doc["type"];
  
  if (strcmp(type, "handshake") == 0) {
    // Send handshake response
    JsonDocument response;
    response["type"] = "handshake_response";
    response["name"] = DEVICE_NAME;
    response["version"] = DEVICE_VERSION;
    response["deviceType"] = "esp32-s3";
    
    JsonArray caps = response["capabilities"].to<JsonArray>();
    caps.add("accelerometer");
    caps.add("gyroscope");
    caps.add("temperature");
    caps.add("ws2812-led");
    caps.add("gpio");
    
    String output;
    serializeJson(response, output);
    Serial.println(output);
    ws.textAll(output);
    
  } else if (strcmp(type, "configure") == 0) {
    JsonObject payload = doc["payload"];
    if (payload.containsKey("sampleRate")) {
      config.sampleRate = payload["sampleRate"];
      sensorInterval = 1000 / config.sampleRate;
    }
    if (payload.containsKey("ledBrightness")) {
      config.ledBrightness = payload["ledBrightness"];
    }
    if (payload.containsKey("autoSend")) {
      config.autoSend = payload["autoSend"];
    }
    
  } else if (strcmp(type, "led") == 0) {
    JsonObject payload = doc["payload"];
    
    if (payload.containsKey("index")) {
      int idx = payload["index"];
      JsonObject color = payload["color"];
      setLED(idx, color["r"], color["g"], color["b"]);
    } else {
      // Set all LEDs
      JsonObject color = payload["color"];
      setAllLEDs(color["r"], color["g"], color["b"]);
    }
    pixels.Show();
    
  } else if (strcmp(type, "pattern") == 0) {
    // TODO: Implement LED patterns
    
  } else if (strcmp(type, "read_sensor") == 0) {
    String data = readIMU();
    Serial.println(data);
    ws.textAll(data);
  }
}

/**
 * WebSocket event handler
 */
void onWSEvent(AsyncWebSocket* server, AsyncWebSocketClient* client, 
               AwsEventType type, void* arg, uint8_t* data, size_t len) {
  
  if (type == WS_EVT_CONNECT) {
    Serial.printf("WebSocket client #%u connected from %s\n", 
                  client->id(), client->remoteIP().toString().c_str());
    
    // Send handshake on connect
    JsonDocument doc;
    doc["type"] = "handshake";
    String output;
    serializeJson(doc, output);
    processCommand(doc);
    
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
    
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len) {
      if (info->opcode == WS_TEXT) {
        data[len] = 0; // null terminate
        
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, (char*)data);
        
        if (!error) {
          processCommand(doc);
        } else {
          Serial.println("JSON parse error");
        }
      }
    }
  }
}

/**
 * Setup WiFi
 */
void setupWiFi() {
  WiFiManager wm;
  
  // Set custom callback to know when WiFi is configured
  wm.setAPCallback([](WiFiManager* wm) {
    Serial.println("Config mode");
    wifiConfigMode = true;
    // Show config mode on LEDs (blue pulse)
    setAllLEDs(0, 0, 255);
  });
  
  wm.setSaveConfigCallback([]() {
    Serial.println("Config saved");
    wifiConfigMode = false;
  });
  
  // Set timeout
  wm.setConfigPortalTimeout(180); // 3 minutes
  
  // Try to connect with saved credentials or start AP
  String apName = String(DEVICE_NAME) + "_" + String((uint32_t)ESP.getEfuseMac(), HEX);
  
  // SECURITY NOTE: Change default password for production use!
  // Consider generating device-specific passwords or requiring setup
  if (!wm.autoConnect(apName.c_str(), "fabricx123")) {
    Serial.println("Failed to connect, restarting...");
    delay(3000);
    ESP.restart();
  }
  
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Show connected status (green)
  setAllLEDs(0, 255, 0);
  delay(1000);
  setAllLEDs(0, 0, 0);
}

/**
 * Setup OTA updates
 */
void setupOTA() {
  ArduinoOTA.setHostname(DEVICE_NAME);
  // SECURITY NOTE: Change default password for production use!
  ArduinoOTA.setPassword("fabricx123");
  
  ArduinoOTA.onStart([]() {
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
    Serial.println("Start updating " + type);
    setAllLEDs(255, 255, 0); // Yellow during update
  });
  
  ArduinoOTA.onEnd([]() {
    Serial.println("\nUpdate complete!");
    setAllLEDs(0, 255, 0); // Green on success
  });
  
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    int percent = (progress / (total / 100));
    Serial.printf("Progress: %u%%\r", percent);
    
    // Show progress on LEDs
    int numLEDs = (percent * LED_COUNT) / 100;
    for (int i = 0; i < LED_COUNT; i++) {
      if (i < numLEDs) {
        setLED(i, 0, 255, 0);
      } else {
        setLED(i, 0, 0, 0);
      }
    }
    pixels.Show();
  });
  
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
    setAllLEDs(255, 0, 0); // Red on error
  });
  
  ArduinoOTA.begin();
  Serial.println("OTA ready");
}

/**
 * Setup web server
 */
void setupWebServer() {
  // WebSocket handler
  ws.onEvent(onWSEvent);
  server.addHandler(&ws);
  
  // Root page with device info
  server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
    String html = "<!DOCTYPE html><html><head><title>" + String(DEVICE_NAME) + "</title></head>";
    html += "<body style='font-family:sans-serif;padding:20px;'>";
    html += "<h1>" + String(DEVICE_NAME) + "</h1>";
    html += "<p>Version: " + String(DEVICE_VERSION) + "</p>";
    html += "<p>IP: " + WiFi.localIP().toString() + "</p>";
    html += "<p>WebSocket: ws://" + WiFi.localIP().toString() + ":" + String(WS_PORT) + "/ws</p>";
    html += "<p>IMU Status: " + String(imuConnected ? "Connected" : "Disconnected") + "</p>";
    html += "<p><a href='/reset'>Reset WiFi Settings</a></p>";
    html += "</body></html>";
    request->send(200, "text/html", html);
  });
  
  // Reset WiFi settings
  server.on("/reset", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send(200, "text/plain", "WiFi settings reset. Device will restart...");
    delay(1000);
    WiFiManager wm;
    wm.resetSettings();
    ESP.restart();
  });
  
  server.begin();
  Serial.println("Web server started");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=== FabricX ESP32-S3 Matrix ===");
  Serial.println("Version: " + String(DEVICE_VERSION));
  
  // Initialize LEDs
  pixels.Begin();
  setAllLEDs(0, 0, 0);
  pixels.Show();
  
  // Initialize IMU
  setupIMU();
  
  // Setup WiFi
  setupWiFi();
  
  // Setup OTA
  setupOTA();
  
  // Setup web server and WebSocket
  setupWebServer();
  
  // Boot complete indicator
  setAllLEDs(0, 255, 0);
  delay(500);
  setAllLEDs(0, 0, 0);
  
  Serial.println("Setup complete!");
  Serial.println("Ready for connections.");
}

void loop() {
  // Handle OTA
  ArduinoOTA.handle();
  
  // Clean up WebSocket connections
  ws.cleanupClients();
  
  // Read and send sensor data periodically
  if (config.autoSend && (millis() - lastSensorRead >= sensorInterval)) {
    lastSensorRead = millis();
    
    if (imuConnected) {
      String data = readIMU();
      
      // Send via Serial
      Serial.println(data);
      
      // Send via WebSocket
      ws.textAll(data);
    }
  }
  
  // Process Serial commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    
    if (line.length() > 0) {
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, line);
      
      if (!error) {
        processCommand(doc);
      }
    }
  }
  
  delay(1); // Yield to watchdog
}
