/**
 * SignalingService - WebSocket-based signaling for WebRTC
 *
 * Handles SDP offer/answer exchange, ICE candidate relay, and presence tracking
 * for distributed WebRTC peer connections.
 *
 * Offline-first (Hotfix 1.1): a missing signaling server is a first-class
 * LOCAL mode, not an error state.
 * - The production relay is the baked-in default (Hotfix 1.6, see
 *   PROD_SIGNALING_URL below): on any non-local origin, signaling resolves
 *   to it unless an explicit URL or EXPO_PUBLIC_SIGNALING_SERVER_URL
 *   overrides it. Local mode therefore results only from a local dev
 *   origin with nothing configured, a loopback URL leaking into a
 *   non-loopback page, or exhausted connection attempts — and in local
 *   mode connect() never opens a socket at all.
 * - If a configured server is unreachable, connection attempts are bounded
 *   (MAX_CONNECT_ATTEMPTS total, exponential backoff) and then stop for
 *   good; the service settles into 'local' state and logs a single line.
 * - connect() is idempotent: concurrent callers share one attempt, so
 *   multiple hook instances can never spawn parallel reconnect chains.
 */

/**
 * The production signaling relay (Cloudflare Worker + Durable Object).
 * It is a public endpoint — clients must know its address to connect —
 * so baking it in as the default is not a secret leak. Doing so means
 * production never depends on dashboard env state being set correctly.
 */
const PROD_SIGNALING_URL = 'wss://fabric-signaling.iaminc.workers.dev';

/**
 * Read EXPO_PUBLIC_SIGNALING_SERVER_URL as inlined by the bundler.
 *
 * Hotfix 1.6: this MUST stay a static member access
 * (process.env.EXPO_PUBLIC_SIGNALING_SERVER_URL). Metro/Expo inline
 * EXPO_PUBLIC_* variables by rewriting static member expressions at
 * bundle time. The previous implementation did a dynamic lookup
 * (process.env[key] through a getEnvVar(key) helper), which is never
 * rewritten, and in the web bundle process.env is a shim — so the
 * value was always undefined in the shipped bundle no matter what the
 * Vercel dashboard said, and the service settled into local mode by
 * design. Verified in the production bundle: no wss:// URL, no
 * "workers.dev", not even the env var name.
 */
function envSignalingUrl(): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.EXPO_PUBLIC_SIGNALING_SERVER_URL;
  }
  return undefined;
}

/**
 * True when the page itself is served from a loopback origin (local dev).
 */
function isLocalPageOrigin(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.location &&
    isLoopbackHost(window.location.hostname)
  );
}

export type SignalingMessage =
  | { type: 'join'; roomId: string; peerId: string }
  | { type: 'leave'; roomId: string; peerId: string }
  | { type: 'offer'; roomId: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; roomId: string; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; roomId: string; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'presence'; roomId: string; peers: string[] }
  | { type: 'peer-joined'; roomId: string; peerId: string }
  | { type: 'peer-left'; roomId: string; peerId: string };

export type SignalingEventHandler = (message: SignalingMessage) => void;

/**
 * Connection state surfaced to the UI:
 * - 'online':     signaling socket is connected.
 * - 'local':      no signaling in play (unconfigured, or attempts exhausted);
 *                 local transports are the designed behavior, not an error.
 * - 'connecting': a configured server is being tried (bounded attempts).
 */
export type SignalingConnectionState = 'online' | 'local' | 'connecting';
export type SignalingStateHandler = (state: SignalingConnectionState) => void;

const MAX_CONNECT_ATTEMPTS = 3;

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

/**
 * Resolve the effective signaling URL. Resolution order:
 * 1. an explicit URL passed to the constructor,
 * 2. EXPO_PUBLIC_SIGNALING_SERVER_URL (statically inlined at bundle time),
 * 3. the baked-in production relay — EXCEPT on a local dev origin, where
 *    an unconfigured service still means local mode: a developer running
 *    the app on localhost keeps the existing behavior (a local dev
 *    server, or plain local mode) and never lands on the production
 *    relay by accident.
 *
 * Returns null when signaling should be treated as unconfigured
 * (local mode):
 * - nothing resolved by the chain above, or
 * - the URL points at loopback but the page is served from a non-loopback
 *   origin (a localhost default leaking into production), or
 * - the URL cannot be parsed at all.
 */
function resolveSignalingUrl(explicit?: string): string | null {
  const raw =
    explicit ||
    envSignalingUrl() ||
    (isLocalPageOrigin() ? undefined : PROD_SIGNALING_URL);
  if (!raw) return null;

  let host: string | null = null;
  try {
    if (typeof URL !== 'undefined') {
      host = new URL(raw).hostname;
    }
  } catch {
    return null;
  }
  if (host === null) {
    // URL parsing unavailable in this runtime; fall back to substring checks.
    if (!raw.includes('localhost') && !raw.includes('127.0.0.1')) return raw;
    host = raw.includes('localhost') ? 'localhost' : '127.0.0.1';
  }

  if (isLoopbackHost(host) && typeof window !== 'undefined' && window.location) {
    if (!isLoopbackHost(window.location.hostname)) {
      return null;
    }
  }
  return raw;
}

export class SignalingService {
  private ws: WebSocket | null = null;
  private handlers = new Set<SignalingEventHandler>();
  private stateHandlers = new Set<SignalingStateHandler>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = MAX_CONNECT_ATTEMPTS;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private url: string | null;
  private state: SignalingConnectionState;
  private intentionalClose = false;
  private connectPromise: Promise<boolean> | null = null;

