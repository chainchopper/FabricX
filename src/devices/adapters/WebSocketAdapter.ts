// WebSocket adapter for WiFi-connected devices
import { BaseDeviceAdapter } from "./BaseDeviceAdapter";
import type {
  DeviceInfo,
  DeviceCommand,
  DeviceConfig,
  SensorData,
  ConnectionType,
} from "../../types/device";

export class WebSocketAdapter extends BaseDeviceAdapter {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private url: string = "";

  isSupported(): boolean {
    return typeof WebSocket !== "undefined";
  }

  async discover(): Promise<DeviceInfo[]> {
    // WebSocket devices need manual URL entry or mDNS discovery
    // For now, we return empty and require manual connection
    return [];
  }

  async connect(deviceId: string): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("WebSocket not supported");
    }

    // DeviceId should be in format: ws://ip:port or wss://hostname:port
    this.url = deviceId;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.device = {
            id: deviceId,
            name: `WebSocket Device (${new URL(this.url).hostname})`,
            type: "esp32", // Default, can be updated via handshake
            connectionType: "websocket" as ConnectionType,
            capabilities: [],
          };

          this.notifyStatusChange({
            connected: true,
            lastSeen: Date.now(),
          });

          // Send handshake
          this.send({
            type: "handshake",
            payload: { version: "1.0" },
            timestamp: Date.now(),
          }).catch(console.error);

          resolve();
        };

        this.ws.onerror = (event) => {
          console.error("WebSocket error:", event);
          this.notifyStatusChange({
            connected: false,
            lastSeen: Date.now(),
            error: "Connection error",
          });
          reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = () => {
          this.notifyStatusChange({
            connected: false,
            lastSeen: Date.now(),
          });
          this.attemptReconnect();
        };

        this.ws.onmessage = (event) => {
          this.processMessage(event.data);
          this.notifyStatusChange({
            ...this.status,
            lastSeen: Date.now(),
          });
        };
      } catch (err) {
        console.error("WebSocket connection error:", err);
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Send disconnect message before closing
      try {
        await this.send({
          type: "disconnect",
          payload: {},
          timestamp: Date.now(),
        });
      } catch {
        // Ignore errors during disconnect
      }

      this.ws.close();
      this.ws = null;
    }

    this.device = null;
    this.reconnectAttempts = 0;

    this.notifyStatusChange({
      connected: false,
      lastSeen: Date.now(),
    });
  }

  async send(command: DeviceCommand): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    try {
      const message = JSON.stringify(command);
      this.ws.send(message);
    } catch (err) {
      console.error("WebSocket send error:", err);
      throw err;
    }
  }

  async configure(config: DeviceConfig): Promise<void> {
    await this.send({
      type: "configure",
      payload: config,
      timestamp: Date.now(),
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyStatusChange({
        connected: false,
        lastSeen: Date.now(),
        error: "Max reconnection attempts reached",
      });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = window.setTimeout(() => {
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
      this.connect(this.url).catch((err) => {
        console.error("Reconnection failed:", err);
      });
    }, delay);
  }

  private processMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      if (msg.type === "sensor") {
        const sensorData: SensorData = {
          deviceId: this.device?.id || "unknown",
          timestamp: msg.timestamp || Date.now(),
          type: msg.sensor || "unknown",
          values: msg.values || {},
          unit: msg.unit,
        };
        this.notifyData(sensorData);
      } else if (msg.type === "handshake_response") {
        // Update device info
        if (this.device && msg.capabilities) {
          this.device = {
            ...this.device,
            name: msg.name || this.device.name,
            type: msg.deviceType || this.device.type,
            capabilities: msg.capabilities,
            version: msg.version,
          };
        }
      } else if (msg.type === "status") {
        // Update device status
        this.notifyStatusChange({
          ...this.status,
          batteryLevel: msg.battery,
          signalStrength: msg.rssi,
        });
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  }
}
