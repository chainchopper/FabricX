// Device Manager UI for web - connects microcontrollers to Fabric
import React, { useState, useEffect } from "react";
import { useDeviceManager } from "../hooks/useDeviceManager";
import type { DeviceInfo } from "../types/device";

interface DeviceManagerProps {
  onClose?: () => void;
}

export default function DeviceManager({ onClose }: DeviceManagerProps) {
  const {
    devices,
    supportedTypes,
    discover,
    connect,
    disconnect,
    sendCommand,
  } = useDeviceManager();

  const [websocketUrl, setWebsocketUrl] = useState("ws://192.168.1.100:8080/ws");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");

  const handleConnectSerial = async () => {
    if (!supportedTypes.includes("serial")) {
      setMessage("Web Serial not supported. Use Chrome or Edge browser.");
      return;
    }

    try {
      setConnecting(true);
      setMessage("Opening serial port...");
      const discovered = await discover("serial");
      
      if (discovered.length > 0) {
        setMessage("Connecting to device...");
        await connect(discovered[0]);
        setMessage("✓ Device connected via USB");
      } else {
        setMessage("No devices found");
      }
    } catch (err) {
      console.error(err);
      setMessage("Failed to connect: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectWebSocket = async () => {
    if (!websocketUrl) {
      setMessage("Enter WebSocket URL");
      return;
    }

    try {
      setConnecting(true);
      setMessage("Connecting to " + websocketUrl + "...");
      
      const deviceInfo: DeviceInfo = {
        id: websocketUrl,
        name: "WiFi Device",
        type: "esp32",
        connectionType: "websocket",
        capabilities: [],
      };

      await connect(deviceInfo);
      setMessage("✓ Device connected via WiFi");
    } catch (err) {
      console.error(err);
      setMessage("Failed to connect: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    try {
      await disconnect(deviceId);
      setMessage("Device disconnected");
    } catch (err) {
      console.error(err);
      setMessage("Failed to disconnect");
    }
  };

  const handleTestLED = async (deviceId: string) => {
    try {
      // Cycle through colors
      const colors = [
        { r: 255, g: 0, b: 0 },   // Red
        { r: 0, g: 255, b: 0 },   // Green
        { r: 0, g: 0, b: 255 },   // Blue
        { r: 255, g: 255, b: 0 }, // Yellow
        { r: 0, g: 0, b: 0 },     // Off
      ];

      for (const color of colors) {
        await sendCommand(deviceId, {
          type: "led",
          payload: { color },
          timestamp: Date.now(),
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      
      setMessage("LED test complete");
    } catch (err) {
      console.error(err);
      setMessage("LED test failed");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15,23,42,0.95)",
        zIndex: 100,
        overflow: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "40px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header */}
        <div>
          <h1
            style={{
              color: "white",
              fontSize: "32px",
              fontWeight: 800,
              margin: 0,
            }}
          >
            Device Manager
          </h1>
          <p style={{ color: "#93c5fd", margin: "4px 0 0 0" }}>
            Connect microcontrollers to Fabric
          </p>
        </div>

        {/* Message Display */}
        {message && (
          <div
            style={{
              backgroundColor: message.startsWith("✓")
                ? "rgba(34,197,94,0.1)"
                : "rgba(59,130,246,0.1)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: message.startsWith("✓")
                ? "rgba(34,197,94,0.3)"
                : "rgba(59,130,246,0.3)",
              borderRadius: "12px",
              padding: "12px 16px",
              color: message.startsWith("✓") ? "#86efac" : "#93c5fd",
            }}
          >
            {message}
          </div>
        )}

        {/* Connected Devices */}
        {devices.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h2
              style={{
                color: "white",
                fontSize: "20px",
                fontWeight: 700,
                margin: 0,
              }}
            >
              Connected Devices
            </h2>
            {devices.map((device) => (
              <div
                key={device.info.id}
                style={{
                  backgroundColor: "rgba(34,211,238,0.1)",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: device.status.connected
                    ? "rgba(34,197,94,0.8)"
                    : "rgba(239,68,68,0.8)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ color: "white", fontWeight: 700 }}>
                      {device.info.name}
                    </div>
                    <div style={{ color: "#cbd5e1", fontSize: "12px" }}>
                      {device.info.type} • {device.info.connectionType}
                      {device.info.version && ` • v${device.info.version}`}
                    </div>
                  </div>
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: device.status.connected
                        ? "#22c55e"
                        : "#ef4444",
                    }}
                  />
                </div>

                {device.info.capabilities.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                    }}
                  >
                    {device.info.capabilities.map((cap) => (
                      <div
                        key={cap}
                        style={{
                          backgroundColor: "rgba(34,211,238,0.2)",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          color: "#22d3ee",
                          fontSize: "11px",
                        }}
                      >
                        {cap}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleTestLED(device.info.id)}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(34,211,238,0.2)",
                      border: "none",
                      padding: "10px",
                      borderRadius: "8px",
                      color: "#22d3ee",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Test LEDs
                  </button>
                  <button
                    onClick={() => handleDisconnect(device.info.id)}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(239,68,68,0.2)",
                      border: "none",
                      padding: "10px",
                      borderRadius: "8px",
                      color: "#ef4444",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Connection Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2
            style={{
              color: "white",
              fontSize: "20px",
              fontWeight: 700,
              margin: 0,
            }}
          >
            Add Device
          </h2>

          {/* USB Serial */}
          <div
            style={{
              backgroundColor: "rgba(15,23,42,0.85)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: "rgba(34,211,238,0.25)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ color: "white", fontWeight: 700 }}>USB Connection</div>
            <div style={{ color: "#cbd5e1", fontSize: "13px" }}>
              Connect device via USB cable (Chrome/Edge required)
            </div>
            <button
              onClick={handleConnectSerial}
              disabled={connecting}
              style={{
                backgroundColor: connecting ? "rgba(148,163,184,0.3)" : "#0891b2",
                border: "none",
                padding: "12px",
                borderRadius: "10px",
                color: "white",
                fontWeight: 700,
                cursor: connecting ? "not-allowed" : "pointer",
              }}
            >
              {connecting ? "Connecting..." : "Connect via USB"}
            </button>
          </div>

          {/* WebSocket/WiFi */}
          <div
            style={{
              backgroundColor: "rgba(15,23,42,0.85)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: "rgba(34,211,238,0.25)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ color: "white", fontWeight: 700 }}>WiFi Connection</div>
            <div style={{ color: "#cbd5e1", fontSize: "13px" }}>
              Enter device WebSocket URL
            </div>
            <input
              type="text"
              value={websocketUrl}
              onChange={(e) => setWebsocketUrl(e.target.value)}
              placeholder="ws://192.168.1.100:8080/ws"
              style={{
                backgroundColor: "rgba(30,41,59,0.8)",
                color: "white",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(148,163,184,0.3)",
                outline: "none",
              }}
            />
            <button
              onClick={handleConnectWebSocket}
              disabled={connecting}
              style={{
                backgroundColor: connecting ? "rgba(148,163,184,0.3)" : "#0891b2",
                border: "none",
                padding: "12px",
                borderRadius: "10px",
                color: "white",
                fontWeight: 700,
                cursor: connecting ? "not-allowed" : "pointer",
              }}
            >
              {connecting ? "Connecting..." : "Connect via WiFi"}
            </button>
          </div>

          {/* Setup Instructions */}
          <div
            style={{
              backgroundColor: "rgba(59,130,246,0.1)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: "rgba(59,130,246,0.3)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div
              style={{
                color: "#60a5fa",
                fontWeight: 700,
                marginBottom: "8px",
              }}
            >
              📘 Setup Instructions
            </div>
            <div
              style={{
                color: "#93c5fd",
                fontSize: "12px",
                lineHeight: "1.5",
              }}
            >
              1. Flash firmware to ESP32-S3 Matrix
              <br />
              2. Power on and connect to "FabricX-ESP32..." WiFi AP
              <br />
              3. Configure your WiFi network
              <br />
              4. Find device IP and connect here
              <br />
              <br />
              See firmware/esp32-s3-matrix/README.md for details
            </div>
          </div>
        </div>

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "1px solid rgba(148,163,184,0.5)",
              padding: "12px",
              borderRadius: "10px",
              color: "#e5e7eb",
              fontWeight: 700,
              cursor: "pointer",
              marginTop: "8px",
            }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
