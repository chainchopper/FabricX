/**
 * ARPianoExperience - Full AR Virtual Piano implementation
 * With S3 Matrix integration, gyro/accelerometer, and bidirectional communication
 * Now includes AR camera overlay and MIDI input routing
 * Powered by Nirvana
 */
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as Tone from "tone";
import { useDeviceManager } from "../../hooks/useDeviceManager";
import { useHaptics } from "../../../app/hooks/useHaptics";
import { useAR } from "../../contexts/ARContext";
import { useMIDI } from "../../hooks/useMIDI";

// Piano key configuration
const WHITE_KEYS = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_KEYS = ["C#", "D#", null, "F#", "G#", "A#"];
const OCTAVES = 3;
const START_OCTAVE = 3;

interface PianoKey {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
  position: [number, number, number];
  size: [number, number, number];
  midi: number;
}

interface ARPianoProps {
  onKeyPress?: (note: string, velocity: number) => void;
  deviceId?: string; // S3 Matrix device ID
  enableARCamera?: boolean; // Enable AR camera background
  enableMIDIInput?: boolean; // Enable MIDI keyboard input
}

// Generate all piano keys
function generateKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  const whiteKeyWidth = 0.15;
  const blackKeyWidth = 0.1;
  const keyDepth = 1.0;
  const whiteKeyHeight = 0.05;
  const blackKeyHeight = 0.08;
  
  let whiteKeyIndex = 0;
  
  for (let octave = 0; octave < OCTAVES; octave++) {
    for (let i = 0; i < 7; i++) {
      const note = WHITE_KEYS[i];
      const actualOctave = START_OCTAVE + octave;
      const frequency = Tone.Frequency(`${note}${actualOctave}`).toFrequency();
      const midi = Tone.Frequency(`${note}${actualOctave}`).toMidi();
      
      keys.push({
        note,
        octave: actualOctave,
        frequency,
        isBlack: false,
        position: [whiteKeyIndex * whiteKeyWidth - 1.5, 0, 0],
        size: [whiteKeyWidth * 0.95, whiteKeyHeight, keyDepth],
        midi,
      });
      
      whiteKeyIndex++;
      
      // Add black key if exists
      if (BLACK_KEYS[i]) {
        const blackNote = BLACK_KEYS[i]!;
        const blackFreq = Tone.Frequency(`${blackNote}${actualOctave}`).toFrequency();
        const blackMidi = Tone.Frequency(`${blackNote}${actualOctave}`).toMidi();
        
        keys.push({
          note: blackNote,
          octave: actualOctave,
          frequency: blackFreq,
          isBlack: true,
          position: [
            (whiteKeyIndex - 0.5) * whiteKeyWidth - 1.5,
            blackKeyHeight / 2,
            -keyDepth * 0.3,
          ],
          size: [blackKeyWidth, blackKeyHeight, keyDepth * 0.6],
          midi: blackMidi,
        });
      }
    }
  }
  
  return keys;
}

