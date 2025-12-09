// Base adapter interface for device connections
import type { 
  DeviceInfo, 
  DeviceStatus, 
  SensorData, 
  DeviceCommand,
  DeviceConfig 
} from "../../types/device";

export interface DeviceAdapter {
  // Connection management
  isSupported(): boolean;
  discover(): Promise<DeviceInfo[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  
  // Status
  getStatus(): DeviceStatus;
  getDeviceInfo(): DeviceInfo | null;
  
  // Communication
  send(command: DeviceCommand): Promise<void>;
  onData(handler: (data: SensorData) => void): () => void;
  onStatusChange(handler: (status: DeviceStatus) => void): () => void;
  
  // Configuration
  configure(config: DeviceConfig): Promise<void>;
}

export abstract class BaseDeviceAdapter implements DeviceAdapter {
  protected device: DeviceInfo | null = null;
  protected status: DeviceStatus = {
    connected: false,
    lastSeen: 0,
  };
  protected dataHandlers = new Set<(data: SensorData) => void>();
  protected statusHandlers = new Set<(status: DeviceStatus) => void>();

  abstract isSupported(): boolean;
  abstract discover(): Promise<DeviceInfo[]>;
  abstract connect(deviceId: string): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(command: DeviceCommand): Promise<void>;
  abstract configure(config: DeviceConfig): Promise<void>;

  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  getDeviceInfo(): DeviceInfo | null {
    return this.device ? { ...this.device } : null;
  }

  onData(handler: (data: SensorData) => void): () => void {
    this.dataHandlers.add(handler);
    return () => {
      this.dataHandlers.delete(handler);
    };
  }

  onStatusChange(handler: (status: DeviceStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  protected notifyData(data: SensorData): void {
    this.dataHandlers.forEach((h) => h(data));
  }

  protected notifyStatusChange(status: DeviceStatus): void {
    this.status = { ...status };
    this.statusHandlers.forEach((h) => h(status));
  }
}
