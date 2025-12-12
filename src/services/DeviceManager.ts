// Device Manager - Centralized device management with S3 Matrix integration
// Handles discovery, connection, firmware updates, and pairing

import { S3MatrixProtocol, S3MatrixDevice, S3MatrixCommand, S3MatrixSensorData } from './S3MatrixProtocol';
import { SerialAdapter } from '../devices/adapters/SerialAdapter';
import { WebSocketAdapter } from '../devices/adapters/WebSocketAdapter';
import type { DeviceInfo, ConnectionType } from '../types/device';

export interface ManagedDevice {
  info: DeviceInfo;
  protocol: S3MatrixProtocol | null;
  adapter: SerialAdapter | WebSocketAdapter | null;
  connected: boolean;
  lastSeen: number;
}

type DeviceEventHandler = (device: ManagedDevice) => void;
type SensorDataHandler = (deviceId: string, data: S3MatrixSensorData) => void;
type ButtonPressHandler = (deviceId: string, button: number, pressed: boolean) => void;

export class DeviceManager {
  private static instance: DeviceManager;
  private devices: Map<string, ManagedDevice> = new Map();
  private deviceEventHandlers: DeviceEventHandler[] = [];
  private sensorDataHandlers: SensorDataHandler[] = [];
  private buttonPressHandlers: ButtonPressHandler[] = [];

  private constructor() {}

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  /**
   * Discover available devices
   */
  async discoverDevices(type: ConnectionType): Promise<DeviceInfo[]> {
    let adapter: SerialAdapter | WebSocketAdapter;

    if (type === 'serial') {
      adapter = new SerialAdapter();
    } else if (type === 'websocket') {
      adapter = new WebSocketAdapter();
    } else {
      throw new Error(`Unsupported connection type: ${type}`);
    }

    if (!adapter.isSupported()) {
      throw new Error(`${type} not supported on this platform`);
    }

    return await adapter.discover();
  }

  /**
   * Connect to a device
   */
  async connectDevice(deviceInfo: DeviceInfo): Promise<string> {
    // Create adapter based on connection type
    let adapter: SerialAdapter | WebSocketAdapter;

    if (deviceInfo.connectionType === 'serial') {
      adapter = new SerialAdapter();
    } else if (deviceInfo.connectionType === 'websocket') {
      adapter = new WebSocketAdapter();
    } else {
      throw new Error(`Unsupported connection type: ${deviceInfo.connectionType}`);
    }

    // Connect adapter
    await adapter.connect(deviceInfo.id);

    // Create S3 Matrix protocol handler
    const protocol = new S3MatrixProtocol();

    // Set up message routing
    adapter.onData((sensorData) => {
      // Forward raw data to protocol for processing
      if (typeof sensorData === 'string') {
        protocol.processMessage(sensorData);
      } else if (sensorData.type === 'raw_message') {
        protocol.processMessage(sensorData.values.message as string);
      }
    });

    // Connect protocol
    const s3Device = await protocol.connect(deviceInfo.id, async (message) => {
      await adapter.send({
        type: 's3_command',
        payload: message,
        timestamp: Date.now()
      });
    });

    // Create managed device
    const managedDevice: ManagedDevice = {
      info: {
        ...deviceInfo,
        version: s3Device.firmwareVersion,
        capabilities: s3Device.capabilities
      },
      protocol,
      adapter,
      connected: true,
      lastSeen: Date.now()
    };

    this.devices.set(deviceInfo.id, managedDevice);

    // Set up event handlers
    this.setupDeviceHandlers(deviceInfo.id, protocol);

    // Notify listeners
    this.notifyDeviceEvent(managedDevice);

    // Check firmware version
    if (protocol.needsFirmwareUpdate()) {
      console.log(`Firmware update available for device ${deviceInfo.id}`);
      // Can trigger UI notification here
    }

    return deviceInfo.id;
  }

  /**
   * Disconnect from a device
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) return;

    if (device.adapter) {
      await device.adapter.disconnect();
    }

    if (device.protocol) {
      device.protocol.disconnect();
    }

    device.connected = false;
    this.notifyDeviceEvent(device);

    this.devices.delete(deviceId);
  }

  /**
   * Disconnect all devices
   */
  async disconnectAll(): Promise<void> {
    const deviceIds = Array.from(this.devices.keys());
    await Promise.all(deviceIds.map(id => this.disconnectDevice(id)));
  }

