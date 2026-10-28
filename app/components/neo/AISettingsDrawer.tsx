/**
 * AISettingsDrawer - Configuration for AI services (LLM, Vision, OCR, Voice)
 * Allows users to connect their own API keys and endpoints
 * Powered by Nirvana
 */
import React, { useState, useEffect } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
  ScrollView,
  TextInput,
  Platform,
} from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { getJSON, setJSON } from "../../utils/storage";
import { useToast } from "../Toast";


const STORAGE_KEY = "fabric_ai_config_v1";

export interface AIServiceConfig {
  llm: {
    provider: "openai" | "anthropic" | "custom" | "none";
    apiKey: string;
    endpoint: string;
    model: string;
    enabled: boolean;
  };
  vision: {
    provider: "openai" | "google" | "custom" | "none";
    apiKey: string;
    endpoint: string;
    model: string;
    enabled: boolean;
  };
  ocr: {
    provider: "tesseract" | "google" | "custom" | "none";
    apiKey: string;
    endpoint: string;
    enabled: boolean;
  };
  voice: {
    provider: "browser" | "whisper" | "custom" | "none";
    apiKey: string;
    endpoint: string;
    enabled: boolean;
    language: string;
  };
}

/**
 * Meta Model API preset (Slice 1). Meta's Model API is OpenAI-compatible,
 * so LLMService's "custom" provider talks to it directly: it appends
 * /chat/completions to the endpoint below and sends the key as a Bearer
 * token. Base URL and model id verified against Meta's Model API
 * documentation (Oct 2026): https://api.meta.ai/v1, model "muse-spark-1.3".
 * Get a key at dev.meta.ai (keys start with "LLM_").
 */
const META_MODEL_API_ENDPOINT = "https://api.meta.ai/v1";
const META_MUSE_SPARK_MODEL = "muse-spark-1.3";

const defaultConfig: AIServiceConfig = {
  llm: {
    provider: "none",
    apiKey: "",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4",
    enabled: false,
  },
  vision: {
    provider: "none",
    apiKey: "",
    // Doctrine 9 (one model router): no hardcoded Google Vision
    // endpoint as the default — the configured model's endpoint is
    // the user's choice (Meta preset, on-device, or any compatible
    // base they enter below).
    endpoint: "",
    model: "gpt-4-vision-preview",
    enabled: false,
  },
  ocr: {
    provider: "tesseract",
    apiKey: "",
    endpoint: "",
    enabled: false,
  },
  voice: {
    provider: "browser",
    apiKey: "",
    endpoint: "",
    enabled: false,
    language: "en-US",
  },
};

