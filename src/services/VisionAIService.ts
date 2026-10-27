/**
 * VisionAIService - Image analysis and vision AI
 *
 * One model router (UI doctrine 9): every analysis call is served by
 * the model the user configured in AI Services (fabric_ai_config_v1) —
 * the on-device default or the cloud endpoint they selected — through
 * the standard OpenAI-compatible chat-completions shape. The legacy
 * "google" provider value survives only as a saved-config alias: it
 * used to hardcode a Google Vision REST call (images:annotate with the
 * key in the URL) and now routes through the configured model like
 * every other provider value. See analyzeWithGoogle below.
 *
 * Powered by Nirvana
 */

// Test image: 1x1 red pixel PNG (base64)
const TEST_IMAGE_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

export interface VisionConfig {
  provider: "openai" | "google" | "custom" | "none";
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface VisionAnalysisResult {
  description: string;
  labels?: string[];
  objects?: Array<{
    name: string;
    confidence: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  text?: string; // OCR result if available
  faces?: Array<{
    confidence: number;
    emotions?: Record<string, number>;
  }>;
  colors?: Array<{
    color: string;
    percentage: number;
  }>;
  safetyLabels?: Array<{
    label: string;
    confidence: number;
  }>;
  timestamp: number;
}

export class VisionAIService {
  private config: VisionConfig;

  constructor(config: VisionConfig) {
    this.config = config;
  }

  /**
   * Analyze an image
   */
  async analyzeImage(
    image: string | Blob,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    if (this.config.provider === "none") {
      throw new Error("Vision AI service is disabled");
    }

    if (!this.config.apiKey) {
      throw new Error("API key is required");
    }

    if (this.config.provider === "openai") {
      return this.analyzeWithOpenAI(image, prompt);
    } else if (this.config.provider === "google") {
      return this.analyzeWithGoogle(image, prompt);
    } else if (this.config.provider === "custom") {
      return this.analyzeWithCustom(image, prompt);
    }

    throw new Error(`Unsupported provider: ${this.config.provider}`);
  }

  /**
   * OpenAI Vision analysis
   */
  private async analyzeWithOpenAI(
    image: string | Blob,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    const endpoint = `${this.config.endpoint}/chat/completions`;

    // Convert blob to base64 if needed
    let imageUrl: string;
    if (image instanceof Blob) {
      imageUrl = await this.blobToBase64(image);
    } else if (image.startsWith("data:")) {
      imageUrl = image;
    } else if (image.startsWith("http")) {
      imageUrl = image;
    } else {
      imageUrl = `data:image/jpeg;base64,${image}`;
    }

    const requestBody = {
      model: this.config.model || "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt || "Describe this image in detail.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    };

    console.log("[Vision] Sending request to OpenAI Vision");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Vision] OpenAI Vision error:", error);
      throw new Error(`OpenAI Vision API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const description = data.choices[0]?.message?.content || "";

    return {
      description,
      timestamp: Date.now(),
    };
  }

  /**
   * Legacy "google" provider — REROUTED (UI doctrine 9, one model
   * router). This used to POST a hardcoded Google Vision REST request
   * (`{endpoint}/images:annotate?key=...`) and parse Google's
   * label/object/face annotation schema. That wire format is gone:
   * the call is now served by the configured model (the vision
   * section of fabric_ai_config_v1 — endpoint, model, key the user
   * chose) through the same OpenAI-compatible chat-completions path
   * as every other provider. If a user wants a Google-hosted model,
   * they point the configured endpoint at it; the app hardcodes no
   * provider. Structured Google-only extras (labels/objects/faces/
   * colors arrays) are not synthesized by this path — callers get the
   * model's description (and any text it reads) instead.
   */
  private async analyzeWithGoogle(
    image: string | Blob,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    return this.analyzeWithOpenAI(image, prompt);
  }

  /**
   * Custom endpoint analysis
   */
  private async analyzeWithCustom(
    image: string | Blob,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    // Assume OpenAI-compatible format
    return this.analyzeWithOpenAI(image, prompt);
  }

  /**
   * Convert Blob to base64 data URL
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VisionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.analyzeImage(TEST_IMAGE_BASE64, "Test");
      return result.description.length > 0;
    } catch (err) {
      console.error("[Vision] Connection test failed:", err);
      return false;
    }
  }
}

// Singleton instance
let visionService: VisionAIService | null = null;

export function getVisionAIService(config?: VisionConfig): VisionAIService {
  if (!visionService && config) {
    visionService = new VisionAIService(config);
  } else if (!visionService) {
    throw new Error("Vision AI service not initialized. Provide config first.");
  }
  return visionService;
}

export function resetVisionAIService(): void {
  visionService = null;
}
