/**
 * BluetoothAdapter - Web Bluetooth API adapter for BLE devices
 * Powered by Nirvana
 */

import type { DeviceInfo, SensorData } from "../types/device";

export interface BluetoothDevice {
  device: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  service?: BluetoothRemoteGATTService;
  characteristics: Map<string, BluetoothRemoteGATTCharacteristic>;
}

export interface BluetoothAdapterConfig {
  services?: BluetoothServiceUUID[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
  namePrefix?: string;
}

export class BluetoothAdapter {
  private devices: Map<string, BluetoothDevice> = new Map();
  private callbacks: Map<string, Set<(data: SensorData) => void>> = new Map();
  private statusCallbacks: Map<
    string,
    Set<(connected: boolean) => void>
  > = new Map();

  constructor() {
    console.log("[Bluetooth] Adapter initialized");
  }

  /**
   * Check if Web Bluetooth is supported
   */
  isSupported(): boolean {
    if (typeof navigator === "undefined") return false;
    return "bluetooth" in navigator;
  }

  /**
   * Request and connect to a Bluetooth device
   */
  async discover(config?: BluetoothAdapterConfig): Promise<DeviceInfo[]> {
    if (!this.isSupported()) {
      throw new Error("Web Bluetooth is not supported in this browser. Try Chrome, Edge, or Opera.");
    }

    console.log("[Bluetooth] Requesting device...");

    try {
      const options: RequestDeviceOptions = {
        acceptAllDevices: config?.acceptAllDevices ?? false,
        optionalServices: config?.optionalServices || [],
      };

      // If not accepting all devices, we need filters
      if (!config?.acceptAllDevices) {
        options.filters = [];
        
        // Filter by services if provided
        if (config?.services && config.services.length > 0) {
          options.filters.push({ services: config.services });
        }
        
        // Filter by name prefix if provided
        if (config?.namePrefix) {
          options.filters.push({ namePrefix: config.namePrefix });
        }

        // If no filters, fall back to accepting all
        if (options.filters.length === 0) {
          delete options.filters;
          options.acceptAllDevices = true;
        }
      }

      const device = await navigator.bluetooth.requestDevice(options);

      console.log(`[Bluetooth] Found device: ${device.name || device.id}`);

      // Create device info
      const deviceInfo: DeviceInfo = {
        id: device.id,
        name: device.name || "Unknown BLE Device",
        type: "esp32", // Assume ESP32 for now
        connectionType: "bluetooth",
        capabilities: [], // Will be populated after connecting
      };

      return [deviceInfo];
    } catch (err) {
      console.error("[Bluetooth] Discovery failed:", err);
      throw new Error(`Bluetooth discovery failed: ${err}`);
    }
  }

  /**
   * Connect to a Bluetooth device
   */
  async connect(deviceInfo: DeviceInfo): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("Web Bluetooth is not supported");
    }

    console.log(`[Bluetooth] Connecting to ${deviceInfo.name}...`);

