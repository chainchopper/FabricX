/**
 * VisionAIDrawer - Vision AI image analysis interface
 * Powered by Nirvana
 */
import React, { useState } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
  ScrollView,
  Image,
} from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { useToast } from "../Toast";
import ImageUploadButton from "../ImageUploadButton";
import { getAIConfig } from "./AISettingsDrawer";

export default function VisionAIDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("vision-ai");
  const haptics = useHaptics();
  const audio = useAudioCues();
  const toast = useToast();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleBack = () => {
    haptics.impactLight();
    audio.click();
    back();
  };

  const handleImageSelected = (imageUri: string) => {
    setSelectedImage(imageUri);
    setAnalysis(null);
  };

  const handleAnalyze = async (imageUri: string, prompt?: string) => {
    setIsAnalyzing(true);
    toast.show("Analyzing image...");

    try {
      const config = await getAIConfig();
      if (!config.vision.enabled || config.vision.provider === "none") {
        throw new Error("Vision AI is not enabled. Configure it in AI Settings.");
      }

      const { getVisionAIService } = await import("../../../src/services/VisionAIService");
      const visionService = getVisionAIService(config.vision);

      const result = await visionService.analyzeImage(
        imageUri,
        prompt || "Describe this image in detail."
      );

      setAnalysis(result);
      toast.show("Analysis complete!");
      haptics.notifySuccess();
      audio.success();
    } catch (err) {
      toast.show(`Analysis failed: ${err}`);
      haptics.notifyError();
      audio.error();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    setSelectedImage(null);
    setAnalysis(null);
    haptics.impactLight();
    audio.click();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(10,14,28,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
            paddingHorizontal: 16,
          }}
        >
          <Pressable
            onPress={handleBack}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>
            Vision AI
          </Text>
        </View>
        <Text
          style={{
            color: "#93c5fd",
            marginBottom: 16,
            paddingHorizontal: 16,
          }}
        >
          Upload or capture an image for AI analysis
        </Text>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}
        >
          {/* Upload Buttons */}
          {!selectedImage && (
            <ImageUploadButton
              onImageSelected={handleImageSelected}
              onAnalysisRequest={handleAnalyze}
            />
          )}

          {/* Selected Image Preview */}
          {selectedImage && (
            <View style={{ gap: 12 }}>
              <Image
                source={{ uri: selectedImage }}
                style={{
                  width: "100%",
                  height: 300,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.3)",
                }}
                resizeMode="contain"
              />

              {/* Action Buttons */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => handleAnalyze(selectedImage)}
                  disabled={isAnalyzing}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isAnalyzing
                      ? "rgba(148,163,184,0.3)"
                      : "rgba(34,211,238,0.7)",
                    backgroundColor: isAnalyzing
                      ? "rgba(148,163,184,0.1)"
                      : "rgba(34,211,238,0.2)",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isAnalyzing ? "#9ca3af" : "#22d3ee",
                      fontWeight: "700",
                    }}
                  >
                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleClear}
                  disabled={isAnalyzing}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.5)",
                    backgroundColor: "rgba(239,68,68,0.1)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#ef4444", fontWeight: "700" }}>
                    Clear
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Analysis Results */}
          {analysis && (
            <View
              style={{
                backgroundColor: "rgba(139,92,246,0.1)",
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: "rgba(139,92,246,0.3)",
                gap: 12,
              }}
            >
              <Text style={{ color: "#a78bfa", fontWeight: "700", fontSize: 16 }}>
                Analysis Results
              </Text>

              {/* Description */}
              <View>
                <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
                  Description:
                </Text>
                <Text style={{ color: "#e5e7eb", fontSize: 14, lineHeight: 20 }}>
                  {analysis.description}
                </Text>
              </View>

              {/* Labels */}
              {analysis.labels && analysis.labels.length > 0 && (
                <View>
                  <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>
                    Labels:
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {analysis.labels.map((label: string, index: number) => (
                      <View
                        key={index}
                        style={{
                          backgroundColor: "rgba(34,211,238,0.2)",
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#22d3ee", fontSize: 12 }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Objects */}
              {analysis.objects && analysis.objects.length > 0 && (
                <View>
                  <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>
                    Objects Detected: {analysis.objects.length}
                  </Text>
                  <View style={{ gap: 4 }}>
                    {analysis.objects.slice(0, 5).map((obj: any, index: number) => (
                      <Text key={index} style={{ color: "#e5e7eb", fontSize: 12 }}>
                        • {obj.name} ({Math.round(obj.confidence * 100)}%)
                      </Text>
                    ))}
                  </View>
                </View>
              )}

              {/* Text (OCR) */}
              {analysis.text && (
                <View>
                  <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>
                    Text Found:
                  </Text>
                  <Text style={{ color: "#e5e7eb", fontSize: 12, lineHeight: 18 }}>
                    {analysis.text}
                  </Text>
                </View>
              )}

              {/* Colors */}
              {analysis.colors && analysis.colors.length > 0 && (
                <View>
                  <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>
                    Dominant Colors:
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {analysis.colors.slice(0, 5).map((colorInfo: any, index: number) => (
                      <View
                        key={index}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          backgroundColor: colorInfo.color,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.3)",
                        }}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 16,
          }}
        >
          <Text style={{ color: "#a3e635", fontSize: 12 }}>
            Powered by Nirvana
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
