/**
 * ImageUploadButton - File picker and camera capture for Vision AI
 * Powered by Nirvana
 */
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";
import { useToast } from "./Toast";

interface ImageUploadButtonProps {
  onImageSelected: (imageUri: string, imageBlob?: Blob) => void;
  onAnalysisRequest?: (imageUri: string, prompt?: string) => Promise<void>;
}

export default function ImageUploadButton({
  onImageSelected,
  onAnalysisRequest,
}: ImageUploadButtonProps) {
  const haptics = useHaptics();
  const audio = useAudioCues();
  const toast = useToast();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Only show on web for now
  if (Platform.OS !== "web") {
    return null;
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.show("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUri = e.target?.result as string;
      setSelectedImage(imageUri);
      setModalVisible(true);
      onImageSelected(imageUri, file);
      haptics.impactMedium();
      audio.success();
    };

    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUri = e.target?.result as string;
      setSelectedImage(imageUri);
      setModalVisible(true);
      onImageSelected(imageUri, file);
      haptics.impactMedium();
      audio.success();
    };

    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!selectedImage || !onAnalysisRequest) return;

    setIsAnalyzing(true);
    haptics.impactMedium();
    audio.pulse();

    try {
      await onAnalysisRequest(selectedImage);
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

  const handleClose = () => {
    setModalVisible(false);
    setSelectedImage(null);
    haptics.impactLight();
    audio.click();
  };

  return (
    <>
      {/* Upload Buttons */}
      <View style={{ gap: 8 }}>
        {/* File Upload Button */}
        <Pressable
          onPress={() => {
            haptics.impactMedium();
            audio.click();
            fileInputRef.current?.click();
          }}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(34,211,238,0.5)",
            backgroundColor: "rgba(34,211,238,0.15)",
            shadowColor: "#22d3ee",
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#22d3ee",
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            📁 Upload Image
          </Text>
        </Pressable>

        {/* Camera Capture Button */}
        <Pressable
          onPress={() => {
            haptics.impactMedium();
            audio.click();
            cameraInputRef.current?.click();
          }}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(139,92,246,0.5)",
            backgroundColor: "rgba(139,92,246,0.15)",
            shadowColor: "#8b5cf6",
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#a78bfa",
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            📸 Capture Photo
          </Text>
        </Pressable>
      </View>

      {/* Hidden File Inputs */}
      {Platform.OS === "web" && (
        <>
          <input
            ref={fileInputRef as any}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelect as any}
          />
          <input
            ref={cameraInputRef as any}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleCameraCapture as any}
          />
        </>
      )}

      {/* Image Preview Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.9)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <ScrollView
            contentContainerStyle={{
              alignItems: "center",
              paddingVertical: 20,
            }}
          >
            {/* Image Preview */}
            {selectedImage && (
              <Image
                source={{ uri: selectedImage }}
                style={{
                  width: "100%",
                  maxWidth: 500,
                  height: 400,
                  borderRadius: 12,
                  marginBottom: 20,
                }}
                resizeMode="contain"
              />
            )}

            {/* Action Buttons */}
            <View style={{ gap: 12, width: "100%", maxWidth: 500 }}>
              {onAnalysisRequest && (
                <Pressable
                  onPress={handleAnalyze}
                  disabled={isAnalyzing}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 12,
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
                      fontSize: 16,
                    }}
                  >
                    {isAnalyzing ? "Analyzing..." : "🔍 Analyze with Vision AI"}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleClose}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.5)",
                  backgroundColor: "transparent",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#e5e7eb",
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Close
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
