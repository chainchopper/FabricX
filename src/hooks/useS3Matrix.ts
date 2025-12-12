// React hook for S3 Matrix device management
import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceManager } from '../services/DeviceManager';
import type { ManagedDevice } from '../services/DeviceManager';
import type { S3MatrixCommand, S3MatrixSensorData } from '../services/S3MatrixProtocol';
import type { DeviceInfo, ConnectionType } from '../types/device';

export function useS3Matrix() {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef(DeviceManager.getInstance());

  // Subscribe to device changes
  useEffect(() => {
    const manager = managerRef.current;

    const unsubscribe = manager.onDeviceChange((device) => {
      setDevices(manager.getDevices());
    });

    // Initial load
    setDevices(manager.getDevices());

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Discover available devices
   */
  const discover = useCallback(async (type: ConnectionType = 'serial'): Promise<DeviceInfo[]> => {
    try {
      setError(null);
      const discovered = await managerRef.current.discoverDevices(type);
      return discovered;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Discovery failed';
      setError(message);
      return [];
    }
  }, []);

  /**
   * Connect to a device
   */
  const connect = useCallback(async (deviceInfo: DeviceInfo): Promise<string | null> => {
    try {
      setConnecting(true);
      setError(null);
      
      const deviceId = await managerRef.current.connectDevice(deviceInfo);
      
      return deviceId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  /**
   * Disconnect from a device
   */
  const disconnect = useCallback(async (deviceId: string): Promise<void> => {
    try {
      setError(null);
      await managerRef.current.disconnectDevice(deviceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnection failed';
      setError(message);
    }
  }, []);

  /**
   * Disconnect all devices
   */
  const disconnectAll = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await managerRef.current.disconnectAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disconnection failed';
      setError(message);
    }
  }, []);

  /**
   * Update device firmware
   */
  const updateFirmware = useCallback(
    async (deviceId: string, firmwareUrl?: string): Promise<boolean> => {
      try {
        setError(null);
        await managerRef.current.updateDeviceFirmware(deviceId, firmwareUrl);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Firmware update failed';
        setError(message);
        return false;
      }
    },
    []
  );

  /**
   * Get firmware update progress
   */
  const getFirmwareProgress = useCallback((deviceId: string): number => {
    return managerRef.current.getFirmwareUpdateProgress(deviceId);
  }, []);

  /**
   * Pair device
   */
  const pairDevice = useCallback(
    async (deviceId: string, mode: 'host-device' | 'follower-rx-only'): Promise<boolean> => {
      try {
        setError(null);
        await managerRef.current.pairDevice(deviceId, mode);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Pairing failed';
        setError(message);
        return false;
      }
    },
    []
  );

  /**
   * Send command to device
   */
  const sendCommand = useCallback(
    async (deviceId: string, command: S3MatrixCommand): Promise<boolean> => {
      try {
        setError(null);
        await managerRef.current.sendToDevice(deviceId, command);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Command failed';
        setError(message);
        return false;
      }
    },
    []
  );

  /**
   * Broadcast command to all devices
   */
  const broadcast = useCallback(async (command: S3MatrixCommand): Promise<boolean> => {
    try {
      setError(null);
      await managerRef.current.broadcastToAll(command);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Broadcast failed';
      setError(message);
      return false;
    }
  }, []);

  /**
   * Send command to specific devices
   */
  const sendToDevices = useCallback(
    async (deviceIds: string[], command: S3MatrixCommand): Promise<boolean> => {
      try {
        setError(null);
        await managerRef.current.sendToDevices(deviceIds, command);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed';
        setError(message);
        return false;
      }
    },
    []
  );

  /**
   * Register sensor data handler
   */
  const onSensorData = useCallback(
    (handler: (deviceId: string, data: S3MatrixSensorData) => void): (() => void) => {
      return managerRef.current.onSensorData(handler);
    },
    []
  );

  /**
   * Register button press handler
   */
  const onButtonPress = useCallback(
    (handler: (deviceId: string, button: number, pressed: boolean) => void): (() => void) => {
      return managerRef.current.onButtonPress(handler);
    },
    []
  );

  /**
   * Get device by ID
   */
  const getDevice = useCallback((deviceId: string): ManagedDevice | undefined => {
    return managerRef.current.getDevice(deviceId);
  }, []);

  // Computed values
  const connectedDevices = devices.filter(d => d.connected);
  const hasDevices = devices.length > 0;
  const hasConnectedDevices = connectedDevices.length > 0;

  return {
    // State
    devices,
    connectedDevices,
    connecting,
    error,
    hasDevices,
    hasConnectedDevices,
    
    // Actions
    discover,
    connect,
    disconnect,
    disconnectAll,
    updateFirmware,
    getFirmwareProgress,
    pairDevice,
    sendCommand,
    broadcast,
    sendToDevices,
    getDevice,
    
    // Event handlers
    onSensorData,
    onButtonPress
  };
}
