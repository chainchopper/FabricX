import React from "react";
import { useToneSynth } from "../../hooks/useToneSynth";
import { useExperience } from "../../contexts/ExperienceContext";
import { Platform } from "react-native";

export default function ToneEngine() {
  const { state } = useExperience();
  const enabled = state.activeExperience?.id === "ar-piano" && Platform.OS === "web";
  useToneSynth(!!enabled);
  return null;
}