  constructor(url?: string) {
    this.url = resolveSignalingUrl(url);
    // No configured server -> local mode from the start; no socket is
    // ever attempted. A configured server starts in 'connecting'.
    this.state = this.url ? 'connecting' : 'local';
  }

  /** True when a remote signaling server is actually configured. */
  hasServerUrl(): boolean {
    return this.url !== null;
  }

  /**
   * The resolved signaling URL, or null when in local mode. Surfaced in
   * the ?diag=1 telemetry panel (Hotfix 1.6) so a "stuck in local mode"
   * report shows exactly what resolution produced.
   */
  getServerUrl(): string | null {
    return this.url;
  }

  getState(): SignalingConnectionState {
    return this.state;
  }

  /**
   * Subscribe to connection-state changes. The handler is invoked
   * immediately with the current state. Returns an unsubscribe function.
   */
  onStateChange(handler: SignalingStateHandler): () => void {
    this.stateHandlers.add(handler);
    try {
      handler(this.state);
    } catch {
      // A misbehaving subscriber must not break the service.
    }
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  private setState(next: SignalingConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateHandlers.forEach((handler) => {
      try {
        handler(next);
      } catch {
        // Subscriber errors are isolated from the service.
      }
    });
  }

  /**
   * Connect to the signaling server.
   *
   * Never rejects. Resolves true when the socket is open, false when the
   * service is (or settles into) local mode. Safe to call any number of
   * times: concurrent calls share a single in-flight attempt.
   */
  connect(): Promise<boolean> {
    if (!this.url) {
      // Offline-first: no configured server means no socket attempt, ever.
      this.setState('local');
      return Promise.resolve(false);
    }
    if (this.connected && this.ws) {
      return Promise.resolve(true);
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    if (typeof WebSocket === 'undefined') {
      console.warn('[SignalingService] WebSocket not available in this environment; continuing in local mode');
      this.setState('local');
      return Promise.resolve(false);
    }

    // A manual connect supersedes any pending scheduled retry.
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.intentionalClose = false;
    this.setState('connecting');

    this.connectPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        resolve(ok);
      };

      try {
        const ws = new WebSocket(this.url as string);
        this.ws = ws;

        ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.setState('online');
          settle(true);
        };

        ws.onmessage = (event) => {
          let message: SignalingMessage;
          try {
            message = JSON.parse(event.data) as SignalingMessage;
          } catch {
            console.warn('[SignalingService] Dropping malformed signaling message');
            return;
          }
          this.handlers.forEach((handler) => {
            try {
              handler(message);
            } catch (error) {
              // One bad consumer must not break delivery to the others
              // or propagate into the socket handler.
              console.warn('[SignalingService] Message handler error (isolated):', error);
            }
          });
        };

        ws.onerror = () => {
          // Kept quiet per attempt: onclose drives the bounded retry
          // policy and the single settle log line.
        };

        ws.onclose = () => {
          this.connected = false;
          if (this.ws === ws) {
            this.ws = null;
          }
          settle(false);

          if (this.intentionalClose) {
            return;
          }

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(
              1000 * Math.pow(2, this.reconnectAttempts - 1),
              8000
            );
            this.setState('connecting');
            this.reconnectTimeout = setTimeout(() => {
              this.reconnectTimeout = null;
              void this.connect();
            }, delay);
          } else {
            // Bounded retries exhausted: settle into local mode and
            // stop. Local transports are the designed fallback, so
            // this is one quiet line, not an error.
            console.info(
              '[SignalingService] Signaling server unreachable; continuing in local mode'
            );
            this.setState('local');
          }
        };
      } catch {
        settle(false);
        this.setState('local');
      }
    });

    return this.connectPromise;
  }

  /**
   * Disconnect from the signaling server. Stops any pending retry and
   * prevents the close handler from scheduling a new one.
   */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Already closing/closed.
      }
      this.ws = null;
    }

    this.connected = false;
    this.reconnectAttempts = 0;
    this.setState('local');
  }

  /**
   * Send a message to the signaling server. Silently dropped when not
   * connected: in local mode there is simply nowhere to send it, and
   * that is by design (callers that care check isConnected()).
   */
  send(message: SignalingMessage): void {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch {
        // Socket raced closed; the message is dropped, never thrown.
      }
    }
  }

  /**
   * Join a room
   */
  joinRoom(roomId: string, peerId: string): void {
    this.send({ type: 'join', roomId, peerId });
  }

  /**
   * Leave a room
   */
  leaveRoom(roomId: string, peerId: string): void {
    this.send({ type: 'leave', roomId, peerId });
  }

  /**
   * Send an SDP offer
   */
  sendOffer(roomId: string, from: string, to: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'offer', roomId, from, to, sdp });
  }

  /**
   * Send an SDP answer
   */
  sendAnswer(roomId: string, from: string, to: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'answer', roomId, from, to, sdp });
  }

  /**
   * Send an ICE candidate
   */
  sendIceCandidate(roomId: string, from: string, to: string, candidate: RTCIceCandidateInit): void {
    this.send({ type: 'ice-candidate', roomId, from, to, candidate });
  }

  /**
   * Register a message handler
   */
  onMessage(handler: SignalingEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance for the app
let signalingService: SignalingService | null = null;

export function getSignalingService(url?: string): SignalingService {
  if (!signalingService) {
    signalingService = new SignalingService(url);
  }
  return signalingService;
}
