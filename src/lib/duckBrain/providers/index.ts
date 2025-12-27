export * from "./types";
export { OpenAIProvider } from "./openai.provider";
export { AnthropicProvider } from "./anthropic.provider";

import type { AIProvider, AIProviderType, ProviderConfig } from "./types";
import { OpenAIProvider } from "./openai.provider";
import { AnthropicProvider } from "./anthropic.provider";

/**
 * Factory function to create AI provider instances
 */
export function createProvider(type: AIProviderType): AIProvider {
  switch (type) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "webllm":
      // WebLLM uses the existing service, not this factory
      throw new Error("WebLLM should use the existing duckBrainService");
    case "gemini":
      throw new Error("Gemini provider not yet implemented");
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Test provider connection with given config
 */
export async function testProviderConnection(
  type: AIProviderType,
  config: ProviderConfig
): Promise<{ success: boolean; error?: string }> {
  if (type === "webllm") {
    return { success: true }; // WebLLM doesn't need API key testing
  }

  try {
    const provider = createProvider(type);
    await provider.initialize(config);
    await provider.cleanup();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
