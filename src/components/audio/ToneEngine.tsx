import React from "react";
import { useToneSynth } from "../../hooks/useToneSynth";
import { useExperience } from "../../contexts/ExperienceContext";
import { Platform } from "react-native";

export default function ToneEngine() {
  const { state } = useExperience();
  // The piano layer and the Dancer Stage both play notes (the stage
  // has its own key strip on the same note bus). Slice 53: the
  // Ghostie Playground joins them — its layer mounts this engine
  // alongside its own key strip, on the same bus, so the ghost's
  // note tools SOUND there exactly as they do at the Piano.
  const activeId = state.activeExperience?.id;
  const enabled =
    (activeId === "ar-piano" ||
      activeId === "dancer-stage" ||
      activeId === "ghostie-playground") &&
    Platform.OS === "web";
  useToneSynth(!!enabled);
  return null;
}