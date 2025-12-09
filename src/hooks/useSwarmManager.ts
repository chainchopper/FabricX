/**
 * SwarmManager - Multi-device coordination and synchronization
 * Enables one-to-many device communication with node assignment
 * Powered by Nirvana
 */

export interface SwarmNode {
  id: string;
  deviceId: string;
  nodeNumber: number;
  isRXOnly: boolean; // Permanently paired, receive-only
  lastSeen: number;
  capabilities: string[];
  status: "online" | "offline" | "syncing";
}

export interface SwarmMessage {
  type: "broadcast" | "targeted" | "pattern";
  senderId: string;
  targetNodes?: number[]; // Node numbers to target
  command: string;
  payload: any;
  timestamp: number;
}

export interface PatternFrame {
  nodeNumber: number;
  display: string | number[][]; // Text or LED matrix data
  color?: { h: number; s: number; v: number };
  duration?: number;
}

export class SwarmManager {
  private nodes: Map<string, SwarmNode> = new Map();
  private hostId: string;
  private messageQueue: SwarmMessage[] = [];
  private isProcessing: boolean = false;
  private onMessageCallback?: (deviceId: string, message: SwarmMessage) => void;
  
  constructor(hostId: string) {
    this.hostId = hostId;
  }
  
  // Register a device as a swarm node
  registerNode(
    deviceId: string,
    nodeNumber: number,
    options: { isRXOnly?: boolean; capabilities?: string[] } = {}
  ): SwarmNode {
    const node: SwarmNode = {
      id: `${this.hostId}-node-${nodeNumber}`,
      deviceId,
      nodeNumber,
      isRXOnly: options.isRXOnly || false,
      lastSeen: Date.now(),
      capabilities: options.capabilities || ["led", "vibrate", "sensor"],
      status: "online",
    };
    
    this.nodes.set(deviceId, node);
    console.log(`[SwarmManager] Registered node ${nodeNumber} (${deviceId})`);
    
    return node;
  }
  
  // Unregister a node
  unregisterNode(deviceId: string): boolean {
    const node = this.nodes.get(deviceId);
    if (node && !node.isRXOnly) {
      this.nodes.delete(deviceId);
      console.log(`[SwarmManager] Unregistered node ${node.nodeNumber}`);
      return true;
    }
    return false;
  }
  
  // Get all active nodes
  getNodes(): SwarmNode[] {
    return Array.from(this.nodes.values());
  }
  
  // Get node by number
  getNodeByNumber(nodeNumber: number): SwarmNode | undefined {
    return Array.from(this.nodes.values()).find((n) => n.nodeNumber === nodeNumber);
  }
  
  // Broadcast message to all nodes
  broadcast(command: string, payload: any): void {
    const message: SwarmMessage = {
      type: "broadcast",
      senderId: this.hostId,
      command,
      payload,
      timestamp: Date.now(),
    };
    
    this.queueMessage(message);
  }
  
  // Send message to specific nodes
  sendToNodes(nodeNumbers: number[], command: string, payload: any): void {
    const message: SwarmMessage = {
      type: "targeted",
      senderId: this.hostId,
      targetNodes: nodeNumbers,
      command,
      payload,
      timestamp: Date.now(),
    };
    
    this.queueMessage(message);
  }
  
  // Display a word across multiple nodes (one letter per node)
  displayWord(word: string, options: { color?: { h: number; s: number; v: number }; duration?: number } = {}): void {
    const letters = word.toUpperCase().split("");
    const nodes = this.getNodes().sort((a, b) => a.nodeNumber - b.nodeNumber);
    
    const pattern: PatternFrame[] = letters.map((letter, index) => ({
      nodeNumber: nodes[index]?.nodeNumber || index + 1,
      display: this.letterToMatrix(letter),
      color: options.color || { h: 180, s: 100, v: 255 },
      duration: options.duration || 5000,
    }));
    
    this.displayPattern(pattern);
  }
  
  // Display a coordinated pattern across nodes
  displayPattern(pattern: PatternFrame[]): void {
    const message: SwarmMessage = {
      type: "pattern",
      senderId: this.hostId,
      command: "display_pattern",
      payload: { pattern },
      timestamp: Date.now(),
    };
    
    this.queueMessage(message);
  }
  
  // Create synchronized effects (e.g., ripple, wave)
  createRippleEffect(origin: number, color: { h: number; s: number; v: number }, speed: number = 200): void {
    const nodes = this.getNodes().sort((a, b) => a.nodeNumber - b.nodeNumber);
    
    nodes.forEach((node, index) => {
      const delay = Math.abs(node.nodeNumber - origin) * speed;
      
      setTimeout(() => {
        this.sendToNodes([node.nodeNumber], "setColor", {
          color,
          duration: 500,
          fade: true,
        });
      }, delay);
    });
  }
  
  // Synchronize all nodes (heartbeat)
  syncAll(): void {
    this.broadcast("sync", {
      timestamp: Date.now(),
      nodeCount: this.nodes.size,
    });
  }
  
