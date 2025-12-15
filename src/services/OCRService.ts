/**
 * OCRService - Optical Character Recognition
 * Supports Tesseract.js (local), Google Vision, and custom endpoints
 * Powered by Nirvana
 */

import { createWorker, Worker } from 'tesseract.js';

export interface OCRConfig {
  provider: "tesseract" | "google" | "custom" | "none";
  apiKey?: string;
  endpoint?: string;
  language?: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  words?: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
  lines?: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
  blocks?: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
  timestamp: number;
}

export class OCRService {
  private config: OCRConfig;
  private tesseractWorker: Worker | null = null;
  private isInitialized = false;

  constructor(config: OCRConfig) {
    this.config = config;
  }

  /**
   * Initialize OCR service
   */
  async initialize(): Promise<void> {
    if (this.config.provider === "none") {
      throw new Error("OCR service is disabled");
    }

    if (this.config.provider === "tesseract") {
      return this.initializeTesseract();
    } else if (this.config.provider === "google") {
      // No initialization needed for API-based services
      if (!this.config.apiKey) {
        throw new Error("Google Vision API key is required");
      }
      this.isInitialized = true;
    } else if (this.config.provider === "custom") {
      if (!this.config.endpoint) {
        throw new Error("Custom endpoint is required");
      }
      this.isInitialized = true;
    }
  }

  /**
   * Initialize Tesseract.js worker
   */
  private async initializeTesseract(): Promise<void> {
    if (this.tesseractWorker) {
      return; // Already initialized
    }

    console.log("[OCR] Initializing Tesseract.js worker...");
    
    try {
      this.tesseractWorker = await createWorker({
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        logger: (m) => {
          if (m.status === 'loading language') {
            console.log(`[OCR] Loading language: ${m.progress * 100}%`);
          }
        },
      });

      const language = this.config.language || 'eng';
      await this.tesseractWorker.loadLanguage(language);
      await this.tesseractWorker.initialize(language);
      
      this.isInitialized = true;
      console.log("[OCR] Tesseract.js initialized successfully");
    } catch (err) {
      console.error("[OCR] Failed to initialize Tesseract:", err);
      throw new Error(`Failed to initialize Tesseract: ${err}`);
    }
  }