export default function AISettingsDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("ai-settings");
  const haptics = useHaptics();
  const audio = useAudioCues();
  const toast = useToast();

  const [config, setConfig] = useState<AIServiceConfig>(defaultConfig);
  const [activeSection, setActiveSection] = useState<
    "llm" | "vision" | "ocr" | "voice"
  >("llm");
  const [showApiKey, setShowApiKey] = useState(false);

  // Load config from storage
  useEffect(() => {
    getJSON<AIServiceConfig>(STORAGE_KEY, defaultConfig).then((saved) => {
      if (saved) {
        setConfig(saved);
      }
    });
  }, []);

  // Save config to storage
  const saveConfig = (newConfig: AIServiceConfig) => {
    setConfig(newConfig);
    setJSON(STORAGE_KEY, newConfig);
    // Slice 1 fix: drop the cached LLM service singleton on every save,
    // so chats use the settings just saved. Previously only
    // testConnection reset it — a chat opened before changing the
    // endpoint/key kept using the stale config until reload.
    void import("../../../src/services/LLMService")
      .then((m) => m.resetLLMService())
      .catch(() => {
        // Service not loaded yet — nothing cached to reset.
      });
    haptics.impactLight();
    audio.success();
    toast.show("AI settings saved");
  };

  const handleBack = () => {
    haptics.impactLight();
    audio.click();
    back();
  };

  const updateLLM = (updates: Partial<AIServiceConfig["llm"]>) => {
    const newConfig = {
      ...config,
      llm: { ...config.llm, ...updates },
    };
    saveConfig(newConfig);
  };

  /** One-tap Meta (Muse Spark) preset: custom provider + Meta endpoint/model, enabled. */
  const applyMetaPreset = () => {
    updateLLM({
      provider: "custom",
      endpoint: META_MODEL_API_ENDPOINT,
      model: META_MUSE_SPARK_MODEL,
      enabled: true,
    });
    toast.show("Meta (Muse Spark) preset set — paste your Model API key below");
  };

  const updateVision = (updates: Partial<AIServiceConfig["vision"]>) => {
    const newConfig = {
      ...config,
      vision: { ...config.vision, ...updates },
    };
    saveConfig(newConfig);
  };

  const updateOCR = (updates: Partial<AIServiceConfig["ocr"]>) => {
    const newConfig = {
      ...config,
      ocr: { ...config.ocr, ...updates },
    };
    saveConfig(newConfig);
  };

  const updateVoice = (updates: Partial<AIServiceConfig["voice"]>) => {
    const newConfig = {
      ...config,
      voice: { ...config.voice, ...updates },
    };
    saveConfig(newConfig);
  };

  const testConnection = async (service: keyof AIServiceConfig) => {
    haptics.impactMedium();
    audio.pulse();
    toast.show(`Testing ${service} connection...`);
    
    try {
      if (service === "llm") {
        const { getLLMService, resetLLMService } = await import("../../../src/services/LLMService");
        resetLLMService();
        const llmService = getLLMService(config.llm);
        const success = await llmService.testConnection();
        
        if (success) {
          haptics.notifySuccess();
          audio.success();
          toast.show("LLM connection successful!");
        } else {
          haptics.notifyError();
          audio.error();
          toast.show("LLM connection failed");
        }
      } else if (service === "vision") {
        const { getVisionAIService, resetVisionAIService } = await import("../../../src/services/VisionAIService");
        resetVisionAIService();
        const visionService = getVisionAIService(config.vision);
        const success = await visionService.testConnection();
        
        if (success) {
          haptics.notifySuccess();
          audio.success();
          toast.show("Vision AI connection successful!");
        } else {
          haptics.notifyError();
          audio.error();
          toast.show("Vision AI connection failed");
        }
      } else if (service === "voice") {
        const { getVoiceInputService } = await import("../../../src/services/VoiceInputService");
        const voiceService = getVoiceInputService(config.voice);
        await voiceService.initialize();
        
        haptics.notifySuccess();
        audio.success();
        toast.show("Voice input initialized successfully!");
      } else if (service === "ocr") {
        const { getOCRService, resetOCRService } = await import("../../../src/services/OCRService");
        resetOCRService();
        const ocrService = getOCRService(config.ocr);
        const success = await ocrService.testConnection();
        
        if (success) {
          haptics.notifySuccess();
          audio.success();
          toast.show("OCR connection successful!");
        } else {
          haptics.notifyError();
          audio.error();
          toast.show("OCR connection failed");
        }
      } else {
        toast.show(`${service} test not yet implemented`);
      }
    } catch (err) {
      haptics.notifyError();
      audio.error();
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.show(`Connection failed: ${errorMsg}`);
      console.error(`[AI Settings] Test failed for ${service}:`, err);
    }
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
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width,
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
            AI Services
          </Text>
        </View>
        <Text
          style={{
            color: "#93c5fd",
            marginBottom: 16,
            paddingHorizontal: 16,
          }}
        >
          Configure AI endpoints and API keys
        </Text>

        {/* The ghost brain tier moved to Your Ghostie (Slice 20) —
            the preference itself (fabric_ghost_brain_v1) and its
            routing are unchanged; only the switch's home moved. */}
        <Text
          style={{
            color: "#93c5fd",
            fontSize: 13,
            paddingHorizontal: 16,
            marginBottom: 16,
          }}
        >
          Ghost brain lives in Your Ghostie — F menu › UNIVERSAL › Your
          Ghostie.
        </Text>

        {/* Section Tabs */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 16,
            marginBottom: 12,
            gap: 8,
          }}
        >
          {(["llm", "vision", "ocr", "voice"] as const).map((section) => (
            <Pressable
              key={section}
              onPress={() => {
                setActiveSection(section);
                haptics.impactLight();
                audio.click();
              }}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  activeSection === section
                    ? "rgba(34,211,238,0.8)"
                    : "rgba(148,163,184,0.25)",
                backgroundColor:
                  activeSection === section
                    ? "rgba(34,211,238,0.15)"
                    : "transparent",
              }}
            >
              <Text
                style={{
                  color: activeSection === section ? "#22d3ee" : "#e5e7eb",
                  fontWeight: "700",
                  fontSize: 12,
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
              >
                {section}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16 }}
        >
          {/* LLM Configuration */}
          {activeSection === "llm" && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 16 }}>
                Language Model (LLM)
              </Text>

              {/* Enable Toggle */}
              <Pressable
                onPress={() => updateLLM({ enabled: !config.llm.enabled })}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: config.llm.enabled
                    ? "rgba(34,197,94,0.7)"
                    : "rgba(148,163,184,0.4)",
                  backgroundColor: config.llm.enabled
                    ? "rgba(16,185,129,0.18)"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    color: config.llm.enabled ? "#34d399" : "#e5e7eb",
                    fontWeight: "700",
                  }}
                >
                  {config.llm.enabled ? "Enabled" : "Disabled"}
                </Text>
              </Pressable>

              {/* Provider Selection */}
              <View>
                <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                  Provider:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["openai", "anthropic", "custom", "none"] as const).map(
                    (provider) => (
                      <Pressable
                        key={provider}
                        onPress={() => updateLLM({ provider })}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            config.llm.provider === provider
                              ? "rgba(34,211,238,0.85)"
                              : "rgba(148,163,184,0.35)",
                          backgroundColor:
                            config.llm.provider === provider
                              ? "rgba(2,132,199,0.22)"
                              : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color:
                              config.llm.provider === provider
                                ? "#22d3ee"
                                : "#e5e7eb",
                            fontWeight: "700",
                          }}
                        >
                          {provider}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>

              {/* One-tap Meta (Muse Spark) preset */}
              <Pressable
                onPress={applyMetaPreset}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.7)",
                  backgroundColor: "rgba(34,211,238,0.12)",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                  Use Meta (Muse Spark)
                </Text>
                <Text style={{ color: "#93c5fd", fontSize: 11 }}>
                  {META_MODEL_API_ENDPOINT} · {META_MUSE_SPARK_MODEL} — then paste your key below
                </Text>
              </Pressable>

              {/* API Key Input */}
              {config.llm.provider !== "none" && (
                <>
                  <View>
                    <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                      API Key:
                    </Text>
                    <TextInput
                      value={config.llm.apiKey}
                      onChangeText={(text) => updateLLM({ apiKey: text })}
                      placeholder="sk-..."
                      placeholderTextColor="rgba(148,163,184,0.5)"
                      secureTextEntry={!showApiKey}
                      style={{
                        backgroundColor: "rgba(15,23,42,0.7)",
                        borderWidth: 1,
                        borderColor: "rgba(148,163,184,0.3)",
                        borderRadius: 10,
                        padding: 10,
                        color: "#e5e7eb",
                        fontFamily: Platform.OS === "web" ? "monospace" : undefined,
                      }}
                    />
                    <Pressable
                      onPress={() => setShowApiKey(!showApiKey)}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={{ color: "#93c5fd", fontSize: 12 }}>
                        {showApiKey ? "Hide" : "Show"} API Key
                      </Text>
                    </Pressable>
                  </View>

                  {/* Endpoint Input */}
                  <View>
                    <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                      API Endpoint:
                    </Text>
                    <TextInput
                      value={config.llm.endpoint}
                      onChangeText={(text) => updateLLM({ endpoint: text })}
                      placeholder="https://api.openai.com/v1"
                      placeholderTextColor="rgba(148,163,184,0.5)"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.7)",
                        borderWidth: 1,
                        borderColor: "rgba(148,163,184,0.3)",
                        borderRadius: 10,
                        padding: 10,
                        color: "#e5e7eb",
                        fontFamily: Platform.OS === "web" ? "monospace" : undefined,
                      }}
                    />
                  </View>

                  {/* Model Input */}
                  <View>
                    <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                      Model:
                    </Text>
                    <TextInput
                      value={config.llm.model}
                      onChangeText={(text) => updateLLM({ model: text })}
                      placeholder="gpt-4"
                      placeholderTextColor="rgba(148,163,184,0.5)"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.7)",
                        borderWidth: 1,
                        borderColor: "rgba(148,163,184,0.3)",
                        borderRadius: 10,
                        padding: 10,
                        color: "#e5e7eb",
                      }}
                    />
                  </View>

                  {/* Test Button */}
                  <Pressable
                    onPress={() => testConnection("llm")}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "rgba(34,211,238,0.7)",
                      backgroundColor: "rgba(34,211,238,0.1)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                      Test Connection
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* Vision AI Configuration */}
          {activeSection === "vision" && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 16 }}>
                Vision AI
              </Text>

              <Pressable
                onPress={() => updateVision({ enabled: !config.vision.enabled })}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: config.vision.enabled
                    ? "rgba(34,197,94,0.7)"
                    : "rgba(148,163,184,0.4)",
                  backgroundColor: config.vision.enabled
                    ? "rgba(16,185,129,0.18)"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    color: config.vision.enabled ? "#34d399" : "#e5e7eb",
                    fontWeight: "700",
                  }}
                >
                  {config.vision.enabled ? "Enabled" : "Disabled"}
                </Text>
              </Pressable>

              <View>
                <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                  Provider:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["openai", "google", "custom", "none"] as const).map(
                    (provider) => (
                      <Pressable
                        key={provider}
                        onPress={() => updateVision({ provider })}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            config.vision.provider === provider
                              ? "rgba(34,211,238,0.85)"
                              : "rgba(148,163,184,0.35)",
                          backgroundColor:
                            config.vision.provider === provider
                              ? "rgba(2,132,199,0.22)"
                              : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color:
                              config.vision.provider === provider
                                ? "#22d3ee"
                                : "#e5e7eb",
                            fontWeight: "700",
                          }}
                        >
                          {provider}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>

              {config.vision.provider !== "none" && (
                <>
                  <View>
                    <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                      API Key:
                    </Text>
                    <TextInput
                      value={config.vision.apiKey}
                      onChangeText={(text) => updateVision({ apiKey: text })}
                      placeholder="Enter API key..."
                      placeholderTextColor="rgba(148,163,184,0.5)"
                      secureTextEntry={!showApiKey}
                      style={{
                        backgroundColor: "rgba(15,23,42,0.7)",
                        borderWidth: 1,
                        borderColor: "rgba(148,163,184,0.3)",
                        borderRadius: 10,
                        padding: 10,
                        color: "#e5e7eb",
                        fontFamily: Platform.OS === "web" ? "monospace" : undefined,
                      }}
                    />
                  </View>

                  <View>
                    <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                      API Endpoint:
                    </Text>
                    <TextInput
                      value={config.vision.endpoint}
                      onChangeText={(text) => updateVision({ endpoint: text })}
                      placeholder="OpenAI-compatible base (e.g. https://api.meta.ai/v1)"
                      placeholderTextColor="rgba(148,163,184,0.5)"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.7)",
                        borderWidth: 1,
                        borderColor: "rgba(148,163,184,0.3)",
                        borderRadius: 10,
                        padding: 10,
                        color: "#e5e7eb",
                        fontFamily: Platform.OS === "web" ? "monospace" : undefined,
                      }}
                    />
                  </View>

                  <Pressable
                    onPress={() => testConnection("vision")}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "rgba(34,211,238,0.7)",
                      backgroundColor: "rgba(34,211,238,0.1)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                      Test Connection
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* OCR Configuration */}
          {activeSection === "ocr" && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 16 }}>
                OCR (Text Recognition)
              </Text>

              <Pressable
                onPress={() => updateOCR({ enabled: !config.ocr.enabled })}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: config.ocr.enabled
                    ? "rgba(34,197,94,0.7)"
                    : "rgba(148,163,184,0.4)",
                  backgroundColor: config.ocr.enabled
                    ? "rgba(16,185,129,0.18)"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    color: config.ocr.enabled ? "#34d399" : "#e5e7eb",
                    fontWeight: "700",
                  }}
                >
                  {config.ocr.enabled ? "Enabled" : "Disabled"}
                </Text>
              </Pressable>

              <View>
                <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                  Provider:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["tesseract", "google", "custom", "none"] as const).map(
                    (provider) => (
                      <Pressable
                        key={provider}
                        onPress={() => updateOCR({ provider })}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            config.ocr.provider === provider
                              ? "rgba(34,211,238,0.85)"
                              : "rgba(148,163,184,0.35)",
                          backgroundColor:
                            config.ocr.provider === provider
                              ? "rgba(2,132,199,0.22)"
                              : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color:
                              config.ocr.provider === provider
                                ? "#22d3ee"
                                : "#e5e7eb",
                            fontWeight: "700",
                          }}
                        >
                          {provider}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>

              {config.ocr.provider === "tesseract" && (
                <Text style={{ color: "#93c5fd", fontSize: 12, fontStyle: "italic" }}>
                  Tesseract.js runs locally in the browser - no API key needed.
                </Text>
              )}

              {config.ocr.provider !== "none" &&
                config.ocr.provider !== "tesseract" && (
                  <>
                    <View>
                      <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                        API Key:
                      </Text>
                      <TextInput
                        value={config.ocr.apiKey}
                        onChangeText={(text) => updateOCR({ apiKey: text })}
                        placeholder="Enter API key..."
                        placeholderTextColor="rgba(148,163,184,0.5)"
                        secureTextEntry={!showApiKey}
                        style={{
                          backgroundColor: "rgba(15,23,42,0.7)",
                          borderWidth: 1,
                          borderColor: "rgba(148,163,184,0.3)",
                          borderRadius: 10,
                          padding: 10,
                          color: "#e5e7eb",
                          fontFamily:
                            Platform.OS === "web" ? "monospace" : undefined,
                        }}
                      />
                    </View>

                    <View>
                      <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                        API Endpoint:
                      </Text>
                      <TextInput
                        value={config.ocr.endpoint}
                        onChangeText={(text) => updateOCR({ endpoint: text })}
                        placeholder="https://..."
                        placeholderTextColor="rgba(148,163,184,0.5)"
                        style={{
                          backgroundColor: "rgba(15,23,42,0.7)",
                          borderWidth: 1,
                          borderColor: "rgba(148,163,184,0.3)",
                          borderRadius: 10,
                          padding: 10,
                          color: "#e5e7eb",
                          fontFamily:
                            Platform.OS === "web" ? "monospace" : undefined,
                        }}
                      />
                    </View>

                    <Pressable
                      onPress={() => testConnection("ocr")}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "rgba(34,211,238,0.7)",
                        backgroundColor: "rgba(34,211,238,0.1)",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                        Test Connection
                      </Text>
                    </Pressable>
                  </>
                )}
            </View>
          )}

          {/* Voice Input Configuration */}
          {activeSection === "voice" && (
            <View style={{ gap: 12 }}>
              <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 16 }}>
                Voice Input
              </Text>

              <Pressable
                onPress={() => updateVoice({ enabled: !config.voice.enabled })}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: config.voice.enabled
                    ? "rgba(34,197,94,0.7)"
                    : "rgba(148,163,184,0.4)",
                  backgroundColor: config.voice.enabled
                    ? "rgba(16,185,129,0.18)"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    color: config.voice.enabled ? "#34d399" : "#e5e7eb",
                    fontWeight: "700",
                  }}
                >
                  {config.voice.enabled ? "Enabled" : "Disabled"}
                </Text>
              </Pressable>

              <View>
                <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                  Provider:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["browser", "whisper", "custom", "none"] as const).map(
                    (provider) => (
                      <Pressable
                        key={provider}
                        onPress={() => updateVoice({ provider })}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            config.voice.provider === provider
                              ? "rgba(34,211,238,0.85)"
                              : "rgba(148,163,184,0.35)",
                          backgroundColor:
                            config.voice.provider === provider
                              ? "rgba(2,132,199,0.22)"
                              : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            color:
                              config.voice.provider === provider
                                ? "#22d3ee"
                                : "#e5e7eb",
                            fontWeight: "700",
                          }}
                        >
                          {provider}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>

              {config.voice.provider === "browser" && (
                <Text style={{ color: "#93c5fd", fontSize: 12, fontStyle: "italic" }}>
                  Uses Web Speech API - no API key needed. Works in modern browsers.
                </Text>
              )}

              {config.voice.provider !== "none" &&
                config.voice.provider !== "browser" && (
                  <>
                    <View>
                      <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                        API Key:
                      </Text>
                      <TextInput
                        value={config.voice.apiKey}
                        onChangeText={(text) => updateVoice({ apiKey: text })}
                        placeholder="Enter API key..."
                        placeholderTextColor="rgba(148,163,184,0.5)"
                        secureTextEntry={!showApiKey}
                        style={{
                          backgroundColor: "rgba(15,23,42,0.7)",
                          borderWidth: 1,
                          borderColor: "rgba(148,163,184,0.3)",
                          borderRadius: 10,
                          padding: 10,
                          color: "#e5e7eb",
                          fontFamily:
                            Platform.OS === "web" ? "monospace" : undefined,
                        }}
                      />
                    </View>

                    <View>
                      <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                        API Endpoint:
                      </Text>
                      <TextInput
                        value={config.voice.endpoint}
                        onChangeText={(text) => updateVoice({ endpoint: text })}
                        placeholder="https://..."
                        placeholderTextColor="rgba(148,163,184,0.5)"
                        style={{
                          backgroundColor: "rgba(15,23,42,0.7)",
                          borderWidth: 1,
                          borderColor: "rgba(148,163,184,0.3)",
                          borderRadius: 10,
                          padding: 10,
                          color: "#e5e7eb",
                          fontFamily:
                            Platform.OS === "web" ? "monospace" : undefined,
                        }}
                      />
                    </View>
                  </>
                )}

              {/* Language Selection */}
              <View>
                <Text style={{ color: "#e5e7eb", marginBottom: 8 }}>
                  Language:
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { code: "en-US", label: "English (US)" },
                    { code: "en-GB", label: "English (UK)" },
                    { code: "es-ES", label: "Spanish" },
                    { code: "fr-FR", label: "French" },
                    { code: "de-DE", label: "German" },
                    { code: "ja-JP", label: "Japanese" },
                    { code: "zh-CN", label: "Chinese" },
                  ].map((lang) => (
                    <Pressable
                      key={lang.code}
                      onPress={() => updateVoice({ language: lang.code })}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor:
                          config.voice.language === lang.code
                            ? "rgba(34,211,238,0.85)"
                            : "rgba(148,163,184,0.35)",
                        backgroundColor:
                          config.voice.language === lang.code
                            ? "rgba(2,132,199,0.22)"
                            : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            config.voice.language === lang.code
                              ? "#22d3ee"
                              : "#e5e7eb",
                          fontWeight: "700",
                          fontSize: 11,
                        }}
                      >
                        {lang.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                onPress={() => testConnection("voice")}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.7)",
                  backgroundColor: "rgba(34,211,238,0.1)",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                  Test Voice Input
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 16,
            right: 16,
          }}
        >
          <Text style={{ color: "#a3e635", fontSize: 12 }}>
            Powered by Nirvana
          </Text>
          <Text style={{ color: "#93c5fd", fontSize: 10, marginTop: 4 }}>
            🔒 API keys stored locally via AsyncStorage. Never sent to Fabric servers.
          </Text>
          <Text style={{ color: "#93c5fd", fontSize: 10, marginTop: 2 }}>
            On web: localStorage. On mobile: secure app storage.
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// Export config getter for other components to use
export async function getAIConfig(): Promise<AIServiceConfig> {
  return getJSON<AIServiceConfig>(STORAGE_KEY, defaultConfig);
}
