// React hook for device management
import { useEffect, useState, useCallback, useRef } from "react";
import { getInputOrchestrator } from "../devices/InputOrchestrator";
import type {
  DeviceInfo,
  DeviceStatus,
  SensorData,
  DeviceCommand,
  DeviceConfig,
  ConnectionType,
} from "../types/device";
import type { ManagedDevice } from "../devices/InputOrchestrator";

export function useDeviceManager() {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [supportedTypes, setSupportedTypes] = useState<ConnectionType[]>([]);
  const orchestratorRef = useRef(getInputOrchestrator());

  useEffect(() => {
    const orchestrator = orchestratorRef.current;

    // Get supported connection types
    setSupportedTypes(orchestrator.getSupportedTypes());

    // Subscribe to device changes
    const unsubDeviceChange = orchestrator.onDeviceChange(() => {
      setDevices(orchestrator.getDevices());
    });

    // Initial load
    setDevices(orchestrator.getDevices());

    return () => {
      unsubDeviceChange();
    };
  }, []);

  const discover = useCallback(
    async (type: ConnectionType): Promise<DeviceInfo[]> => {
      return orchestratorRef.current.discover(type);
    },
    []
  );

  const connect = useCallback(async (deviceInfo: DeviceInfo): Promise<void> => {
    await orchestratorRef.current.connect(deviceInfo);
  }, []);

  const disconnect = useCallback(async (deviceId: string): Promise<void> => {
    await orchestratorRef.current.disconnect(deviceId);
  }, []);

  const disconnectAll = useCallback(async (): Promise<void> => {
    await orchestratorRef.current.disconnectAll();
  }, []);

  const sendCommand = useCallback(
    async (deviceId: string, command: DeviceCommand): Promise<void> => {
      await orchestratorRef.current.sendCommand(deviceId, command);
    },
    []
  );

  const configure = useCallback(
    async (deviceId: string, config: DeviceConfig): Promise<void> => {
      await orchestratorRef.current.configureDevice(deviceId, config);
    },
    []
  );

  const getDevice = useCallback(
    (deviceId: string): ManagedDevice | undefined => {
      return orchestratorRef.current.getDevice(deviceId);
    },
    []
  );

  const onData = useCallback(
    (handler: (data: SensorData, deviceId: string) => void): (() => void) => {
      return orchestratorRef.current.onData(handler);
    },
    []
  );

  const onStatusChange = useCallback(
    (
      handler: (deviceId: string, status: DeviceStatus) => void
    ): (() => void) => {
      return orchestratorRef.current.onStatusChange(handler);
    },
    []
  );

  return {
    devices,
    supportedTypes,
    discover,
    connect,
    disconnect,
    disconnectAll,
    sendCommand,
    configure,
    getDevice,
    onData,
    onStatusChange,
  };
}
