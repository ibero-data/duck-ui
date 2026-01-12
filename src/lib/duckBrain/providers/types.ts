import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";

export type AIProviderType = "webllm" | "openai" | "anthropic" | "gemini" | "openai-compatible";

export interface ProviderConfig {
  apiKey?: string;
  modelId?: string;
  baseUrl?: string; // For OpenAI-compatible APIs
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface ProviderStatus {
  ready: boolean;
  initializing: boolean;
  error?: string;
  currentModel?: string;
}

/**
 * Abstract interface for AI providers
 * All providers (WebLLM, OpenAI, Claude, etc.) implement this
 */
export interface AIProvider {
  readonly name: AIProviderType;

  /**
   * Initialize the provider with config
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Generate text with streaming support
   */
  generateStreaming(
    messages: ChatCompletionMessageParam[],
    callbacks: StreamCallbacks,
    options?: GenerationOptions
  ): Promise<void>;

  /**
   * Generate text without streaming (returns full response)
   */
  generateText(
    messages: ChatCompletionMessageParam[],
    options?: GenerationOptions
  ): Promise<string>;

  /**
   * Abort any ongoing generation
   */
  abort(): void;

  /**
   * Clean up resources
   */
  cleanup(): Promise<void>;

  /**
   * Get current status
   */
  getStatus(): ProviderStatus;

  /**
   * Check if provider is ready
   */
  isReady(): boolean;
}

/**
 * Available models for each provider
 */
export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
}

export const OPENAI_MODELS: ModelOption[] = [
  { id: "gpt-4o", name: "GPT-4o", description: "Most capable, best for complex tasks", contextLength: 128000 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and affordable", contextLength: 128000 },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "GPT-4 with vision", contextLength: 128000 },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Fast, good for simple tasks", contextLength: 16385 },
];

export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", description: "Best balance of speed and capability", contextLength: 200000 },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Fast and capable", contextLength: 200000 },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Fastest, most affordable", contextLength: 200000 },
];

export const GEMINI_MODELS: ModelOption[] = [
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Most capable Gemini model", contextLength: 1000000 },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Fast and efficient", contextLength: 1000000 },
];
