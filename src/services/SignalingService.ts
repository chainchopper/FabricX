/**
 * SignalingService - WebSocket-based signaling for WebRTC
 * 
 * Handles SDP offer/answer exchange, ICE candidate relay, and presence tracking
 * for distributed WebRTC peer connections.
 */

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

export class SignalingService {
  private ws: WebSocket | null = null;
  private handlers = new Set<SignalingEventHandler>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private connected = false;
  private url: string;

  constructor(url?: string) {
    // Use environment variable if available, otherwise use provided url or default to localhost
    this.url = url || 
      (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SIGNALING_SERVER_URL) || 
      'ws://localhost:8080';
  }

  /**
   * Connect to the signaling server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Check if WebSocket is available (web-only API)
        if (typeof WebSocket === 'undefined') {
          console.warn('[SignalingService] WebSocket not available in this environment');
          reject(new Error('WebSocket not available'));
          return;
        }

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[SignalingService] Connected to signaling server');
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as SignalingMessage;
            this.handlers.forEach(handler => handler(message));
          } catch (error) {
            console.error('[SignalingService] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[SignalingService] WebSocket error:', error);
          if (!this.connected) {
            reject(new Error('Failed to connect to signaling server'));
          }
        };

        this.ws.onclose = () => {
          console.log('[SignalingService] Disconnected from signaling server');
          this.connected = false;
          this.ws = null;

          // Attempt to reconnect only if we haven't exceeded max attempts
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            console.log(`[SignalingService] Reconnecting in ${delay}ms...`);
            
            this.reconnectTimeout = window.setTimeout(() => {
              this.reconnectAttempts++;
              this.connect().catch(() => {
                // Reconnection will be attempted again in onclose
              });
            }, delay);
          } else {
            console.log('[SignalingService] Max reconnection attempts reached');
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the signaling server
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message to the signaling server
   */
  send(message: SignalingMessage): void {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[SignalingService] Cannot send message, not connected');
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
