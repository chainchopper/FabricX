// S3 Matrix Protocol - Complete ESP32-S3 Matrix communication protocol
// Handles firmware updates, device pairing, LED control, sensor data, and more

export interface S3MatrixDevice {
  id: string;
  firmwareVersion: string;
  capabilities: string[];
  paired: boolean;
  pairingMode?: 'host-device' | 'follower-rx-only';
  lastSeen: number;
}

export interface S3MatrixCommand {
  type: 'led_matrix' | 'vibrate' | 'config' | 'pair' | 'ota_start' | 'ota_chunk' | 'ota_end';
  [key: string]: any;
}

export interface S3MatrixSensorData {
  gyro?: { x: number; y: number; z: number };
  accel?: { x: number; y: number; z: number };
  buttons?: { button1: boolean; button2: boolean };
  timestamp: number;
}

export interface FirmwareUpdate {
  version: string;
  url: string;
  size: number;
  checksum?: string;
}

export class S3MatrixProtocol {
  private device: S3MatrixDevice | null = null;
  private sendMessageFn: ((message: string) => Promise<void>) | null = null;
  private sensorDataHandlers: ((data: S3MatrixSensorData) => void)[] = [];
  private buttonPressHandlers: ((button: number, pressed: boolean) => void)[] = [];
  private firmwareUpdateProgress: number = 0;
  
  // Latest firmware version - update this when new firmware is released
  private static readonly LATEST_FIRMWARE_VERSION = '1.2.0';
  private static readonly FIRMWARE_UPDATE_URL = 'https://firmware.fabricx.app/s3-matrix/latest.bin';

  constructor() {}

