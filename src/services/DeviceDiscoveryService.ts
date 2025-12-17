/**
 * DeviceDiscoveryService - Automatic device discovery via mDNS/Bonjour
 * Powered by Nirvana
 */

import type { DeviceInfo } from "../types/device";

export interface DiscoveredDevice {
  info: DeviceInfo;
  ipAddress: string;
  port: number;
  lastSeen: number;
  signal?: number; // Signal strength if available
}

export class DeviceDiscoveryService {
  private discoveredDevices: Map<string, DiscoveredDevice> = new Map();
  private isScanning = false;
  private scanIntervalId: number | null = null;
  private callbacks: Set<(devices: DiscoveredDevice[]) => void> = new Set();

  /**
   * Start scanning for devices
   * Note: Web browsers don't support mDNS natively.
   * This implementation uses common HTTP endpoints and WebSocket probing.
   */
  async startScanning(options?: {
    interval?: number; // Scan interval in ms
    timeout?: number; // Request timeout in ms
    ipRanges?: string[]; // IP ranges to scan (e.g., ["192.168.1.*", "192.168.0.*"])
  }): Promise<void> {
    if (this.isScanning) {
      console.warn("[Discovery] Already scanning");
      return;
    }

    this.isScanning = true;
    console.log("[Discovery] Starting device scan...");

    const interval = options?.interval || 10000; // 10 seconds
    const timeout = options?.timeout || 2000; // 2 seconds
    const ipRanges = options?.ipRanges || this.getLocalNetworkRanges();

    // Initial scan
    await this.performScan(ipRanges, timeout);

    // Periodic scans (use recursive setTimeout to prevent overlapping scans)
    const scheduleNextScan = () => {
      this.scanIntervalId = window.setTimeout(async () => {
        if (this.isScanning) {
          await this.performScan(ipRanges, timeout);
          scheduleNextScan();
        }
      }, interval);
    };
    scheduleNextScan();
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (!this.isScanning) return;

    this.isScanning = false;

    if (this.scanIntervalId !== null) {
      window.clearTimeout(this.scanIntervalId);
      this.scanIntervalId = null;
    }

    console.log("[Discovery] Stopped device scan");
  }

  /**
   * Perform a single scan
   */
  private async performScan(ipRanges: string[], timeout: number): Promise<void> {
    console.log("[Discovery] Scanning for devices...");

    const scanPromises: Promise<void>[] = [];

    for (const range of ipRanges) {
      if (range.includes("*")) {
        // Expand wildcard
        const base = range.replace(".*", "");
        for (let i = 1; i <= 254; i++) {
          const ip = `${base}.${i}`;
          scanPromises.push(this.probeDevice(ip, timeout));
        }
      } else {
        scanPromises.push(this.probeDevice(range, timeout));
      }
    }

    // Wait for all probes to complete (with timeout)
    await Promise.allSettled(scanPromises);

    // Clean up old devices (not seen in last 30 seconds)
    const now = Date.now();
    for (const [id, device] of this.discoveredDevices) {
      if (now - device.lastSeen > 30000) {
        this.discoveredDevices.delete(id);
      }
    }

    // Notify listeners
    this.notifyDevicesChanged();
  }

  /**
   * Probe a single IP address
   */
  private async probeDevice(ip: string, timeout: number): Promise<void> {
    // Common ports for ESP32/microcontroller devices
    const ports = [8080, 80, 8081, 3000];

    for (const port of ports) {
      try {
        // Try WebSocket endpoint first
        const wsUrl = `ws://${ip}:${port}/ws`;
        const httpUrl = `http://${ip}:${port}`;

        // HTTP health check (faster than WebSocket)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(`${httpUrl}/info`, {
            signal: controller.signal,
            method: "GET",
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const info = await response.json();

            // Device found!
            const deviceInfo: DeviceInfo = {
              id: info.id || `${ip}:${port}`,
              name: info.name || `Device at ${ip}`,
              type: info.type || "esp32",
              connectionType: "websocket",
              capabilities: info.capabilities || [],
              version: info.version,
              metadata: {
                ...info,
                wsUrl,
                httpUrl,
              },
            };

            const discoveredDevice: DiscoveredDevice = {
              info: deviceInfo,
              ipAddress: ip,
              port,
              lastSeen: Date.now(),
            };

            this.discoveredDevices.set(deviceInfo.id, discoveredDevice);
            console.log(`[Discovery] Found device: ${deviceInfo.name} at ${ip}:${port}`);
            break; // Found on this port, no need to try others
          }
        } catch (err) {
          clearTimeout(timeoutId);
          // Device not responding on this port, try next
        }
      } catch (err) {
        // Continue to next port
      }
    }
  }

  /**
   * Get local network IP ranges to scan
   */
  private getLocalNetworkRanges(): string[] {
    // In a real implementation, we'd try to detect the local network
    // For now, return common private network ranges
    return [
      "192.168.1.*",
      "192.168.0.*",
      "192.168.2.*",
      "10.0.0.*",
      "10.0.1.*",
    ];
  }

  /**
   * Get discovered devices
   */
  getDevices(): DiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * Register callback for device changes
   */
  onDevicesChanged(callback: (devices: DiscoveredDevice[]) => void): () => void {
    this.callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Notify listeners of device changes
   */
  private notifyDevicesChanged(): void {
    const devices = this.getDevices();
    this.callbacks.forEach((callback) => callback(devices));
  }

  /**
   * Clear discovered devices
   */
  clear(): void {
    this.discoveredDevices.clear();
    this.notifyDevicesChanged();
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.stopScanning();
    this.clear();
    this.callbacks.clear();
  }
}

// Singleton instance
let discoveryService: DeviceDiscoveryService | null = null;

export function getDeviceDiscoveryService(): DeviceDiscoveryService {
  if (!discoveryService) {
    discoveryService = new DeviceDiscoveryService();
  }
  return discoveryService;
}
