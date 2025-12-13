/**
 * VisionAIService - Image analysis and vision AI
 * Supports OpenAI Vision, Google Vision, and custom endpoints
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
   * Google Vision analysis
   */
  private async analyzeWithGoogle(
    image: string | Blob,
    prompt?: string
  ): Promise<VisionAnalysisResult> {
    const endpoint = `${this.config.endpoint}/images:annotate`;

    // Convert to base64 if needed
    let base64Image: string;
    if (image instanceof Blob) {
      const base64 = await this.blobToBase64(image);
      base64Image = base64.split(",")[1]; // Remove data URL prefix
    } else if (image.startsWith("data:")) {
      base64Image = image.split(",")[1];
    } else {
      base64Image = image;
    }

    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image,
          },
          features: [
            { type: "LABEL_DETECTION", maxResults: 10 },
            { type: "OBJECT_LOCALIZATION", maxResults: 10 },
            { type: "TEXT_DETECTION" },
            { type: "FACE_DETECTION", maxResults: 10 },
            { type: "IMAGE_PROPERTIES" },
            { type: "SAFE_SEARCH_DETECTION" },
          ],
        },
      ],
    };

    console.log("[Vision] Sending request to Google Vision");

    const response = await fetch(`${endpoint}?key=${this.config.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Vision] Google Vision error:", error);
      throw new Error(`Google Vision API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const result = data.responses[0];

    // Parse labels
    const labels =
      result.labelAnnotations?.map((l: any) => l.description) || [];

    // Parse objects
    const objects =
      result.localizedObjectAnnotations?.map((obj: any) => ({
        name: obj.name,
        confidence: obj.score,
        boundingBox: obj.boundingPoly
          ? {
              x: obj.boundingPoly.normalizedVertices[0].x,
              y: obj.boundingPoly.normalizedVertices[0].y,
              width:
                obj.boundingPoly.normalizedVertices[2].x -
                obj.boundingPoly.normalizedVertices[0].x,
              height:
                obj.boundingPoly.normalizedVertices[2].y -
                obj.boundingPoly.normalizedVertices[0].y,
            }
          : undefined,
      })) || [];

    // Parse text
    const text = result.textAnnotations?.[0]?.description || undefined;

    // Parse faces
    const faces =
      result.faceAnnotations?.map((face: any) => ({
        confidence: face.detectionConfidence,
        emotions: {
          joy: face.joyLikelihood,
          sorrow: face.sorrowLikelihood,
          anger: face.angerLikelihood,
          surprise: face.surpriseLikelihood,
        },
      })) || [];

    // Parse dominant colors
    const colors =
      result.imagePropertiesAnnotation?.dominantColors?.colors?.map(
        (c: any) => ({
          color: `rgb(${c.color.red}, ${c.color.green}, ${c.color.blue})`,
          percentage: c.pixelFraction * 100,
        })
      ) || [];

    // Generate description
    const description = this.generateDescriptionFromLabels(labels, objects);

    return {
      description,
      labels,
      objects,
      text,
      faces,
      colors,
      timestamp: Date.now(),
    };
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
   * Generate a description from labels and objects
   */
  private generateDescriptionFromLabels(
    labels: string[],
    objects: Array<{ name: string; confidence: number }>
  ): string {
    if (objects.length > 0) {
      const topObjects = objects
        .slice(0, 3)
        .map((o) => o.name)
        .join(", ");
      return `The image contains ${topObjects}. Key features include: ${labels
        .slice(0, 5)
        .join(", ")}.`;
    }

    if (labels.length > 0) {
      return `The image shows: ${labels.slice(0, 5).join(", ")}.`;
    }

    return "Image analysis completed.";
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
