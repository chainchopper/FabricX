// Maps sensor data to fluid interactions
import type { SensorData, IMUData } from "../types/device";
import type { FluidInteraction } from "../types/fluid";

export interface MapperConfig {
  sensitivity: number;        // 0.1 - 2.0
  forceMultiplier: number;   // 0.1 - 5.0
  colorMapping: "velocity" | "orientation" | "temperature" | "fixed";
  fixedColor?: { r: number; g: number; b: number };
  enableAccel: boolean;
  enableGyro: boolean;
  accelerationThreshold?: number; // m/s^2, default 1.0
  tempMin?: number;              // Celsius, default 15
  tempMax?: number;              // Celsius, default 40
}

export class SensorToFluidMapper {
  private config: MapperConfig = {
    sensitivity: 1.0,
    forceMultiplier: 1.0,
    colorMapping: "velocity",
    enableAccel: true,
    enableGyro: false,
    accelerationThreshold: 1.0,
    tempMin: 15,
    tempMax: 40,
  };

  private lastAccel = { x: 0, y: 0, z: 0 };
  private lastGyro = { x: 0, y: 0, z: 0 };
  private smoothingFactor = 0.8;

  setConfig(config: Partial<MapperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Convert sensor data to fluid interaction
   * Returns null if data shouldn't trigger an interaction
   */
  map(data: SensorData, userId: string): FluidInteraction | null {
    if (data.type === "imu" || data.type === "accelerometer") {
      return this.mapIMU(data, userId);
    } else if (data.type === "touch") {
      return this.mapTouch(data, userId);
    }

    return null;
  }

  private mapIMU(data: SensorData, userId: string): FluidInteraction | null {
    const accel = {
      x: data.values.accel_x || 0,
      y: data.values.accel_y || 0,
      z: data.values.accel_z || 0,
    };

    const gyro = {
      x: data.values.gyro_x || 0,
      y: data.values.gyro_y || 0,
      z: data.values.gyro_z || 0,
    };

    // Smooth the data
    this.lastAccel = {
      x: this.lastAccel.x * this.smoothingFactor + accel.x * (1 - this.smoothingFactor),
      y: this.lastAccel.y * this.smoothingFactor + accel.y * (1 - this.smoothingFactor),
      z: this.lastAccel.z * this.smoothingFactor + accel.z * (1 - this.smoothingFactor),
    };

    this.lastGyro = {
      x: this.lastGyro.x * this.smoothingFactor + gyro.x * (1 - this.smoothingFactor),
      y: this.lastGyro.y * this.smoothingFactor + gyro.y * (1 - this.smoothingFactor),
      z: this.lastGyro.z * this.smoothingFactor + gyro.z * (1 - this.smoothingFactor),
    };

    // Calculate interaction strength from acceleration magnitude
    const accelMag = Math.sqrt(
      this.lastAccel.x ** 2 + this.lastAccel.y ** 2 + this.lastAccel.z ** 2
    );

    // Threshold: only create interaction if acceleration is significant
    const threshold = this.config.accelerationThreshold || 1.0; // m/s^2
    if (accelMag < threshold) {
      return null;
    }

    // Map acceleration to screen position (normalized -1 to 1)
    // Tilt device forward/back controls Y, left/right controls X
    const position = {
      x: 0.5 + (this.lastAccel.x / 9.8) * 0.5 * this.config.sensitivity,
      y: 0.5 + (this.lastAccel.y / 9.8) * 0.5 * this.config.sensitivity,
    };

    // Clamp to 0-1
    position.x = Math.max(0, Math.min(1, position.x));
    position.y = Math.max(0, Math.min(1, position.y));

    // Calculate force from gyroscope (rotation) if enabled
    let force = { x: 0, y: 0 };
    if (this.config.enableGyro) {
      force = {
        x: this.lastGyro.y * this.config.forceMultiplier,
        y: -this.lastGyro.x * this.config.forceMultiplier,
      };
    } else if (this.config.enableAccel) {
      // Use acceleration delta as force
      force = {
        x: this.lastAccel.x * this.config.forceMultiplier * 0.1,
        y: this.lastAccel.y * this.config.forceMultiplier * 0.1,
      };
    }

    // Calculate pressure from total movement
    const gyroMag = Math.sqrt(
      this.lastGyro.x ** 2 + this.lastGyro.y ** 2 + this.lastGyro.z ** 2
    );
    const pressure = Math.min(1, (accelMag / 20 + gyroMag / 10) * this.config.sensitivity);

    // Determine color
    const color = this.getColor(accel, gyro, data.values.temperature);

    return {
      userId,
      position,
      force,
      pressure: Math.max(0.1, pressure),
      color,
      timestamp: data.timestamp,
    };
  }

  private mapTouch(data: SensorData, userId: string): FluidInteraction {
    const position = {
      x: data.values.x || 0.5,
      y: data.values.y || 0.5,
    };

    const force = {
      x: data.values.force_x || 0,
      y: data.values.force_y || 0,
    };

    const pressure = data.values.pressure || 0.5;

    return {
      userId,
      position,
      force,
      pressure,
      color: this.config.fixedColor,
      timestamp: data.timestamp,
    };
  }

  private getColor(
    accel: { x: number; y: number; z: number },
    gyro: { x: number; y: number; z: number },
    temp?: number
  ): { r: number; g: number; b: number } | undefined {
    if (this.config.colorMapping === "fixed") {
      return this.config.fixedColor;
    }

    if (this.config.colorMapping === "velocity") {
      // Map velocity to color (HSV to RGB)
      const angle = Math.atan2(accel.y, accel.x);
      const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;
      return this.hsvToRgb(hue, 0.8, 1.0);
    }

    if (this.config.colorMapping === "orientation") {
      // Map orientation to color
      const pitch = Math.atan2(accel.x, Math.sqrt(accel.y ** 2 + accel.z ** 2));
      const roll = Math.atan2(accel.y, Math.sqrt(accel.x ** 2 + accel.z ** 2));
      const hue = ((pitch + Math.PI / 2) / Math.PI) * 180;
      const sat = Math.abs(roll) / (Math.PI / 2);
      return this.hsvToRgb(hue, sat, 1.0);
    }

    if (this.config.colorMapping === "temperature" && temp !== undefined) {
      // Map temperature to color (blue = cold, red = hot)
      const tempMin = this.config.tempMin || 15;
      const tempMax = this.config.tempMax || 40;
      const normalizedTemp = Math.max(0, Math.min(1, (temp - tempMin) / (tempMax - tempMin)));
      const hue = (1 - normalizedTemp) * 240; // 240=blue, 0=red
      return this.hsvToRgb(hue, 1.0, 1.0);
    }

    return undefined;
  }

  private hsvToRgb(
    h: number,
    s: number,
    v: number
  ): { r: number; g: number; b: number } {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0,
      g = 0,
      b = 0;

    if (h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }
}
