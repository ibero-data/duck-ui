import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type {
  AIProvider,
  ProviderConfig,
  StreamCallbacks,
  GenerationOptions,
  ProviderStatus,
} from "./types";

/**
 * Anthropic (Claude) API Provider
 * Uses fetch for API calls - no SDK dependency
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;

  private apiKey: string = "";
  private modelId: string = "claude-sonnet-4-20250514";
  private abortController: AbortController | null = null;
  private ready: boolean = false;
  private initializing: boolean = false;
  private error: string | undefined;

  async initialize(config: ProviderConfig): Promise<void> {
    this.initializing = true;
    this.error = undefined;

    try {
      if (!config.apiKey) {
        throw new Error("Anthropic API key is required");
      }

      this.apiKey = config.apiKey;
      this.modelId = config.modelId || "claude-sonnet-4-20250514";

      // Note: Anthropic doesn't have a simple "list models" endpoint
      // We'll validate on first request instead
      this.ready = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to initialize Anthropic";
      this.ready = false;
      throw err;
    } finally {
      this.initializing = false;
    }
  }

  async generateStreaming(
    messages: ChatCompletionMessageParam[],
    callbacks: StreamCallbacks,
    options?: GenerationOptions
  ): Promise<void> {
    if (!this.ready) {
      throw new Error("Anthropic provider not initialized");
    }

    this.abortController = new AbortController();

    // Convert messages to Anthropic format
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.modelId,
          max_tokens: options?.maxTokens || 2048,
          system: systemMessage?.content || undefined,
          messages: nonSystemMessages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
          stream: true,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            try {
              const parsed = JSON.parse(data);

              // Handle different event types
              if (parsed.type === "content_block_delta") {
                const content = parsed.delta?.text;
                if (content) {
                  fullText += content;
                  callbacks.onToken?.(content);
                }
              } else if (parsed.type === "message_stop") {
                // Message complete
              } else if (parsed.type === "error") {
                throw new Error(parsed.error?.message || "Unknown error");
              }
            } catch (parseErr) {
              // Ignore parse errors for incomplete chunks
              if (parseErr instanceof Error && parseErr.message !== "Unknown error") {
                // Only throw if it's an actual error from the API
              }
            }
          }
        }
      }

      callbacks.onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const error = err instanceof Error ? err : new Error("Generation failed");
      callbacks.onError?.(error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  async generateText(
    messages: ChatCompletionMessageParam[],
    options?: GenerationOptions
  ): Promise<string> {
    if (!this.ready) {
      throw new Error("Anthropic provider not initialized");
    }

    // Convert messages to Anthropic format
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.modelId,
        max_tokens: options?.maxTokens || 2048,
        system: systemMessage?.content || undefined,
        messages: nonSystemMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || "";
  }

  abort(): void {
    this.abortController?.abort();
  }

  async cleanup(): Promise<void> {
    this.abort();
    this.ready = false;
    this.apiKey = "";
  }

  getStatus(): ProviderStatus {
    return {
      ready: this.ready,
      initializing: this.initializing,
      error: this.error,
      currentModel: this.modelId,
    };
  }

  isReady(): boolean {
    return this.ready;
  }
}
