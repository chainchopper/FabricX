/**
 * LLMService - Language Model integration
 * Supports OpenAI, Anthropic, and custom endpoints
 * Powered by Nirvana
 */

export interface LLMConfig {
  provider: "openai" | "anthropic" | "custom" | "none";
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  timestamp: number;
}

export interface LLMStreamChunk {
  text: string;
  done: boolean;
}

export type LLMStreamCallback = (chunk: LLMStreamChunk) => void;

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Send a chat completion request
   */
  async chat(messages: LLMMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    onStream?: LLMStreamCallback;
  }): Promise<LLMResponse> {
    if (this.config.provider === "none") {
      throw new Error("LLM service is disabled");
    }

    if (!this.config.apiKey) {
      throw new Error("API key is required");
    }

    if (this.config.provider === "openai") {
      return this.chatOpenAI(messages, options);
    } else if (this.config.provider === "anthropic") {
      return this.chatAnthropic(messages, options);
    } else if (this.config.provider === "custom") {
      return this.chatCustom(messages, options);
    }

    throw new Error(`Unsupported provider: ${this.config.provider}`);
  }

  /**
   * OpenAI chat completion
   */
  private async chatOpenAI(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      onStream?: LLMStreamCallback;
    }
  ): Promise<LLMResponse> {
    const endpoint = `${this.config.endpoint}/chat/completions`;

    const requestBody = {
      model: this.config.model || "gpt-4",
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
      stream: options?.stream ?? false,
    };

    console.log("[LLM] Sending request to OpenAI:", {
      endpoint,
      model: requestBody.model,
      messageCount: messages.length,
    });

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
      console.error("[LLM] OpenAI error:", error);
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    if (options?.stream && options?.onStream) {
      return this.handleOpenAIStream(response, options.onStream);
    }

    const data = await response.json();

    return {
      text: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: data.model,
      timestamp: Date.now(),
    };
  }

  /**
   * Handle OpenAI streaming response
   */
  private async handleOpenAIStream(
    response: Response,
    onStream: LLMStreamCallback
  ): Promise<LLMResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "" || line.trim() === "data: [DONE]") continue;
          if (!line.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(line.slice(6));
            const content = json.choices[0]?.delta?.content || "";
            if (content) {
              fullText += content;
              onStream({ text: content, done: false });
            }
          } catch (err) {
            console.warn("[LLM] Failed to parse SSE line:", {
              line,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      }

      onStream({ text: "", done: true });

      return {
        text: fullText,
        model: this.config.model,
        timestamp: Date.now(),
      };
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Anthropic chat completion
   */
  private async chatAnthropic(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResponse> {
    const endpoint = `${this.config.endpoint}/v1/messages`;

    // Anthropic uses a different message format
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const requestBody = {
      model: this.config.model || "claude-3-opus-20240229",
      messages: conversationMessages,
      system: systemMessage?.content,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    };

    console.log("[LLM] Sending request to Anthropic:", {
      endpoint,
      model: requestBody.model,
      messageCount: conversationMessages.length,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[LLM] Anthropic error:", error);
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      text: data.content[0]?.text || "",
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens:
          (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      model: data.model,
      timestamp: Date.now(),
    };
  }

  /**
   * Custom endpoint chat completion
   */
  private async chatCustom(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<LLMResponse> {
    // Assume OpenAI-compatible format for custom endpoints
    const endpoint = `${this.config.endpoint}/chat/completions`;

    const requestBody = {
      model: this.config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    };

    console.log("[LLM] Sending request to custom endpoint:", {
      endpoint,
      model: requestBody.model,
    });

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
      console.error("[LLM] Custom endpoint error:", error);
      throw new Error(`Custom API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      text: data.choices[0]?.message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: data.model || this.config.model,
      timestamp: Date.now(),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chat([
        { role: "user", content: "Say 'Hello' if you can hear me." },
      ], { maxTokens: 10 });

      return response.text.length > 0;
    } catch (err) {
      console.error("[LLM] Connection test failed:", err);
      return false;
    }
  }
}

// Singleton instance
let llmService: LLMService | null = null;

export function getLLMService(config?: LLMConfig): LLMService {
  if (!llmService && config) {
    llmService = new LLMService(config);
  } else if (!llmService) {
    throw new Error("LLM service not initialized. Provide config first.");
  }
  return llmService;
}

export function resetLLMService(): void {
  llmService = null;
}