  /**
   * Extract text from image
   */
  async extractText(image: string | Blob | HTMLImageElement): Promise<OCRResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.config.provider === "tesseract") {
      return this.extractWithTesseract(image);
    } else if (this.config.provider === "google") {
      return this.extractWithGoogle(image);
    } else if (this.config.provider === "custom") {
      return this.extractWithCustom(image);
    }

    throw new Error(`Unsupported provider: ${this.config.provider}`);
  }

  /**
   * Extract text using Tesseract.js
   */
  private async extractWithTesseract(
    image: string | Blob | HTMLImageElement
  ): Promise<OCRResult> {
    if (!this.tesseractWorker) {
      throw new Error("Tesseract worker not initialized");
    }

    console.log("[OCR] Processing image with Tesseract...");

    try {
      const result = await this.tesseractWorker.recognize(image);
      
      // Extract words with bounding boxes
      const words = result.data.words.map((word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        },
      }));

      // Extract lines
      const lines = result.data.lines.map((line) => ({
        text: line.text,
        confidence: line.confidence,
        bbox: {
          x: line.bbox.x0,
          y: line.bbox.y0,
          width: line.bbox.x1 - line.bbox.x0,
          height: line.bbox.y1 - line.bbox.y0,
        },
      }));

      // Extract blocks
      const blocks = result.data.blocks.map((block) => ({
        text: block.text,
        confidence: block.confidence,
        bbox: {
          x: block.bbox.x0,
          y: block.bbox.y0,
          width: block.bbox.x1 - block.bbox.x0,
          height: block.bbox.y1 - block.bbox.y0,
        },
      }));

      console.log(`[OCR] Extracted text: ${result.data.text.substring(0, 100)}...`);

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        words,
        lines,
        blocks,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error("[OCR] Tesseract extraction failed:", err);
      throw new Error(`OCR extraction failed: ${err}`);
    }
  }

  /**
   * Extract text using Google Vision API
   */
  private async extractWithGoogle(
    image: string | Blob | HTMLImageElement
  ): Promise<OCRResult> {
    if (!this.config.apiKey) {
      throw new Error("Google Vision API key is required");
    }

    // Convert to base64 if needed
    let base64Image: string;
    if (typeof image === "string") {
      if (image.startsWith("data:")) {
        base64Image = image.split(",")[1];
      } else {
        base64Image = image;
      }
    } else if (image instanceof Blob) {
      const dataUrl = await this.blobToBase64(image);
      base64Image = dataUrl.split(",")[1];
    } else {
      throw new Error("Unsupported image type for Google Vision");
    }

    const endpoint = this.config.endpoint || "https://vision.googleapis.com/v1";
    const url = `${endpoint}/images:annotate?key=${this.config.apiKey}`;

    const requestBody = {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    };

    console.log("[OCR] Sending request to Google Vision...");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google Vision API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const textAnnotations = data.responses[0]?.textAnnotations || [];

      if (textAnnotations.length === 0) {
        return {
          text: "",
          confidence: 0,
          timestamp: Date.now(),
        };
      }

      // First annotation is the full text
      const fullText = textAnnotations[0].description;
      
      // Remaining annotations are individual words/blocks
      const words = textAnnotations.slice(1).map((annotation: any) => ({
        text: annotation.description,
        confidence: 1.0, // Google doesn't provide word-level confidence
        bbox: {
          x: annotation.boundingPoly.vertices[0].x || 0,
          y: annotation.boundingPoly.vertices[0].y || 0,
          width: (annotation.boundingPoly.vertices[2].x || 0) - (annotation.boundingPoly.vertices[0].x || 0),
          height: (annotation.boundingPoly.vertices[2].y || 0) - (annotation.boundingPoly.vertices[0].y || 0),
        },
      }));

      console.log(`[OCR] Google Vision extracted: ${fullText.substring(0, 100)}...`);

      return {
        text: fullText,
        confidence: 1.0,
        words,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error("[OCR] Google Vision extraction failed:", err);
      throw new Error(`OCR extraction failed: ${err}`);
    }
  }

  /**
   * Extract text using custom endpoint
   * TODO: Implement actual custom endpoint support with configurable request format
   * For now, assumes Google Vision-compatible API format
   */
  private async extractWithCustom(
    image: string | Blob | HTMLImageElement
  ): Promise<OCRResult> {
    if (!this.config.endpoint) {
      throw new Error("Custom endpoint URL is required");
    }
    
    // For now, use Google Vision-compatible format
    // In the future, this could support custom request/response formats
    return this.extractWithGoogle(image);
  }

  /**
   * Convert Blob to base64
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
  updateConfig(config: Partial<OCRConfig>): void {
    this.config = { ...this.config, ...config };
    this.isInitialized = false; // Force re-initialization
  }

  /**
   * Test OCR service
   */
  async testConnection(): Promise<boolean> {
    try {
      // Create a simple test image with text
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = 'black';
      ctx.font = '24px Arial';
      ctx.fillText('Test OCR', 10, 35);

      const testImage = canvas.toDataURL('image/png');
      const result = await this.extractText(testImage);
      
      // Check if we got any text back
      return result.text.length > 0;
    } catch (err) {
      console.error("[OCR] Connection test failed:", err);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
    this.isInitialized = false;
  }
}

// Singleton instance
let ocrService: OCRService | null = null;

export function getOCRService(config?: OCRConfig): OCRService {
  if (!ocrService && config) {
    ocrService = new OCRService(config);
  } else if (!ocrService) {
    throw new Error("OCR service not initialized. Provide config first.");
  }
  return ocrService;
}

export function resetOCRService(): void {
  if (ocrService) {
    ocrService.destroy();
    ocrService = null;
  }
}
