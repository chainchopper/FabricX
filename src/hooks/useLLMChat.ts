/**
 * useLLMChat - React hook for LLM conversations
 * Powered by Nirvana
 */

import { useState, useCallback, useRef } from "react";
import { getLLMService, LLMMessage, LLMResponse } from "../services/LLMService";
import { getAIConfig } from "../../app/components/neo/AISettingsDrawer";

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export function useLLMChat(systemPrompt?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const serviceInitialized = useRef(false);

  // Initialize LLM service
  const initialize = useCallback(async () => {
    if (serviceInitialized.current) return true;

    try {
      const config = await getAIConfig();
      if (!config.llm.enabled || config.llm.provider === "none") {
        setError("LLM service is not enabled. Configure it in AI Settings.");
        return false;
      }

      setIsInitialized(true);
      serviceInitialized.current = true;
      return true;
    } catch (err) {
      setError(`Failed to initialize: ${err}`);
      return false;
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(
    async (content: string, options?: { temperature?: number; maxTokens?: number }) => {
      if (!serviceInitialized.current) {
        const initialized = await initialize();
        if (!initialized) return;
      }

      setIsLoading(true);
      setError(null);

      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        const config = await getAIConfig();
        const llmService = getLLMService(config.llm);

        // Build message history
        const llmMessages: LLMMessage[] = [];

        // Add system prompt if provided
        if (systemPrompt) {
          llmMessages.push({
            role: "system",
            content: systemPrompt,
          });
        }

        // Add conversation history
        messages.forEach((msg) => {
          llmMessages.push({
            role: msg.role,
            content: msg.content,
          });
        });

        // Add new user message
        llmMessages.push({
          role: "user",
          content,
        });

        // Add placeholder for streaming response
        const assistantMessageId = `assistant-${Date.now()}`;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          isStreaming: true,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Send request with streaming
        const response = await llmService.chat(llmMessages, {
          temperature: options?.temperature ?? 0.7,
          maxTokens: options?.maxTokens ?? 2000,
          stream: true,
          onStream: (chunk) => {
            if (!chunk.done) {
              // Update streaming message
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: msg.content + chunk.text }
                    : msg
                )
              );
            } else {
              // Mark as complete
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, isStreaming: false }
                    : msg
                )
              );
            }
          },
        });

        setIsLoading(false);
      } catch (err) {
        setError(`Chat error: ${err}`);
        setIsLoading(false);

        // Remove failed assistant message
        setMessages((prev) => prev.slice(0, -1));
      }
    },
    [messages, systemPrompt, initialize]
  );

  // Clear conversation
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Regenerate last response
  const regenerateLastResponse = useCallback(async () => {
    if (messages.length < 2) return;

    // Find last user message
    const lastUserMessageIndex = messages
      .slice()
      .reverse()
      .findIndex((msg) => msg.role === "user");

    if (lastUserMessageIndex === -1) return;

    const actualIndex = messages.length - 1 - lastUserMessageIndex;
    const lastUserMessage = messages[actualIndex];

    // Remove messages after last user message
    setMessages((prev) => prev.slice(0, actualIndex + 1));

    // Resend the message
    await sendMessage(lastUserMessage.content);
  }, [messages, sendMessage]);

  return {
    messages,
    isLoading,
    error,
    isInitialized,
    sendMessage,
    clearMessages,
    regenerateLastResponse,
    initialize,
  };
}
