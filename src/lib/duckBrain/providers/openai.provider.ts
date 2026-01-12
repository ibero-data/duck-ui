import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type {
  AIProvider,
  ProviderConfig,
  StreamCallbacks,
  GenerationOptions,
  ProviderStatus,
} from "./types";

/**
 * OpenAI API Provider
 * Uses fetch for API calls - no SDK dependency
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  private apiKey: string = "";
  private modelId: string = "gpt-4o-mini";
  private baseUrl: string = "https://api.openai.com/v1";
  private abortController: AbortController | null = null;
  private ready: boolean = false;
  private initializing: boolean = false;
  private error: string | undefined;

  async initialize(config: ProviderConfig): Promise<void> {
    this.initializing = true;
    this.error = undefined;

    const isCustomEndpoint = config.baseUrl && config.baseUrl !== "https://api.openai.com/v1";

    try {
      // API key is required for OpenAI, optional for custom endpoints (e.g., Ollama)
      if (!config.apiKey && !isCustomEndpoint) {
        throw new Error("OpenAI API key is required");
      }

      this.apiKey = config.apiKey || "";
      this.modelId = config.modelId || (isCustomEndpoint ? "llama3.2" : "gpt-4o-mini");
      this.baseUrl = config.baseUrl || "https://api.openai.com/v1";

      // Test the connection
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      if (isCustomEndpoint) {
        // For custom endpoints, test with a minimal chat completion request
        // since /v1/models may not exist on all compatible APIs
        const testResponse = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: this.modelId,
            messages: [{ role: "user", content: "test" }],
            max_tokens: 1,
          }),
        });

        if (!testResponse.ok) {
          const error = await testResponse.json().catch(() => ({}));
          throw new Error(error.error?.message || `Connection failed: ${testResponse.status}`);
        }
      } else {
        // For OpenAI, use the models endpoint
        const response = await fetch(`${this.baseUrl}/models`, { headers });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error?.message || `API error: ${response.status}`);
        }
      }

      this.ready = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to initialize OpenAI";
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
      throw new Error("OpenAI provider not initialized");
    }

    this.abortController = new AbortController();
    let fullText = "";

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.modelId,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          max_tokens: options?.maxTokens || 2048,
          temperature: options?.temperature || 0.7,
          stop: options?.stopSequences,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                callbacks.onToken?.(content);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      callbacks.onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        callbacks.onComplete?.(fullText || "");
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
      throw new Error("OpenAI provider not initialized");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.7,
        stop: options?.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
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
