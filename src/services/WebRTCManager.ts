/**
 * WebRTCManager - Manages WebRTC peer connections for a room
 * 
 * Integrates with SignalingService for distributed signaling and manages
 * the lifecycle of peer connections, data channels, and messages.
 */

import { SignalingService, SignalingMessage } from './SignalingService';

export type MessageHandler = (data: unknown, from: string) => void;

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  ready: boolean;
}

export class WebRTCManager {
  private roomId: string;
  private peerId: string;
  private signaling: SignalingService | null;
  private peers: Map<string, Peer> = new Map();
  private messageHandlers = new Set<MessageHandler>();
  private fallbackChannel: BroadcastChannel | null = null;
  private unsubscribeSignaling: (() => void) | null = null;

  constructor(roomId: string, peerId: string, signaling: SignalingService | null = null) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.signaling = signaling;

    if (signaling && signaling.isConnected()) {
      this.setupSignaling();
    } else {
      // Fallback to BroadcastChannel for local testing
      this.setupFallback();
    }
  }

  /**
   * Setup signaling service handlers
   */
  private setupSignaling(): void {
    if (!this.signaling) return;

    this.unsubscribeSignaling = this.signaling.onMessage((message: SignalingMessage) => {
      if (message.roomId !== this.roomId) return;

      switch (message.type) {
        case 'peer-joined':
          if (message.peerId !== this.peerId) {
            // We initiate connection to the new peer
            this.createPeer(message.peerId, true);
          }
          break;

        case 'offer':
          if (message.to === this.peerId) {
            this.handleOffer(message.from, message.sdp);
          }
          break;

        case 'answer':
          if (message.to === this.peerId) {
            this.handleAnswer(message.from, message.sdp);
          }
          break;

        case 'ice-candidate':
          if (message.to === this.peerId) {
            this.handleIceCandidate(message.from, message.candidate);
          }
          break;

        case 'peer-left':
          if (message.peerId !== this.peerId) {
            this.removePeer(message.peerId);
          }
          break;

        case 'presence':
          // Handle initial peer list
          message.peers.forEach(otherId => {
            if (otherId !== this.peerId && !this.peers.has(otherId)) {
              // Determine who initiates based on peer ID comparison
              const weInitiate = this.peerId > otherId;
              if (weInitiate) {
                this.createPeer(otherId, true);
              }
            }
          });
          break;
      }
    });

    // Join the room
    this.signaling.joinRoom(this.roomId, this.peerId);
  }

  /**
   * Setup BroadcastChannel fallback for local testing
   */
  private setupFallback(): void {
    if (!('BroadcastChannel' in window)) {
      console.warn('[WebRTCManager] BroadcastChannel not available');
      return;
    }

    this.fallbackChannel = new BroadcastChannel(`fabric-webrtc-${this.roomId}`);
    
    this.fallbackChannel.onmessage = (event) => {
      const message = event.data;
      
      if (message.type === 'hello' && message.from !== this.peerId) {
        const weInitiate = this.peerId > message.from;
        if (!this.peers.has(message.from)) {
          this.createPeer(message.from, weInitiate);
        }
      } else if (message.type === 'offer' && message.to === this.peerId) {
        this.handleOffer(message.from, message.sdp);
      } else if (message.type === 'answer' && message.to === this.peerId) {
        this.handleAnswer(message.from, message.sdp);
      } else if (message.type === 'ice-candidate' && message.to === this.peerId) {
        this.handleIceCandidate(message.from, message.candidate);
      }
    };

    // Announce presence
    this.fallbackChannel.postMessage({ type: 'hello', from: this.peerId });
  }

  /**
   * Create a peer connection
   */
  private createPeer(peerId: string, asCaller: boolean): Peer {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 2
    });

    const peer: Peer = { id: peerId, pc, dc: null, ready: false };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.signaling && this.signaling.isConnected()) {
          this.signaling.sendIceCandidate(this.roomId, this.peerId, peerId, event.candidate.toJSON());
        } else if (this.fallbackChannel) {
          this.fallbackChannel.postMessage({
            type: 'ice-candidate',
            from: this.peerId,
            to: peerId,
            candidate: event.candidate.toJSON()
          });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || 
          pc.connectionState === 'disconnected' || 
          pc.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    pc.ondatachannel = (event) => {
      peer.dc = event.channel;
      this.wireDataChannel(peer);
    };

    if (asCaller) {
      const dc = pc.createDataChannel('fabric', {
        ordered: true,
        maxRetransmits: 3
      });
      peer.dc = dc;
      this.wireDataChannel(peer);

      // Create and send offer
      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        if (pc.localDescription) {
          if (this.signaling && this.signaling.isConnected()) {
            this.signaling.sendOffer(this.roomId, this.peerId, peerId, pc.localDescription.toJSON());
          } else if (this.fallbackChannel) {
            this.fallbackChannel.postMessage({
              type: 'offer',
              from: this.peerId,
              to: peerId,
              sdp: pc.localDescription.toJSON()
            });
          }
        }
      }).catch(error => {
        console.error('[WebRTCManager] Failed to create offer:', error);
      });
    }

    this.peers.set(peerId, peer);
    return peer;
  }

  /**
   * Wire up data channel event handlers
   */
  private wireDataChannel(peer: Peer): void {
    if (!peer.dc) return;

    peer.dc.onopen = () => {
      peer.ready = true;
      console.log(`[WebRTCManager] Data channel open with ${peer.id}`);
    };

    peer.dc.onclose = () => {
      peer.ready = false;
      console.log(`[WebRTCManager] Data channel closed with ${peer.id}`);
    };

    peer.dc.onmessage = (event) => {
      let data: unknown = event.data;
      try {
        data = JSON.parse(event.data);
      } catch {
        // Keep raw data
      }
      this.notifyMessage(data, peer.id);
    };

    peer.dc.onerror = (error) => {
      console.error(`[WebRTCManager] Data channel error with ${peer.id}:`, error);
    };
  }

  /**
   * Handle incoming offer
   */
  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    let peer = this.peers.get(from);
    if (!peer) {
      peer = this.createPeer(from, false);
    }

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      if (this.signaling && this.signaling.isConnected()) {
        this.signaling.sendAnswer(this.roomId, this.peerId, from, answer.toJSON());
      } else if (this.fallbackChannel) {
        this.fallbackChannel.postMessage({
          type: 'answer',
          from: this.peerId,
          to: from,
          sdp: answer.toJSON()
        });
      }
    } catch (error) {
      console.error('[WebRTCManager] Failed to handle offer:', error);
    }
  }

  /**
   * Handle incoming answer
   */
  private async handleAnswer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return;

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (error) {
      console.error('[WebRTCManager] Failed to handle answer:', error);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return;

    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTCManager] Failed to add ICE candidate:', error);
    }
  }

  /**
   * Remove a peer
   */
  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        peer.dc?.close();
      } catch {}
      try {
        peer.pc.close();
      } catch {}
      this.peers.delete(peerId);
    }
  }

  /**
   * Notify message handlers
   */
  private notifyMessage(data: unknown, from: string): void {
    this.messageHandlers.forEach(handler => handler(data, from));
  }

  /**
   * Send a message to all connected peers
   */
  send(data: unknown): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.peers.forEach(peer => {
      if (peer.ready && peer.dc?.readyState === 'open') {
        try {
          peer.dc.send(message);
        } catch (error) {
          console.error(`[WebRTCManager] Failed to send to ${peer.id}:`, error);
        }
      }
    });
  }

  /**
   * Send a message to a specific peer
   */
  sendTo(peerId: string, data: unknown): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.ready && peer.dc?.readyState === 'open') {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      try {
        peer.dc.send(message);
      } catch (error) {
        console.error(`[WebRTCManager] Failed to send to ${peerId}:`, error);
      }
    }
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Get list of connected peer IDs
   */
  getPeerIds(): string[] {
    return Array.from(this.peers.values())
      .filter(peer => peer.ready)
      .map(peer => peer.id);
  }

  /**
   * Get number of connected peers
   */
  getPeerCount(): number {
    return Array.from(this.peers.values()).filter(peer => peer.ready).length;
  }

  /**
   * Check if any peers are connected
   */
  isActive(): boolean {
    return this.getPeerCount() > 0;
  }

  /**
   * Cleanup and disconnect
   */
  destroy(): void {
    // Leave room if using signaling
    if (this.signaling && this.signaling.isConnected()) {
      this.signaling.leaveRoom(this.roomId, this.peerId);
    }

    // Unsubscribe from signaling
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }

    // Close all peer connections
    this.peers.forEach(peer => {
      try {
        peer.dc?.close();
      } catch {}
      try {
        peer.pc.close();
      } catch {}
    });
    this.peers.clear();

    // Close fallback channel
    if (this.fallbackChannel) {
      this.fallbackChannel.close();
      this.fallbackChannel = null;
    }
  }
}
