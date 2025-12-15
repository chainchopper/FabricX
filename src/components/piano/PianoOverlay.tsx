import React from "react";
import { useExperience } from "../../contexts/ExperienceContext";
import { PianoScene } from "./ARPianoExperience";
import { ErrorBoundary } from "../ErrorBoundary";

/**
 * PianoOverlay - Renders the AR Piano 3D scene inside the main Canvas
 * This component is used within FabricWeb3D's Canvas, so it only renders 3D objects
 */
export default function PianoOverlay() {
  const { state } = useExperience();
  const { experienceConfig } = state;
  
  // Get config from experience
  const specific = experienceConfig.specific as Record<string, unknown> || {};
  const enableARCamera = Boolean(specific.enableARCamera ?? true);
  const enableMIDIInput = Boolean(specific.enableMIDIInput ?? true);
  
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[PianoOverlay] Error in AR Piano:', error, errorInfo);
      }}
    >
      <PianoScene 
        enableARCamera={enableARCamera}
        enableMIDIInput={enableMIDIInput}
      />
    </ErrorBoundary>
  );
}