  /**
   * Update device firmware
   */
  async updateDeviceFirmware(deviceId: string, firmwareUrl?: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device || !device.protocol) {
      throw new Error('Device not connected');
    }

    await device.protocol.startFirmwareUpdate(firmwareUrl);

    // Wait for update to complete
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const progress = device.protocol!.getFirmwareUpdateProgress();

        if (progress === 100) {
          clearInterval(checkInterval);
          // Device will reboot, need to reconnect
          setTimeout(async () => {
            try {
              await this.reconnectDevice(deviceId);
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 3000);
        } else if (progress === -1) {
          clearInterval(checkInterval);
          reject(new Error('Firmware update failed'));
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Firmware update timeout'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Get firmware update progress
   */
  getFirmwareUpdateProgress(deviceId: string): number {
    const device = this.devices.get(deviceId);
    if (!device || !device.protocol) return 0;

    return device.protocol.getFirmwareUpdateProgress();
  }

  /**
   * Pair device with specific mode
   */
  async pairDevice(deviceId: string, mode: 'host-device' | 'follower-rx-only'): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device || !device.protocol) {
      throw new Error('Device not connected');
    }

    await device.protocol.pairDevice(mode);

    // Update device info
    const s3Device = device.protocol.getDevice();
    if (s3Device) {
      device.info.metadata = {
        ...device.info.metadata,
        paired: s3Device.paired,
        pairingMode: s3Device.pairingMode
      };
    }

    this.notifyDeviceEvent(device);
  }

  /**
   * Send command to device
   */
  async sendToDevice(deviceId: string, command: S3MatrixCommand): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device || !device.protocol) {
      throw new Error('Device not connected');
    }

    await device.protocol.sendCommand(command);
  }

  /**
   * Send command to all connected devices
   */
  async broadcastToAll(command: S3MatrixCommand): Promise<void> {
    const promises = Array.from(this.devices.values())
      .filter(d => d.connected)
      .map(d => d.protocol!.sendCommand(command));

    await Promise.all(promises);
  }

  /**
   * Send command to specific devices
   */
  async sendToDevices(deviceIds: string[], command: S3MatrixCommand): Promise<void> {
    const promises = deviceIds
      .map(id => this.devices.get(id))
      .filter(d => d && d.connected)
      .map(d => d!.protocol!.sendCommand(command));

    await Promise.all(promises);
  }

  /**
   * Get all devices
   */
  getDevices(): ManagedDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): ManagedDevice[] {
    return Array.from(this.devices.values()).filter(d => d.connected);
  }

  /**
   * Get specific device
   */
  getDevice(deviceId: string): ManagedDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Register device event handler
   */
  onDeviceChange(handler: DeviceEventHandler): () => void {
    this.deviceEventHandlers.push(handler);
    return () => {
      const index = this.deviceEventHandlers.indexOf(handler);
      if (index > -1) {
        this.deviceEventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register sensor data handler
   */
  onSensorData(handler: SensorDataHandler): () => void {
    this.sensorDataHandlers.push(handler);
    return () => {
      const index = this.sensorDataHandlers.indexOf(handler);
      if (index > -1) {
        this.sensorDataHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register button press handler
   */
  onButtonPress(handler: ButtonPressHandler): () => void {
    this.buttonPressHandlers.push(handler);
    return () => {
      const index = this.buttonPressHandlers.indexOf(handler);
      if (index > -1) {
        this.buttonPressHandlers.splice(index, 1);
      }
    };
  }

  // Private helper methods

  private setupDeviceHandlers(deviceId: string, protocol: S3MatrixProtocol): void {
    // Forward sensor data
    protocol.onSensorData((data) => {
      this.sensorDataHandlers.forEach(handler => handler(deviceId, data));
    });

    // Forward button presses
    protocol.onButtonPress((button, pressed) => {
      this.buttonPressHandlers.forEach(handler => handler(deviceId, button, pressed));
    });
  }

  private notifyDeviceEvent(device: ManagedDevice): void {
    this.deviceEventHandlers.forEach(handler => handler(device));
  }

  private async reconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Disconnect first
    await this.disconnectDevice(deviceId);

    // Reconnect
    await this.connectDevice(device.info);
  }
}