  /**
   * Initialize connection with device
   */
  async connect(deviceId: string, sendFn: (message: string) => Promise<void>): Promise<S3MatrixDevice> {
    this.sendMessageFn = sendFn;
    
    // Send handshake request
    await this.sendCommand({
      type: 'handshake',
      timestamp: Date.now()
    });
    
    // Wait for handshake response (handled in processMessage)
    // In production, use promise with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Device handshake timeout'));
      }, 5000);
      
      const checkInterval = setInterval(() => {
        if (this.device) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(this.device);
        }
      }, 100);
    });
  }

  /**
   * Process incoming message from device
   */
  processMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'handshake_response':
          this.handleHandshakeResponse(data);
          break;
          
        case 'sensor_data':
          this.handleSensorData(data);
          break;
          
        case 'button_press':
          this.handleButtonPress(data);
          break;
          
        case 'ota_progress':
          this.firmwareUpdateProgress = data.progress;
          break;
          
        case 'ota_complete':
          this.firmwareUpdateProgress = 100;
          console.log('Firmware update complete, device rebooting...');
          break;
          
        case 'ota_error':
          console.error('Firmware update error:', data.error);
          this.firmwareUpdateProgress = -1;
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Failed to parse S3 Matrix message:', err);
    }
  }

  /**
   * Send command to device
   */
  async sendCommand(command: S3MatrixCommand): Promise<void> {
    if (!this.sendMessageFn) {
      throw new Error('Not connected to device');
    }
    
    const message = JSON.stringify(command);
    await this.sendMessageFn(message);
  }

  /**
   * Check if firmware update is available
   */
  needsFirmwareUpdate(): boolean {
    if (!this.device) return false;
    return this.compareVersions(this.device.firmwareVersion, S3MatrixProtocol.LATEST_FIRMWARE_VERSION) < 0;
  }

  /**
   * Start OTA firmware update
   */
  async startFirmwareUpdate(firmwareUrl?: string): Promise<void> {
    const url = firmwareUrl || S3MatrixProtocol.FIRMWARE_UPDATE_URL;
    
    // Fetch firmware file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch firmware');
    }
    
    const firmware = await response.arrayBuffer();
    const firmwareSize = firmware.byteLength;
    
    // Send OTA start command
    await this.sendCommand({
      type: 'ota_start',
      firmware_size: firmwareSize,
      version: S3MatrixProtocol.LATEST_FIRMWARE_VERSION
    });
    
    // Wait a bit for device to prepare
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send firmware in chunks
    const chunkSize = 1024; // 1KB chunks
    const totalChunks = Math.ceil(firmwareSize / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, firmwareSize);
      const chunk = firmware.slice(start, end);
      
      // Convert to base64 for JSON transmission
      const base64Chunk = this.arrayBufferToBase64(chunk);
      
      await this.sendCommand({
        type: 'ota_chunk',
        chunk_index: i,
        total_chunks: totalChunks,
        data: base64Chunk
      });
      
      // Update progress
      this.firmwareUpdateProgress = Math.floor((i / totalChunks) * 100);
      
      // Small delay to not overwhelm device
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Send OTA end command
    await this.sendCommand({
      type: 'ota_end',
      total_size: firmwareSize
    });
  }

  /**
   * Get firmware update progress (0-100, -1 for error)
   */
  getFirmwareUpdateProgress(): number {
    return this.firmwareUpdateProgress;
  }

  /**
   * Pair device with specific mode
   */
  async pairDevice(mode: 'host-device' | 'follower-rx-only'): Promise<void> {
    await this.sendCommand({
      type: 'pair',
      mode: mode,
      timestamp: Date.now()
    });
    
    if (this.device) {
      this.device.paired = true;
      this.device.pairingMode = mode;
    }
  }

  /**
   * Set LED matrix pattern
   */
  async setLEDMatrix(pattern: {
    type: 'solid' | 'text' | 'pattern' | 'animation';
    color?: { r: number; g: number; b: number };
    text?: string;
    data?: number[][];
    duration?: number;
  }): Promise<void> {
    await this.sendCommand({
      type: 'led_matrix',
      ...pattern
    });
  }

  /**
   * Trigger vibration
   */
  async vibrate(pattern: number[], intensity: number = 0.8): Promise<void> {
    await this.sendCommand({
      type: 'vibrate',
      pattern: pattern,
      intensity: Math.max(0, Math.min(1, intensity))
    });
  }

  /**
   * Configure device settings
   */
  async configure(config: {
    sensorRate?: number;
    ledBrightness?: number;
    buttonDebounce?: number;
  }): Promise<void> {
    await this.sendCommand({
      type: 'config',
      ...config
    });
  }

  /**
   * Register sensor data handler
   */
  onSensorData(handler: (data: S3MatrixSensorData) => void): () => void {
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
  onButtonPress(handler: (button: number, pressed: boolean) => void): () => void {
    this.buttonPressHandlers.push(handler);
    return () => {
      const index = this.buttonPressHandlers.indexOf(handler);
      if (index > -1) {
        this.buttonPressHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Get current device info
   */
  getDevice(): S3MatrixDevice | null {
    return this.device;
  }

  /**
   * Disconnect from device
   */
  disconnect(): void {
    this.device = null;
    this.sendMessageFn = null;
    this.sensorDataHandlers = [];
    this.buttonPressHandlers = [];
    this.firmwareUpdateProgress = 0;
  }

  // Private helper methods

  private handleHandshakeResponse(data: any): void {
    this.device = {
      id: data.device_id || 'unknown',
      firmwareVersion: data.firmware_version || '0.0.0',
      capabilities: data.capabilities || [],
      paired: false,
      lastSeen: Date.now()
    };
    
    console.log('S3 Matrix device connected:', this.device);
  }

  private handleSensorData(data: any): void {
    const sensorData: S3MatrixSensorData = {
      gyro: data.gyro,
      accel: data.accel,
      buttons: data.buttons,
      timestamp: data.timestamp || Date.now()
    };
    
    if (this.device) {
      this.device.lastSeen = Date.now();
    }
    
    this.sensorDataHandlers.forEach(handler => handler(sensorData));
  }

  private handleButtonPress(data: any): void {
    const button = data.button || 1;
    const pressed = data.pressed || false;
    
    this.buttonPressHandlers.forEach(handler => handler(button, pressed));
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }
    
    return 0;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
