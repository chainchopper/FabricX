// Device types for microcontroller integration

export type DeviceType = 
  | "esp32"
  | "esp32-s3"
  | "arduino"
  | "raspberry-pi"
  | "arm882"
  | "luckfox"
  | "generic";

export type ConnectionType = 
  | "serial"      // Web Serial API (USB)
  | "bluetooth"   // Web Bluetooth API
  | "websocket"   // WiFi/Network
  | "webrtc";     // P2P data channel

export type DeviceCapability =
  | "accelerometer"
  | "gyroscope"
  | "magnetometer"
  | "temperature"
  | "humidity"
  | "pressure"
  | "light"
  | "proximity"
  | "rgb-led"
  | "ws2812-led"
  | "gpio"
  | "pwm"
  | "i2c"
  | "spi"
  | "uart"
  | "adc"
  | "dac";

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceType;
  connectionType: ConnectionType;
  capabilities: DeviceCapability[];
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface SensorData {
  deviceId: string;
  timestamp: number;
  type: string;
  values: Record<string, number>;
  unit?: string;
}

export interface DeviceCommand {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface DeviceStatus {
  connected: boolean;
  lastSeen: number;
  batteryLevel?: number;
  signalStrength?: number;
  error?: string;
}

export interface LEDControl {
  index?: number;      // Single LED index, omit for all
  color: { r: number; g: number; b: number };
  brightness?: number; // 0-255
  pattern?: "solid" | "pulse" | "breathe" | "rainbow";
  duration?: number;   // For patterns
}

export interface IMUData {
  accelerometer: { x: number; y: number; z: number };
  gyroscope: { x: number; y: number; z: number };
  magnetometer?: { x: number; y: number; z: number };
  temperature?: number;
}

export interface DeviceConfig {
  sampleRate?: number;        // Hz
  enabledSensors?: string[];
  ledBrightness?: number;     // 0-255
  wifiSSID?: string;
  wifiPassword?: string;
  deviceName?: string;
  autoReconnect?: boolean;
}