    try {
      // Request device (user will select from list)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["battery_service", "device_information"],
      });

      console.log(`[Bluetooth] Connecting to GATT server...`);
      const server = await device.gatt?.connect();

      if (!server) {
        throw new Error("Failed to connect to GATT server");
      }

      // Store device
      this.devices.set(deviceInfo.id, {
        device: device as any,
        server,
        characteristics: new Map(),
      });

      // Set up disconnect handler
      device.addEventListener("gattserverdisconnected", () => {
        console.log(`[Bluetooth] Device ${deviceInfo.name} disconnected`);
        this.notifyStatusChange(deviceInfo.id, false);
      });

      this.notifyStatusChange(deviceInfo.id, true);
      console.log(`[Bluetooth] Connected to ${deviceInfo.name}`);
    } catch (err) {
      console.error("[Bluetooth] Connection failed:", err);
      throw new Error(`Bluetooth connection failed: ${err}`);
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const bleDevice = this.devices.get(deviceId);
    if (!bleDevice) {
      console.warn(`[Bluetooth] Device ${deviceId} not found`);
      return;
    }

    console.log(`[Bluetooth] Disconnecting device ${deviceId}...`);

    try {
      if (bleDevice.server?.connected) {
        bleDevice.server.disconnect();
      }

      this.devices.delete(deviceId);
      this.notifyStatusChange(deviceId, false);
      console.log(`[Bluetooth] Device ${deviceId} disconnected`);
    } catch (err) {
      console.error("[Bluetooth] Disconnect failed:", err);
    }
  }

  /**
   * Disconnect all devices
   */
  async disconnectAll(): Promise<void> {
    console.log("[Bluetooth] Disconnecting all devices...");

    const disconnectPromises = Array.from(this.devices.keys()).map((deviceId) =>
      this.disconnect(deviceId)
    );

    await Promise.all(disconnectPromises);
  }

  /**
   * Send data to a device
   */
  async sendData(deviceId: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    const bleDevice = this.devices.get(deviceId);
    if (!bleDevice || !bleDevice.server?.connected) {
      throw new Error("Device not connected");
    }

    // For sending data, we'll need to know the service and characteristic UUIDs
    // This is a placeholder implementation
    console.warn("[Bluetooth] sendData requires service/characteristic UUIDs");
  }

  /**
   * Send command to device
   */
  async sendCommand(deviceId: string, command: any): Promise<void> {
    const bleDevice = this.devices.get(deviceId);
    if (!bleDevice || !bleDevice.server?.connected) {
      throw new Error("Device not connected");
    }

    console.log(`[Bluetooth] Sending command to ${deviceId}:`, command);

    // Serialize command as JSON
    const commandStr = JSON.stringify(command);
    const encoder = new TextEncoder();
    const data = encoder.encode(commandStr);

    await this.sendData(deviceId, data);
  }

  /**
   * Read a characteristic value
   */
  async readCharacteristic(
    deviceId: string,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID
  ): Promise<DataView> {
    const bleDevice = this.devices.get(deviceId);
    if (!bleDevice || !bleDevice.server?.connected) {
      throw new Error("Device not connected");
    }

    try {
      const service = await bleDevice.server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);
      const value = await characteristic.readValue();

      return value;
    } catch (err) {
      console.error("[Bluetooth] Read characteristic failed:", err);
      throw new Error(`Read characteristic failed: ${err}`);
    }
  }

  /**
   * Write to a characteristic
   */
  async writeCharacteristic(
    deviceId: string,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    value: ArrayBuffer | Uint8Array
  ): Promise<void> {
    const bleDevice = this.devices.get(deviceId);
    if (!bleDevice || !bleDevice.server?.connected) {
      throw new Error("Device not connected");
    }

    try {
      const service = await bleDevice.server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);
      await characteristic.writeValue(value);

      console.log("[Bluetooth] Write successful");
    } catch (err) {
      console.error("[Bluetooth] Write characteristic failed:", err);
      throw new Error(`Write characteristic failed: ${err}`);
    }
  }

  /**
   * Subscribe to characteristic notifications
   */
  async subscribeToCharacteristic(
    deviceId: string,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    callback: (value: DataView) => void
  ): Promise<void> {
    const bleDevice = this.devices.get(deviceId);
    if (!bleDevice || !bleDevice.server?.connected) {
      throw new Error("Device not connected");
    }

    try {
      const service = await bleDevice.server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);

      // Start notifications
      await characteristic.startNotifications();

      // Add event listener
      characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
        callback(event.target.value);
      });

      console.log("[Bluetooth] Subscribed to notifications");
    } catch (err) {
      console.error("[Bluetooth] Subscribe failed:", err);
      throw new Error(`Subscribe to characteristic failed: ${err}`);
    }
  }

  /**
   * Register data callback
   */
  onData(deviceId: string, callback: (data: SensorData) => void): () => void {
    if (!this.callbacks.has(deviceId)) {
      this.callbacks.set(deviceId, new Set());
    }
    this.callbacks.get(deviceId)!.add(callback);

    return () => {
      this.callbacks.get(deviceId)?.delete(callback);
    };
  }

  /**
   * Register status change callback
   */
  onStatusChange(
    deviceId: string,
    callback: (connected: boolean) => void
  ): () => void {
    if (!this.statusCallbacks.has(deviceId)) {
      this.statusCallbacks.set(deviceId, new Set());
    }
    this.statusCallbacks.get(deviceId)!.add(callback);

    return () => {
      this.statusCallbacks.get(deviceId)?.delete(callback);
    };
  }

  /**
   * Notify status change
   */
  private notifyStatusChange(deviceId: string, connected: boolean): void {
    const callbacks = this.statusCallbacks.get(deviceId);
    if (callbacks) {
      callbacks.forEach((callback) => callback(connected));
    }
  }

  /**
   * Notify data received
   */
  private notifyData(data: SensorData): void {
    const callbacks = this.callbacks.get(data.deviceId);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  /**
   * Get connected devices
   */
  getDevices(): string[] {
    return Array.from(this.devices.keys());
  }

  /**
   * Check if device is connected
   */
  isConnected(deviceId: string): boolean {
    const bleDevice = this.devices.get(deviceId);
    return bleDevice?.server?.connected ?? false;
  }
}

// Singleton instance
let bluetoothAdapter: BluetoothAdapter | null = null;

export function getBluetoothAdapter(): BluetoothAdapter {
  if (!bluetoothAdapter) {
    bluetoothAdapter = new BluetoothAdapter();
  }
  return bluetoothAdapter;
}
