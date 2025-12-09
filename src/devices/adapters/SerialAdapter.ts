// Web Serial API adapter for USB-connected devices
import { BaseDeviceAdapter } from "./BaseDeviceAdapter";
import type {
  DeviceInfo,
  DeviceCommand,
  DeviceConfig,
  SensorData,
  ConnectionType,
} from "../../types/device";

interface SerialDevice {
  port: SerialPort;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  writer: WritableStreamDefaultWriter<Uint8Array> | null;
}

export class SerialAdapter extends BaseDeviceAdapter {
  private serialDevice: SerialDevice | null = null;
  private readBuffer: string = "";

  isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async discover(): Promise<DeviceInfo[]> {
    if (!this.isSupported()) {
      throw new Error("Web Serial API not supported");
    }

    try {
      const port = await (navigator as any).serial.requestPort({
        filters: [
          { usbVendorId: 0x303a }, // Espressif (ESP32)
          { usbVendorId: 0x2341 }, // Arduino
          { usbVendorId: 0x10c4 }, // Silicon Labs (common USB-Serial chip)
          { usbVendorId: 0x1a86 }, // QinHeng Electronics (CH340)
        ],
      });

      const info = port.getInfo();
      const deviceId = `serial-${info.usbVendorId}-${info.usbProductId}`;

      return [
        {
          id: deviceId,
          name: `USB Device (${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)})`,
          type: "esp32", // Default assumption, can be detected via handshake
          connectionType: "serial" as ConnectionType,
          capabilities: [],
          metadata: { port, info },
        },
      ];
    } catch (err) {
      console.error("Serial discovery error:", err);
      return [];
    }
  }

  async connect(deviceId: string): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("Web Serial API not supported");
    }

    try {
      // Get the port from previous discovery or list of granted ports
      const ports = await (navigator as any).serial.getPorts();
      let port: SerialPort | null = null;

      if (ports.length > 0) {
        port = ports[0]; // Use first available port
      } else {
        // Trigger discovery if no ports are available
        const discovered = await this.discover();
        if (discovered.length > 0 && discovered[0].metadata?.port) {
          port = discovered[0].metadata.port as SerialPort;
        }
      }

      if (!port) {
        throw new Error("No serial port available");
      }

      await port.open({ baudRate: 115200 });

      this.serialDevice = {
        port,
        reader: null,
        writer: null,
      };

      // Set up reader
      if (port.readable) {
        this.serialDevice.reader = port.readable.getReader();
        this.startReading();
      }

      // Set up writer
      if (port.writable) {
        this.serialDevice.writer = port.writable.getWriter();
      }

      this.device = {
        id: deviceId,
        name: "Serial Device",
        type: "esp32",
        connectionType: "serial",
        capabilities: [],
      };

      this.notifyStatusChange({
        connected: true,
        lastSeen: Date.now(),
      });

      // Send handshake to identify device
      await this.send({
        type: "handshake",
        payload: { version: "1.0" },
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("Serial connection error:", err);
      this.notifyStatusChange({
        connected: false,
        lastSeen: Date.now(),
        error: err instanceof Error ? err.message : "Connection failed",
      });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.serialDevice?.reader) {
        await this.serialDevice.reader.cancel();
        this.serialDevice.reader.releaseLock();
        this.serialDevice.reader = null;
      }

      if (this.serialDevice?.writer) {
        this.serialDevice.writer.releaseLock();
        this.serialDevice.writer = null;
      }

      if (this.serialDevice?.port) {
        await this.serialDevice.port.close();
      }

      this.serialDevice = null;
      this.device = null;

      this.notifyStatusChange({
        connected: false,
        lastSeen: Date.now(),
      });
    } catch (err) {
      console.error("Serial disconnection error:", err);
    }
  }

  async send(command: DeviceCommand): Promise<void> {
    if (!this.serialDevice?.writer) {
      throw new Error("Serial port not connected");
    }

    try {
      const message = JSON.stringify(command) + "\n";
      const encoder = new TextEncoder();
      await this.serialDevice.writer.write(encoder.encode(message));
    } catch (err) {
      console.error("Serial send error:", err);
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

  private async startReading(): Promise<void> {
    if (!this.serialDevice?.reader) return;

    try {
      while (this.serialDevice?.reader) {
        const { value, done } = await this.serialDevice.reader.read();
        if (done || !value) break;

        const decoder = new TextDecoder();
        const chunk = decoder.decode(value);
        this.readBuffer += chunk;

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = this.readBuffer.indexOf("\n")) !== -1) {
          const line = this.readBuffer.substring(0, newlineIndex).trim();
          this.readBuffer = this.readBuffer.substring(newlineIndex + 1);

          if (line) {
            this.processMessage(line);
          }
        }

        // Update last seen
        this.notifyStatusChange({
          ...this.status,
          lastSeen: Date.now(),
        });
      }
    } catch (err) {
      console.error("Serial read error:", err);
      this.notifyStatusChange({
        connected: false,
        lastSeen: Date.now(),
        error: err instanceof Error ? err.message : "Read error",
      });
    }
  }

  private processMessage(line: string): void {
    try {
      const data = JSON.parse(line);

      if (data.type === "sensor") {
        const sensorData: SensorData = {
          deviceId: this.device?.id || "unknown",
          timestamp: data.timestamp || Date.now(),
          type: data.sensor || "unknown",
          values: data.values || {},
          unit: data.unit,
        };
        this.notifyData(sensorData);
      } else if (data.type === "handshake_response") {
        // Update device info with capabilities
        if (this.device && data.capabilities) {
          this.device = {
            ...this.device,
            capabilities: data.capabilities,
            version: data.version,
          };
        }
      }
    } catch (err) {
      // Not JSON, might be debug output - ignore
      console.log("Serial:", line);
    }
  }
}