  // Set message callback
  onMessage(callback: (deviceId: string, message: SwarmMessage) => void): void {
    this.onMessageCallback = callback;
  }
  
  // Process message queue
  private queueMessage(message: SwarmMessage): void {
    this.messageQueue.push(message);
    this.processQueue();
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.deliverMessage(message);
      
      // Small delay to prevent overwhelming devices
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    
    this.isProcessing = false;
  }
  
  private async deliverMessage(message: SwarmMessage): Promise<void> {
    const targetNodes: SwarmNode[] = [];
    
    if (message.type === "broadcast") {
      targetNodes.push(...this.nodes.values());
    } else if (message.type === "targeted" && message.targetNodes) {
      message.targetNodes.forEach((nodeNum) => {
        const node = this.getNodeByNumber(nodeNum);
        if (node) targetNodes.push(node);
      });
    } else if (message.type === "pattern") {
      // Pattern messages contain per-node instructions
      const pattern = message.payload.pattern as PatternFrame[];
      pattern.forEach((frame) => {
        const node = this.getNodeByNumber(frame.nodeNumber);
        if (node) {
          this.onMessageCallback?.(node.deviceId, {
            ...message,
            payload: frame,
          });
        }
      });
      return;
    }
    
    // Deliver to target nodes
    targetNodes.forEach((node) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(node.deviceId, message);
      }
    });
  }
  
  // Convert letter to 8x8 LED matrix (simplified)
  private letterToMatrix(letter: string): number[][] {
    const patterns: Record<string, number[][]> = {
      A: [
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 0, 0, 1, 1],
        [1, 1, 0, 0, 0, 0, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 0, 0, 0, 0, 1, 1],
        [1, 1, 0, 0, 0, 0, 1, 1],
        [1, 1, 0, 0, 0, 0, 1, 1],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ],
      B: [
        [1, 1, 1, 1, 1, 1, 0, 0],
        [1, 1, 0, 0, 0, 1, 1, 0],
        [1, 1, 0, 0, 0, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 0, 0],
        [1, 1, 0, 0, 0, 1, 1, 0],
        [1, 1, 0, 0, 0, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ],
      // Add more letters as needed...
      " ": Array(8).fill(Array(8).fill(0)),
    };
    
    return patterns[letter] || patterns[" "];
  }
  
  // Health check - mark offline nodes
  healthCheck(): void {
    const now = Date.now();
    const timeout = 30000; // 30 seconds
    
    this.nodes.forEach((node) => {
      if (now - node.lastSeen > timeout) {
        node.status = "offline";
      }
    });
  }
  
  // Update node heartbeat
  updateHeartbeat(deviceId: string): void {
    const node = this.nodes.get(deviceId);
    if (node) {
      node.lastSeen = Date.now();
      node.status = "online";
    }
  }
}

// React hook for swarm management
import { useState, useEffect, useRef } from "react";
import { useDeviceManager } from "../../hooks/useDeviceManager";

export function useSwarmManager(hostId: string = "fabric-host") {
  const [swarmManager] = useState(() => new SwarmManager(hostId));
  const [nodes, setNodes] = useState<SwarmNode[]>([]);
  const { devices, sendCommand } = useDeviceManager();
  
  useEffect(() => {
    // Setup message callback
    swarmManager.onMessage((deviceId, message) => {
      // Forward message to actual device
      sendCommand(deviceId, message.command, message.payload);
    });
    
    // Health check interval
    const healthInterval = setInterval(() => {
      swarmManager.healthCheck();
      setNodes(swarmManager.getNodes());
    }, 5000);
    
    return () => {
      clearInterval(healthInterval);
    };
  }, [swarmManager, sendCommand]);
  
  // Auto-register connected devices as nodes
  useEffect(() => {
    devices.forEach((device, index) => {
      const existingNode = swarmManager.getNodes().find((n) => n.deviceId === device.id);
      if (!existingNode) {
        swarmManager.registerNode(device.id, index + 1);
        setNodes(swarmManager.getNodes());
      }
    });
  }, [devices, swarmManager]);
  
  return {
    swarmManager,
    nodes,
    registerNode: (deviceId: string, nodeNumber: number, options?: any) => {
      swarmManager.registerNode(deviceId, nodeNumber, options);
      setNodes(swarmManager.getNodes());
    },
    unregisterNode: (deviceId: string) => {
      swarmManager.unregisterNode(deviceId);
      setNodes(swarmManager.getNodes());
    },
    broadcast: swarmManager.broadcast.bind(swarmManager),
    sendToNodes: swarmManager.sendToNodes.bind(swarmManager),
    displayWord: swarmManager.displayWord.bind(swarmManager),
    displayPattern: swarmManager.displayPattern.bind(swarmManager),
    createRippleEffect: swarmManager.createRippleEffect.bind(swarmManager),
    syncAll: swarmManager.syncAll.bind(swarmManager),
  };
}
