// Device Manager UI for connecting and managing microcontrollers
import React, { useState, useEffect } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Platform } from "react-native";
import { useToast } from "./Toast";
import { useHaptics } from "../hooks/useHaptics";

// Import actual device manager hook for web
let useDeviceManagerWeb: any = null;
if (Platform.OS === "web") {
  try {
    useDeviceManagerWeb = require("../../src/hooks/useDeviceManager").useDeviceManager;
  } catch (err) {
    console.warn("Failed to load web device manager:", err);
  }
}

// Placeholder for native - actual implementation in web version
const useDeviceManagerNative = () => {
  return {
    devices: [],
    supportedTypes: [],
    discover: async () => [],
    connect: async () => {},
    disconnect: async () => {},
    disconnectAll: async () => {},
    sendCommand: async () => {},
    configure: async () => {},
    getDevice: () => undefined,
    onData: () => () => {},
    onStatusChange: () => () => {},
  };
};

export default function DeviceManager({ onClose }: { onClose?: () => void }) {
  const toast = useToast();
  const haptics = useHaptics();
  
  // Use actual device manager on web, placeholder on native
  const deviceManager = Platform.OS === "web" && useDeviceManagerWeb 
    ? useDeviceManagerWeb() 
    : useDeviceManagerNative();
  
  const [websocketUrl, setWebsocketUrl] = useState("ws://192.168.1.100:8080/ws");
  const [connecting, setConnecting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<any[]>([]);
  const [testingDevice, setTestingDevice] = useState<string | null>(null);

  const handleConnectSerial = async () => {
    if (!deviceManager.supportedTypes.includes("serial")) {
      toast.show("Web Serial not supported in this browser. Use Chrome or Edge.");
      return;
    }

    try {
      setConnecting(true);
      const discovered = await deviceManager.discover("serial");
      if (discovered.length > 0) {
        await deviceManager.connect(discovered[0]);
        haptics.notifySuccess();
        toast.show("Device connected via USB");
      } else {
        toast.show("No devices found. Make sure device is plugged in.");
      }
    } catch (err) {
      console.error(err);
      toast.show("Failed to connect via USB");
      haptics.notifyError();
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectWebSocket = async () => {
    if (!websocketUrl) {
      toast.show("Enter WebSocket URL");
      return;
    }

    try {
      setConnecting(true);
      await deviceManager.connect({
        id: websocketUrl,
        name: "WiFi Device",
        type: "esp32",
        connectionType: "websocket",
        capabilities: [],
      });
      haptics.notifySuccess();
      toast.show("Device connected via WiFi");
    } catch (err) {
      console.error(err);
      toast.show("Failed to connect via WiFi");
      haptics.notifyError();
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    try {
      await deviceManager.disconnect(deviceId);
      haptics.impactLight();
      toast.show("Device disconnected");
    } catch (err) {
      console.error(err);
      toast.show("Failed to disconnect");
    }
  };

  const handleDisconnectAll = async () => {
    try {
      await deviceManager.disconnectAll();
      haptics.impactMedium();
      toast.show("All devices disconnected");
    } catch (err) {
      console.error(err);
      toast.show("Failed to disconnect all");
    }
  };

  const handleTestDevice = async (deviceId: string) => {
    try {
      setTestingDevice(deviceId);
      haptics.impactMedium();
      
      // Send a test command to light up the matrix
      await deviceManager.sendCommand(deviceId, {
        type: "led_pattern",
        pattern: "test",
        color: { r: 255, g: 0, b: 255 },
        duration: 2000,
      });
      
      toast.show("Test command sent! Watch your device.");
    } catch (err) {
      console.error(err);
      toast.show("Failed to send test command");
    } finally {
      setTimeout(() => setTestingDevice(null), 2000);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.95)" }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
        }}
      >
        {/* Header */}
        <View style={{ gap: 4 }}>
          <Text style={{ color: "white", fontSize: 24, fontWeight: "800" }}>
            Device Manager
          </Text>
          <Text style={{ color: "#93c5fd" }}>
            Connect microcontrollers to Fabric
          </Text>
        </View>

        {/* Connected Devices */}
        {deviceManager.devices.length > 0 && (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
                Connected Devices ({deviceManager.devices.length})
              </Text>
              {deviceManager.devices.length > 1 && (
                <Pressable
                  onPress={handleDisconnectAll}
                  style={{
                    backgroundColor: "rgba(239,68,68,0.2)",
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 12 }}>
                    Disconnect All
                  </Text>
                </Pressable>
              )}
            </View>
            {deviceManager.devices.map((device) => (
              <View
                key={device.info.id}
                style={{
                  backgroundColor: "rgba(34,211,238,0.1)",
                  borderWidth: 1,
                  borderColor: device.status.connected
                    ? "rgba(34,197,94,0.8)"
                    : "rgba(239,68,68,0.8)",
                  borderRadius: 12,
                  padding: 14,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View>
                    <Text style={{ color: "white", fontWeight: "700" }}>
                      {device.info.name}
                    </Text>
                    <Text style={{ color: "#cbd5e1", fontSize: 12 }}>
                      {device.info.type} • {device.info.connectionType}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: device.status.connected ? "#22c55e" : "#ef4444",
                    }}
                  />
                </View>

                {device.info.capabilities.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {device.info.capabilities.slice(0, 4).map((cap) => (
                      <View
                        key={cap}
                        style={{
                          backgroundColor: "rgba(34,211,238,0.2)",
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ color: "#22d3ee", fontSize: 11 }}>{cap}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => handleTestDevice(device.info.id)}
                    disabled={testingDevice === device.info.id}
                    style={{
                      flex: 1,
                      backgroundColor: testingDevice === device.info.id 
                        ? "rgba(139,92,246,0.3)" 
                        : "rgba(139,92,246,0.2)",
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#a78bfa", fontWeight: "700" }}>
                      {testingDevice === device.info.id ? "Testing..." : "Test Device"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleDisconnect(device.info.id)}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(239,68,68,0.2)",
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#ef4444", fontWeight: "700" }}>
                      Disconnect
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Connection Options */}
        <View style={{ gap: 12 }}>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Add Device
          </Text>

          {/* USB Serial */}
          <View
            style={{
              backgroundColor: "rgba(15,23,42,0.85)",
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.25)",
              borderRadius: 12,
              padding: 14,
              gap: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>USB Connection</Text>
            <Text style={{ color: "#cbd5e1", fontSize: 13 }}>
              Connect device via USB cable (Chrome/Edge only)
            </Text>
            <Pressable
              onPress={handleConnectSerial}
              disabled={connecting}
              style={{
                backgroundColor: connecting ? "rgba(148,163,184,0.3)" : "#0891b2",
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "white",
                  fontWeight: "700",
                }}
              >
                {connecting ? "Connecting..." : "Connect via USB"}
              </Text>
            </Pressable>
          </View>

          {/* WebSocket/WiFi */}
          <View
            style={{
              backgroundColor: "rgba(15,23,42,0.85)",
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.25)",
              borderRadius: 12,
              padding: 14,
              gap: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>WiFi Connection</Text>
            <Text style={{ color: "#cbd5e1", fontSize: 13 }}>
              Enter device WebSocket URL (e.g., ws://192.168.1.100:8080/ws)
            </Text>
            <TextInput
              value={websocketUrl}
              onChangeText={setWebsocketUrl}
              placeholder="ws://192.168.1.100:8080/ws"
              placeholderTextColor="#64748b"
              style={{
                backgroundColor: "rgba(30,41,59,0.8)",
                color: "white",
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.3)",
              }}
            />
            <Pressable
              onPress={handleConnectWebSocket}
              disabled={connecting}
              style={{
                backgroundColor: connecting ? "rgba(148,163,184,0.3)" : "#0891b2",
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "white",
                  fontWeight: "700",
                }}
              >
                {connecting ? "Connecting..." : "Connect via WiFi"}
              </Text>
            </Pressable>
          </View>

          {/* Setup Instructions */}
          <View
            style={{
              backgroundColor: "rgba(59,130,246,0.1)",
              borderWidth: 1,
              borderColor: "rgba(59,130,246,0.3)",
              borderRadius: 12,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ color: "#60a5fa", fontWeight: "700" }}>
              📘 Setup Instructions
            </Text>
            <Text style={{ color: "#93c5fd", fontSize: 12, lineHeight: 18 }}>
              1. Flash firmware to ESP32-S3 Matrix{"\n"}
              2. Power on and connect to "FabricX-ESP32..." WiFi AP{"\n"}
              3. Configure your WiFi network{"\n"}
              4. Find device IP and connect here{"\n"}
              {"\n"}
              See firmware/esp32-s3-matrix/README.md for details
            </Text>
          </View>
        </View>

        {/* Close Button */}
        {onClose && (
          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.5)",
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