function PianoKeyMesh({
  keyData,
  onPress,
  onRelease,
  pressedKeys,
}: {
  keyData: PianoKey;
  onPress: (key: PianoKey) => void;
  onRelease: (key: PianoKey) => void;
  pressedKeys: Set<string>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isPressed = pressedKeys.has(`${keyData.note}${keyData.octave}`);
  
  const color = keyData.isBlack
    ? isPressed
      ? "#22d3ee"
      : "#1a1a2e"
    : isPressed
    ? "#60a5fa"
    : "#f8f9fa";
  
  const emissive = isPressed ? (keyData.isBlack ? "#22d3ee" : "#3b82f6") : "#000000";
  
  return (
    <mesh
      ref={meshRef}
      position={keyData.position}
      onPointerDown={() => onPress(keyData)}
      onPointerUp={() => onRelease(keyData)}
      onPointerLeave={() => onRelease(keyData)}
    >
      <boxGeometry args={keyData.size} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={isPressed ? 0.5 : 0}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
}

/**
 * PianoSceneContent - Internal 3D scene content for the piano
 */
function PianoSceneContent({
  onKeyPress,
  onKeyRelease,
  pressedKeys,
  gyroEffect,
  videoTexture,
}: {
  onKeyPress: (key: PianoKey) => void;
  onKeyRelease: (key: PianoKey) => void;
  pressedKeys: Set<string>;
  gyroEffect: { x: number; y: number; z: number };
  videoTexture: THREE.VideoTexture | null;
}) {
  const keys = generateKeys();
  const { camera, scene } = useThree();
  
  // Apply gyro effect to camera
  useFrame(() => {
    camera.position.x += gyroEffect.x * 0.01;
    camera.position.y += gyroEffect.y * 0.01;
    camera.rotation.z = gyroEffect.z * 0.1;
  });
  
  // Set AR camera background
  useEffect(() => {
    if (videoTexture) {
      scene.background = videoTexture;
    } else {
      scene.background = new THREE.Color(0x0b1020);
    }
  }, [videoTexture, scene]);
  
  return (
    <>
      <ambientLight intensity={videoTexture ? 0.6 : 0.4} />
      <spotLight position={[0, 5, 0]} angle={0.6} penumbra={1} intensity={videoTexture ? 1.2 : 1} />
      <pointLight position={[-5, 3, -5]} intensity={videoTexture ? 0.6 : 0.5} />
      <pointLight position={[5, 3, -5]} intensity={videoTexture ? 0.6 : 0.5} />
      
      {keys.map((key, idx) => (
        <PianoKeyMesh
          key={`${key.note}${key.octave}-${idx}`}
          keyData={key}
          onPress={onKeyPress}
          onRelease={onKeyRelease}
          pressedKeys={pressedKeys}
        />
      ))}
      
      {/* Piano frame */}
      <mesh position={[0, -0.1, 0.5]}>
        <boxGeometry args={[4, 0.1, 1.2]} />
        <meshStandardMaterial color="#2d3748" metalness={0.8} roughness={0.2} />
      </mesh>
    </>
  );
}

/**
 * PianoScene - Exported component for use inside an existing R3F Canvas
 * This renders only the 3D piano objects without creating its own Canvas
 */
export function PianoScene({
  enableARCamera = false,
  enableMIDIInput = true,
  onKeyPress,
  deviceId,
}: Partial<ARPianoProps>) {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [gyroEffect, setGyroEffect] = useState({ x: 0, y: 0, z: 0 });
  const haptics = useHaptics();
  const { devices, sendCommand } = useDeviceManager();
  const { videoTexture, isARCameraActive } = useAR();
  const { activeNotes } = useMIDI();
  
  // Memoize keys array to avoid regenerating on every render
  const keys = useMemo(() => generateKeys(), []);
  
  // Create a lookup map for efficient key finding
  const keyMap = useMemo(() => {
    const map = new Map<string, PianoKey>();
    keys.forEach(key => {
      map.set(`${key.note}${key.octave}`, key);
    });
    return map;
  }, [keys]);
  
  // Initialize synthesizer
  useEffect(() => {
    const initSynth = async () => {
      await Tone.start();
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        volume: -8,
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.005,
          decay: 0.1,
          sustain: 0.3,
          release: 1,
        },
      }).toDestination();
    };
    
    initSynth();
    
    return () => {
      synthRef.current?.dispose();
    };
  }, []);
  
  // Listen to S3 Matrix device gyro/accelerometer
  useEffect(() => {
    if (!deviceId) return;
    
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;
    
    // Device event handling would be implemented here
    // This is a placeholder for the integration pattern
  }, [deviceId, devices]);
  
  const handleKeyPress = useCallback(
    (key: PianoKey) => {
      const keyId = `${key.note}${key.octave}`;
      if (pressedKeys.has(keyId)) return;
      
      setPressedKeys((prev) => new Set(prev).add(keyId));
      
      // Play sound
      if (synthRef.current) {
        synthRef.current.triggerAttack(key.frequency);
      }
      
      // Haptic feedback
      haptics.impactLight();
      
      // Send to device LEDs
      if (deviceId) {
        const hue = (key.midi % 12) * 30;
        sendCommand(deviceId, "setLED", {
          index: key.midi % 64,
          color: { h: hue, s: 100, v: 255 },
        });
      }
      
      // Callback
      onKeyPress?.(key.note + key.octave, 0.8);
    },
    [pressedKeys, haptics, deviceId, sendCommand, onKeyPress]
  );
  
  const handleKeyRelease = useCallback(
    (key: PianoKey) => {
      const keyId = `${key.note}${key.octave}`;
      if (!pressedKeys.has(keyId)) return;
      
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
      
      // Release sound
      if (synthRef.current) {
        synthRef.current.triggerRelease(key.frequency);
      }
      
      // Clear device LED
      if (deviceId) {
        sendCommand(deviceId, "setLED", {
          index: key.midi % 64,
          color: { h: 0, s: 0, v: 0 },
        });
      }
    },
    [pressedKeys, deviceId, sendCommand]
  );
  
  // Handle MIDI input
  useEffect(() => {
    if (!enableMIDIInput) return;
    
    // Convert activeNotes to Set for O(1) lookup
    const activeNotesSet = new Set(activeNotes);
    
    // Map MIDI notes to piano key presses
    activeNotes.forEach((noteName) => {
      const matchingKey = keyMap.get(noteName);
      
      if (matchingKey && !pressedKeys.has(noteName)) {
        handleKeyPress(matchingKey);
      }
    });
    
    // Release keys that are no longer active
    pressedKeys.forEach((keyId) => {
      if (!activeNotesSet.has(keyId)) {
        const matchingKey = keyMap.get(keyId);
        if (matchingKey) {
          handleKeyRelease(matchingKey);
        }
      }
    });
  }, [activeNotes, enableMIDIInput, pressedKeys, keyMap, handleKeyPress, handleKeyRelease]);
  
  return (
    <PianoSceneContent
      onKeyPress={handleKeyPress}
      onKeyRelease={handleKeyRelease}
      pressedKeys={pressedKeys}
      gyroEffect={gyroEffect}
      videoTexture={enableARCamera ? videoTexture : null}
    />
  );
}

