import React from "react";
import { Pressable, Text } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useExperience } from "../../../src/contexts/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

/**
 * SeeFabricButton — the Preferences panel's quick access to the
 * See fabric (Slice 64). This slot used to open the legacy Vision
 * AI drawer, a second, divergent vision surface: a still-photo
 * analyzer with its own config section, dead by default, that
 * never touched the camera or SAM. The drawer is retired — its
 * one real feature (still-photo analysis) moved onto the See
 * fabric itself — and this button now goes where camera vision
 * actually lives: the fabric. The pick is the primary's own
 * explicit choice from a settings surface, like a deep link:
 * every drawer closes, then the fabric switches.
 */
export default function SeeFabricButton() {
  const { closeAll } = useNewDrawers();
  const { switchExperience } = useExperience();
  const haptics = useHaptics();
  const audio = useAudioCues();

  return (
    <Pressable
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: "rgba(56,189,248,0.15)",
        borderWidth: 1,
        borderColor: "rgba(56,189,248,0.4)",
      }}
      onPress={() => {
        haptics.impactMedium();
        audio.click();
        closeAll();
        void switchExperience("sam-see");
      }}
    >
      <Text style={{ color: "#e2e8f0", fontWeight: "600" }}>
        👁️ See — the camera fabric
      </Text>
    </Pressable>
  );
}
