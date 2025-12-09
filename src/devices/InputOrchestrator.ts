// Central device management system
import type { DeviceAdapter } from "./adapters/BaseDeviceAdapter";
import { SerialAdapter } from "./adapters/SerialAdapter";
import { WebSocketAdapter } from "./adapters/WebSocketAdapter";
import type {
  DeviceInfo,
  DeviceStatus,
  SensorData,
  DeviceCommand,
  DeviceConfig,
  ConnectionType,
} from "../types/device";

export interface ManagedDevice {
  adapter: DeviceAdapter;
  info: DeviceInfo;
  status: DeviceStatus;
}

export class InputOrchestrator {
  private devices = new Map<string, ManagedDevice>();
  private adapters: Map<ConnectionType, DeviceAdapter> = new Map();
  private dataHandlers = new Set<(data: SensorData, deviceId: string) => void>();
  private statusHandlers = new Set<(deviceId: string, status: DeviceStatus) => void>();
  private deviceChangeHandlers = new Set<() => void>();

  constructor() {
    // Initialize adapters
    this.adapters.set("serial", new SerialAdapter());
    this.adapters.set("websocket", new WebSocketAdapter());
  }

  /**
   * Get all supported connection types
   */
  getSupportedTypes(): ConnectionType[] {
    const supported: ConnectionType[] = [];
    this.adapters.forEach((adapter, type) => {
      if (adapter.isSupported()) {
        supported.push(type);
      }
    });
    return supported;
  }

  /**
   * Discover devices for a specific connection type
   */
  async discover(type: ConnectionType): Promise<DeviceInfo[]> {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`No adapter for connection type: ${type}`);
    }

    if (!adapter.isSupported()) {
      throw new Error(`Connection type ${type} not supported`);
    }

    return adapter.discover();
  }

  /**
   * Connect to a device
   */
  async connect(deviceInfo: DeviceInfo): Promise<void> {
    const adapter = this.adapters.get(deviceInfo.connectionType);
    if (!adapter) {
      throw new Error(`No adapter for connection type: ${deviceInfo.connectionType}`);
    }

    // Create new adapter instance for this device
    const deviceAdapter = this.createAdapter(deviceInfo.connectionType);
    if (!deviceAdapter) {
      throw new Error(`Failed to create adapter for ${deviceInfo.connectionType}`);
    }

    // Set up event handlers
    deviceAdapter.onData((data) => {
      this.notifyData(data, deviceInfo.id);
    });

    deviceAdapter.onStatusChange((status) => {
      const device = this.devices.get(deviceInfo.id);
      if (device) {
        device.status = status;
        this.notifyStatusChange(deviceInfo.id, status);
      }
    });

    // Connect
    await deviceAdapter.connect(deviceInfo.id);

    // Store managed device
    this.devices.set(deviceInfo.id, {
      adapter: deviceAdapter,
      info: deviceInfo,
      status: deviceAdapter.getStatus(),
    });

    this.notifyDeviceChange();
  }

  /**
   * Disconnect a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    await device.adapter.disconnect();
    this.devices.delete(deviceId);
    this.notifyDeviceChange();
  }

  /**
   * Disconnect all devices
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.devices.keys()).map((id) =>
      this.disconnect(id).catch(console.error)
    );
    await Promise.all(promises);
  }

  /**
   * Send command to a specific device
   */
  async sendCommand(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    await device.adapter.send(command);
  }

  /**
   * Configure a device
   */
  async configureDevice(deviceId: string, config: DeviceConfig): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    await device.adapter.configure(config);
  }

  /**
   * Get all connected devices
   */
  getDevices(): ManagedDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get a specific device
   */
  getDevice(deviceId: string): ManagedDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Subscribe to sensor data from all devices
   */
  onData(handler: (data: SensorData, deviceId: string) => void): () => void {
    this.dataHandlers.add(handler);
    return () => {
      this.dataHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(
    handler: (deviceId: string, status: DeviceStatus) => void
  ): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to device list changes (connect/disconnect)
   */
  onDeviceChange(handler: () => void): () => void {
    this.deviceChangeHandlers.add(handler);
    return () => {
      this.deviceChangeHandlers.delete(handler);
    };
  }

  private createAdapter(type: ConnectionType): DeviceAdapter | null {
    switch (type) {
      case "serial":
        return new SerialAdapter();
      case "websocket":
        return new WebSocketAdapter();
      default:
        return null;
    }
  }

  private notifyData(data: SensorData, deviceId: string): void {
    this.dataHandlers.forEach((h) => h(data, deviceId));
  }

  private notifyStatusChange(deviceId: string, status: DeviceStatus): void {
    this.statusHandlers.forEach((h) => h(deviceId, status));
  }

  private notifyDeviceChange(): void {
    this.deviceChangeHandlers.forEach((h) => h());
  }
}

// Singleton instance
let orchestratorInstance: InputOrchestrator | null = null;

export function getInputOrchestrator(): InputOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new InputOrchestrator();
  }
  return orchestratorInstance;
}