/**
 * ARPianoExperience - Full standalone AR Piano with its own Canvas
 * Use this for standalone piano applications
 */
export default function ARPianoExperience({ 
  onKeyPress, 
  deviceId,
  enableARCamera = false,
  enableMIDIInput = true,
}: ARPianoProps) {
  const { enableARCamera: enableAR, disableARCamera: disableAR, isARCameraActive } = useAR();
  const { activeNotes } = useMIDI();
  
  // Initialize AR camera if enabled
  useEffect(() => {
    if (enableARCamera && !isARCameraActive) {
      enableAR().catch(err => {
        console.warn("Failed to enable AR camera:", err);
      });
    }
    
    return () => {
      if (enableARCamera && isARCameraActive) {
        disableAR();
      }
    };
  }, [enableARCamera, isARCameraActive, enableAR, disableAR]);
  
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        camera={{ position: [0, 3, 5], fov: 60 }}
        style={{ width: "100%", height: "100%" }}
      >
        <PianoScene
          enableARCamera={enableARCamera}
          enableMIDIInput={enableMIDIInput}
          onKeyPress={onKeyPress}
          deviceId={deviceId}
        />
      </Canvas>
      
      {/* Status overlay */}
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          backgroundColor: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "12px",
          borderRadius: "8px",
          fontSize: "12px",
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>AR Piano Active</div>
        {deviceId && <div>Device: {deviceId.slice(0, 8)}</div>}
        {enableARCamera && (
          <div style={{ color: isARCameraActive ? "#10b981" : "#f59e0b" }}>
            Camera: {isARCameraActive ? "Active" : "Initializing..."}
          </div>
        )}
        {enableMIDIInput && (
          <div style={{ color: "#22d3ee" }}>
            MIDI: {activeNotes.length > 0 ? `${activeNotes.length} notes` : "Ready"}
          </div>
        )}
      </div>
    </div>
  );
}
