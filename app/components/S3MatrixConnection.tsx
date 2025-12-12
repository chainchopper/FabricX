// S3 Matrix Connection UI Component
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useS3Matrix } from '../../src/hooks/useS3Matrix';
import type { DeviceInfo } from '../../src/types/device';

export function S3MatrixConnection() {
  const {
    devices,
    connectedDevices,
    connecting,
    error,
    discover,
    connect,
    disconnect,
    updateFirmware,
    getFirmwareProgress,
    pairDevice
  } = useS3Matrix();

  const [scanning, setScanning] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([]);
  const [firmwareProgress, setFirmwareProgress] = useState<{ [key: string]: number }>({});
  const [selectedPairingMode, setSelectedPairingMode] = useState<'host-device' | 'follower-rx-only'>('host-device');

  // Scan for devices
  const handleScan = async () => {
    setScanning(true);
    try {
      const discovered = await discover('serial');
      setAvailableDevices(discovered);
    } finally {
      setScanning(false);
    }
  };

  // Connect to device
  const handleConnect = async (deviceInfo: DeviceInfo) => {
    const deviceId = await connect(deviceInfo);
    if (deviceId) {
      // Clear from available list
      setAvailableDevices(prev => prev.filter(d => d.id !== deviceInfo.id));
    }
  };

  // Disconnect device
  const handleDisconnect = async (deviceId: string) => {
    await disconnect(deviceId);
  };

  // Update firmware
  const handleUpdateFirmware = async (deviceId: string) => {
    const success = await updateFirmware(deviceId);
    if (!success) {
      alert('Firmware update failed. Please try again.');
    }
  };

  // Pair device
  const handlePair = async (deviceId: string) => {
    const success = await pairDevice(deviceId, selectedPairingMode);
    if (success) {
      alert(`Device paired as ${selectedPairingMode}`);
    }
  };

  // Monitor firmware update progress
  useEffect(() => {
    const interval = setInterval(() => {
      const progress: { [key: string]: number } = {};
      connectedDevices.forEach(device => {
        const p = getFirmwareProgress(device.info.id);
        if (p > 0 && p < 100) {
          progress[device.info.id] = p;
        }
      });
      setFirmwareProgress(progress);
    }, 500);

    return () => clearInterval(interval);
  }, [connectedDevices, getFirmwareProgress]);

  // Check if device needs firmware update
  const needsFirmwareUpdate = (device: any): boolean => {
    if (!device.protocol) return false;
    return device.protocol.needsFirmwareUpdate();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>S3 Matrix Devices</Text>
        <TouchableOpacity
          style={[styles.button, scanning && styles.buttonDisabled]}
          onPress={handleScan}
          disabled={scanning || connecting}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Scan for Devices</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Available Devices */}
      {availableDevices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Devices</Text>
          {availableDevices.map((device) => (
            <View key={device.id} style={styles.deviceCard}>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceType}>{device.type}</Text>
              </View>
              <TouchableOpacity
                style={[styles.button, styles.buttonSmall]}
                onPress={() => handleConnect(device)}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonTextSmall}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Connected Devices */}
      {connectedDevices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected Devices</Text>
          {connectedDevices.map((device) => {
            const updating = firmwareProgress[device.info.id] !== undefined;
            const progress = firmwareProgress[device.info.id] || 0;
            const needsUpdate = needsFirmwareUpdate(device);
            const isPaired = device.info.metadata?.paired || false;

            return (
              <View key={device.info.id} style={styles.deviceCard}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.info.name}</Text>
                  <Text style={styles.deviceType}>
                    {device.info.type} | v{device.info.version || '?'}
                  </Text>
                  {device.info.capabilities && device.info.capabilities.length > 0 && (
                    <Text style={styles.capabilities}>
                      {device.info.capabilities.join(', ')}
                    </Text>
                  )}
                  {isPaired && (
                    <Text style={styles.pairedText}>
                      ✓ Paired as {device.info.metadata?.pairingMode}
                    </Text>
                  )}
                </View>

                <View style={styles.deviceActions}>
                  {updating ? (
                    <View style={styles.updateProgress}>
                      <Text style={styles.updateText}>Updating: {progress}%</Text>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      </View>
                    </View>
                  ) : (
                    <>
                      {needsUpdate && (
                        <TouchableOpacity
                          style={[styles.button, styles.buttonSmall, styles.buttonWarning]}
                          onPress={() => handleUpdateFirmware(device.info.id)}
                        >
                          <Text style={styles.buttonTextSmall}>Update Firmware</Text>
                        </TouchableOpacity>
                      )}

                      {!isPaired && (
                        <View style={styles.pairingContainer}>
                          <View style={styles.pairingModeSelector}>
                            <TouchableOpacity
                              style={[
                                styles.modeButton,
                                selectedPairingMode === 'host-device' && styles.modeButtonActive
                              ]}
                              onPress={() => setSelectedPairingMode('host-device')}
                            >
                              <Text style={styles.modeButtonText}>Host</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.modeButton,
                                selectedPairingMode === 'follower-rx-only' && styles.modeButtonActive
                              ]}
                              onPress={() => setSelectedPairingMode('follower-rx-only')}
                            >
                              <Text style={styles.modeButtonText}>Follower</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            style={[styles.button, styles.buttonSmall, styles.buttonSuccess]}
                            onPress={() => handlePair(device.info.id)}
                          >
                            <Text style={styles.buttonTextSmall}>Pair</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <TouchableOpacity
                        style={[styles.button, styles.buttonSmall, styles.buttonDanger]}
                        onPress={() => handleDisconnect(device.info.id)}
                      >
                        <Text style={styles.buttonTextSmall}>Disconnect</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Help Text */}
      {connectedDevices.length === 0 && availableDevices.length === 0 && !scanning && (
        <View style={styles.helpContainer}>
          <Text style={styles.helpText}>
            Connect your S3 Matrix device via USB or WiFi
          </Text>
          <Text style={styles.helpSubtext}>
            Tap "Scan for Devices" to begin
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
  },
  buttonDisabled: {
    backgroundColor: '#4b5563',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextSmall: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonWarning: {
    backgroundColor: '#f59e0b',
  },
  buttonSuccess: {
    backgroundColor: '#10b981',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  errorContainer: {
    backgroundColor: '#fca5a5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#7f1d1d',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  deviceCard: {
    backgroundColor: '#2d2d2d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3b3b3b',
  },
  deviceInfo: {
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  deviceType: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 4,
  },
  capabilities: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  pairedText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 4,
  },
  deviceActions: {
    gap: 8,
  },
  updateProgress: {
    marginBottom: 8,
  },
  updateText: {
    color: '#f59e0b',
    fontSize: 12,
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#3b3b3b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
  },
  pairingContainer: {
    gap: 8,
  },
  pairingModeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    backgroundColor: '#3b3b3b',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  modeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  helpContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  helpText: {
    color: '#9ca3af',
    fontSize: 16,
    marginBottom: 8,
  },
  helpSubtext: {
    color: '#6b7280',
    fontSize: 14,
  },
});
