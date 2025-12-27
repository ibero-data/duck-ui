// Model configurations for Duck Brain
export interface ModelConfig {
  id: string;
  displayName: string;
  size: string;
  description: string;
  contextLength: number;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    displayName: "Phi-3.5 Mini",
    size: "~2.3GB",
    description: "Best balance of quality and performance for SQL generation",
    contextLength: 4096,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    displayName: "Llama 3.2 1B",
    size: "~1.1GB",
    description: "Fastest option, good for quick queries",
    contextLength: 2048,
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    displayName: "Qwen 2.5 1.5B",
    size: "~1GB",
    description: "Good balance of size and capability",
    contextLength: 2048,
  },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0];
