import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type {
  AIProvider,
  ProviderConfig,
  StreamCallbacks,
  GenerationOptions,
  ProviderStatus,
} from "./types";

/**
 * Chrome Built-in AI Provider (Gemini Nano via the Prompt API).
 *
 * Runs entirely on-device through the browser's `LanguageModel` global — no API
 * key, no server, no model download from us (Chrome manages the Gemini Nano
 * weights). Available in Chrome 138+ with built-in AI enabled.
 *
 * Docs: https://developer.chrome.com/docs/ai/prompt-api
 */

//
// Ambient types for the Prompt API (not yet in lib.dom.d.ts).
//
interface LanguageModelPromptRole {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
}

interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelPromptRole[];
  signal?: AbortSignal;
  monitor?: (m: EventTarget) => void;
}

interface LanguageModelGlobal {
  availability(): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelGlobal | undefined;
}

function getLanguageModel(): LanguageModelGlobal {
  const lm = (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
  if (!lm) {
    throw new Error(
      "Chrome Built-in AI is not available. Use Chrome 138+ on desktop and enable built-in AI " +
        "(chrome://flags/#prompt-api-for-gemini-nano), then restart the browser."
    );
  }
  return lm;
}

function toPromptRole(message: ChatCompletionMessageParam): LanguageModelPromptRole {
  const role =
    message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user";
  const content =
    typeof message.content === "string" ? message.content : String(message.content ?? "");
  return { role, content };
}

export class ChromeAIProvider implements AIProvider {
  readonly name = "chrome-ai" as const;

  private session: LanguageModelSession | null = null;
  private abortController: AbortController | null = null;
  private ready = false;
  private initializing = false;
  private error: string | undefined;

  async initialize(_config: ProviderConfig): Promise<void> {
    this.initializing = true;
    this.error = undefined;
    try {
      const lm = getLanguageModel();
      const availability = await lm.availability();
      if (availability === "unavailable") {
        throw new Error(
          "Chrome Built-in AI (Gemini Nano) is unavailable on this device. It needs Chrome 138+ " +
            "on desktop with sufficient storage and the built-in AI flag enabled."
        );
      }
      // "downloadable" / "downloading" are fine — create() triggers/awaits the download.
      this.ready = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to initialize Chrome AI";
      this.ready = false;
      throw err;
    } finally {
      this.initializing = false;
    }
  }

  private async createSession(
    messages: ChatCompletionMessageParam[],
    signal: AbortSignal
  ): Promise<{ session: LanguageModelSession; lastUserPrompt: string }> {
    const lm = getLanguageModel();
    const prompts = messages.map(toPromptRole);

    // The final user turn is sent via prompt(); everything before it seeds context.
    let lastUserPrompt = "";
    const initialPrompts = [...prompts];
    for (let i = initialPrompts.length - 1; i >= 0; i--) {
      if (initialPrompts[i].role === "user") {
        lastUserPrompt = initialPrompts[i].content;
        initialPrompts.splice(i, 1);
        break;
      }
    }

    const session = await lm.create({
      initialPrompts: initialPrompts.length > 0 ? initialPrompts : undefined,
      signal,
    });
    return { session, lastUserPrompt };
  }

  async generateStreaming(
    messages: ChatCompletionMessageParam[],
    callbacks: StreamCallbacks,
    _options?: GenerationOptions
  ): Promise<void> {
    if (!this.ready) {
      throw new Error("Chrome AI provider not initialized");
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const { session, lastUserPrompt } = await this.createSession(messages, signal);
      this.session = session;

      let emitted = "";
      const stream = session.promptStreaming(lastUserPrompt, { signal });
      for await (const chunk of stream) {
        // Chrome yields cumulative text; older/other builds may yield deltas.
        // Detect which and emit only the new portion.
        let delta: string;
        if (chunk.startsWith(emitted)) {
          delta = chunk.slice(emitted.length);
          emitted = chunk;
        } else {
          delta = chunk;
          emitted += chunk;
        }
        if (delta) callbacks.onToken?.(delta);
      }

      callbacks.onComplete?.(emitted);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const error = err instanceof Error ? err : new Error("Generation failed");
      callbacks.onError?.(error);
      throw error;
    } finally {
      this.session?.destroy();
      this.session = null;
      this.abortController = null;
    }
  }

  async generateText(
    messages: ChatCompletionMessageParam[],
    _options?: GenerationOptions
  ): Promise<string> {
    if (!this.ready) {
      throw new Error("Chrome AI provider not initialized");
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    try {
      const { session, lastUserPrompt } = await this.createSession(messages, signal);
      this.session = session;
      return await session.prompt(lastUserPrompt, { signal });
    } finally {
      this.session?.destroy();
      this.session = null;
      this.abortController = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.session?.destroy();
    this.session = null;
  }

  async cleanup(): Promise<void> {
    this.abort();
    this.ready = false;
  }

  getStatus(): ProviderStatus {
    return {
      ready: this.ready,
      initializing: this.initializing,
      error: this.error,
      currentModel: "Gemini Nano",
    };
  }

  isReady(): boolean {
    return this.ready;
  }
}

/** True if the browser exposes the built-in Prompt API at all. */
export function isChromeAISupported(): boolean {
  return typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== "undefined";
}
