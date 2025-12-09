// Hook to integrate device sensor data with fluid interactions
import { useEffect, useCallback, useRef, useState } from "react";
import { useDeviceManager } from "./useDeviceManager";
import { SensorToFluidMapper, MapperConfig } from "../devices/SensorToFluidMapper";
import type { SensorData } from "../types/device";
import type { FluidInteraction } from "../types/fluid";

interface UseDeviceFluidIntegrationProps {
  enabled?: boolean;
  userId?: string;
  onInteraction?: (interaction: FluidInteraction) => void;
  mapperConfig?: Partial<MapperConfig>;
}

export function useDeviceFluidIntegration({
  enabled = true,
  userId = "device-user",
  onInteraction,
  mapperConfig,
}: UseDeviceFluidIntegrationProps = {}) {
  const { devices, onData } = useDeviceManager();
  const [isActive, setIsActive] = useState(false);
  const [lastInteraction, setLastInteraction] = useState<FluidInteraction | null>(null);
  const mapperRef = useRef(new SensorToFluidMapper());

  // Update mapper configuration
  useEffect(() => {
    if (mapperConfig) {
      mapperRef.current.setConfig(mapperConfig);
    }
  }, [mapperConfig]);

  // Use ref for onInteraction callback to avoid subscription churn
  const onInteractionRef = useRef(onInteraction);
  
  useEffect(() => {
    onInteractionRef.current = onInteraction;
  }, [onInteraction]);

  // Handle incoming sensor data - stable callback
  const handleSensorData = useCallback(
    (data: SensorData, deviceId: string) => {
      if (!enabled) return;

      const interaction = mapperRef.current.map(data, userId);
      if (interaction) {
        setLastInteraction(interaction);
        onInteractionRef.current?.(interaction);
      }
    },
    [enabled, userId]
  );

  // Subscribe to device data
  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }

    const unsubscribe = onData(handleSensorData);
    setIsActive(devices.length > 0);

    return () => {
      unsubscribe();
      setIsActive(false);
    };
  }, [enabled, devices.length, onData, handleSensorData]);

  // Configure a device
  const configureMapper = useCallback((config: Partial<MapperConfig>) => {
    mapperRef.current.setConfig(config);
  }, []);

  return {
    isActive,
    connectedDevices: devices.length,
    lastInteraction,
    configureMapper,
  };
}
