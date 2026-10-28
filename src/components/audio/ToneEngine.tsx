import React from "react";
import { useToneSynth } from "../../hooks/useToneSynth";
import { useExperience } from "../../contexts/ExperienceContext";
import { Platform } from "react-native";

export default function ToneEngine() {
  const { state } = useExperience();
  // The piano layer and the Dancer Stage both play notes (the stage
  // has its own key strip on the same note bus).
  const activeId = state.activeExperience?.id;
  const enabled =
    (activeId === "ar-piano" || activeId === "dancer-stage") &&
    Platform.OS === "web";
  useToneSynth(!!enabled);
  return null;
}