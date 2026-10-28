/**
 * LintSocketClient — a lint device, in TypeScript.
 *
 * This is the reference client for the lint protocol (docs/LINT.md):
 * the in-app simulator uses it to BE a device, not to imitate one —
 * it opens its own WebSocket to the signaling endpoint, joins the
 * room with a `lint:` peer id, says lint-hello, reacts to lint
 * frames, and sends lint-touch. The ESP32 firmware
 * (firmware/lint_esp32/) implements the same four moves.
 *
 * It deliberately does NOT reuse the app's SignalingService: that
 * singleton is the browser's own participant connection. A lint
 * device is a separate room member with its own socket — exactly
 * like the hardware.
 *
 * Powered by Nirvana
 */

import {
  asLintFrameMessage,
  isLintPayload,
  makeLintHello,
  makeLintTouch,
  type LintDeviceKind,
  type LintFrame,
  type LintTouch,
} from "./lintProtocol";
import { noteLintDevice, publishLintFrame } from "./lintStore";

export type LintClientState =
  | "unavailable" // no signaling URL (local mode) — socket impossible
  | "connecting"
  | "online"
  | "closed";

export interface LintClientOptions {
  url: string | null;
  roomId: string;
  name: string;
  deviceKind: LintDeviceKind;
  caps: string[];
  hue: number;
  /** Declared canvas position for this device's touches, 0..1. */
  touchX: number;
  touchY: number;
  onFrame?: (frame: LintFrame) => void;
  onState?: (state: LintClientState) => void;
}

const HELLO_HEARTBEAT_MS = 20000;

function randomSuffix(): string {
  let s = "";
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export class LintSocketClient {
  readonly peerId: string;
  private opts: LintClientOptions;
  private ws: WebSocket | null = null;
  private state: LintClientState = "closed";
  private touchCounter = 0;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUs = false;

  constructor(opts: LintClientOptions) {
    this.opts = opts;
    const slug =
      opts.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 16) || "device";
    this.peerId = `lint:${slug}-${randomSuffix()}`;
  }

  getState(): LintClientState {
    return this.state;
  }

  private setState(next: LintClientState): void {
    if (this.state === next) return;
    this.state = next;
    this.opts.onState?.(next);
  }

  connect(): void {
    if (!this.opts.url) {
      this.setState("unavailable");
      return;
    }
    if (this.ws) return;
    this.closedByUs = false;
    this.setState("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch {
      this.setState("closed");
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.setState("online");
      this.sendRaw({ type: "join", roomId: this.opts.roomId, peerId: this.peerId });
      this.sendHello();
      if (this.helloTimer === null) {
        this.helloTimer = setInterval(() => this.sendHello(), HELLO_HEARTBEAT_MS);
      }
    };

    ws.onmessage = (event) => {
      let msg: { type?: unknown; roomId?: unknown; payload?: unknown };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!msg || msg.roomId !== this.opts.roomId) return;
      if (msg.type !== "relay") return;
      if (!isLintPayload(msg.payload)) return;
      const frameMsg = asLintFrameMessage(msg.payload);
      if (frameMsg) {
        // The wire path is real: publish for any local consumer and
        // hand the frame to the device's own renderer (the panel).
        publishLintFrame(frameMsg.frame, frameMsg.id, "relay");
        this.opts.onFrame?.(frameMsg.frame);
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.helloTimer !== null) {
        clearInterval(this.helloTimer);
        this.helloTimer = null;
      }
      this.setState("closed");
      if (!this.closedByUs) {
        // A device reconnects; the panel owns our lifetime, so one
        // modest retry loop is enough.
        setTimeout(() => {
          if (!this.closedByUs) this.connect();
        }, 3000);
      }
    };

    ws.onerror = () => {
      // onclose drives state; errors are the socket's business.
    };
  }

  disconnect(): void {
    this.closedByUs = true;
    if (this.helloTimer !== null) {
      clearInterval(this.helloTimer);
      this.helloTimer = null;
    }
    if (this.ws) {
      try {
        this.sendRaw({ type: "leave", roomId: this.opts.roomId, peerId: this.peerId });
        this.ws.close();
      } catch {
        // Already gone.
      }
      this.ws = null;
    }
    this.setState("closed");
  }

  /** The device's one send: a touch at its declared position. */
  touch(): LintTouch {
    const touch = makeLintTouch({
      id: `${this.peerId}:${++this.touchCounter}`,
      x: this.opts.touchX,
      y: this.opts.touchY,
      hue: this.opts.hue,
    });
    this.sendRelay(touch);
    return touch;
  }

  private sendHello(): void {
    const hello = makeLintHello({
      name: this.opts.name,
      deviceKind: this.opts.deviceKind,
      caps: this.opts.caps,
      hue: this.opts.hue,
    });
    // Register ourselves locally too — the room's device list should
    // include the simulator that is, in fact, in the room.
    noteLintDevice(this.peerId, hello, "local");
    this.sendRelay(hello);
  }

  private sendRelay(payload: unknown): void {
    this.sendRaw({
      type: "relay",
      roomId: this.opts.roomId,
      from: this.peerId,
      payload,
    });
  }

  private sendRaw(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch {
        // Dropped like every fire-and-forget send in this system.
      }
    }
  }
}
