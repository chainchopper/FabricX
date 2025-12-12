import React from "react";
import { useExperience } from "../../contexts/ExperienceContext";
import ARPianoExperience from "./ARPianoExperience";
import { ErrorBoundary } from "../ErrorBoundary";

/**
 * PianoOverlay - Renders the AR Piano experience when active
 * Integrates with experience config for AR camera and MIDI settings
 */
export default function PianoOverlay() {
  const { state } = useExperience();
  const { experienceConfig } = state;
  
  // Get config from experience
  const specific = experienceConfig.specific as Record<string, unknown> || {};
  const enableARCamera = Boolean(specific.enableARCamera ?? true);
  const enableMIDIInput = Boolean(specific.enableMIDIInput ?? true);
  
  return (
    <div style={{ 
      position: "absolute", 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0,
      pointerEvents: "auto",
    }}>
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('[PianoOverlay] Error in AR Piano:', error, errorInfo);
        }}
      >
        <ARPianoExperience 
          enableARCamera={enableARCamera}
          enableMIDIInput={enableMIDIInput}
        />
      </ErrorBoundary>
    </div>
  );
}