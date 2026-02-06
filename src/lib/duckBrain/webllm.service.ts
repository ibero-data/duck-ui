import {
  CreateWebWorkerMLCEngine,
  WebWorkerMLCEngine,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";
import { DEFAULT_MODEL } from "./models.config";

// Extend Navigator type for WebGPU
interface GPUAdapter {
  readonly name: string;
}

interface GPUInterface {
  requestAdapter(): Promise<GPUAdapter | null>;
}

declare global {
  interface Navigator {
    gpu?: GPUInterface;
  }
}

export type ModelStatus = "idle" | "checking" | "downloading" | "loading" | "ready" | "error";

export interface DuckBrainServiceState {
  status: ModelStatus;
  currentModel: string | null;
  downloadProgress: number;
  downloadStatus: string;
  error: string | null;
  isWebGPUSupported: boolean | null;
}

export interface StreamCallbacks {
  onToken: (token: string, fullText: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

type StateListener = (state: DuckBrainServiceState) => void;

/**
 * Singleton service for managing WebLLM engine
 * Runs inference in a Web Worker to keep UI responsive
 */
class DuckBrainService {
  private engine: WebWorkerMLCEngine | null = null;
  private worker: Worker | null = null;
  private abortController: AbortController | null = null;
  private stateListeners: Set<StateListener> = new Set();

  private state: DuckBrainServiceState = {
    status: "idle",
    currentModel: null,
    downloadProgress: 0,
    downloadStatus: "",
    error: null,
    isWebGPUSupported: null,
  };

  constructor() {
    // Check WebGPU support on construction
    this.checkWebGPUSupport();
  }

  /**
   * Check if WebGPU is available in the browser
   */
  async checkWebGPUSupport(): Promise<boolean> {
    this.updateState({ status: "checking" });

    if (!navigator.gpu) {
      this.updateState({
        isWebGPUSupported: false,
        status: "error",
        error: "WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+.",
      });
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      const supported = adapter !== null;

      this.updateState({
        isWebGPUSupported: supported,
        status: supported ? "idle" : "error",
        error: supported ? null : "WebGPU adapter not available. Your GPU may not be supported.",
      });

      return supported;
    } catch (error) {
      this.updateState({
        isWebGPUSupported: false,
        status: "error",
        error: "Failed to initialize WebGPU: " + (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Update state and notify listeners
   */
  private updateState(partial: Partial<DuckBrainServiceState>) {
    this.state = { ...this.state, ...partial };
    this.stateListeners.forEach((listener) => listener(this.state));
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Get current state
   */
  getState(): DuckBrainServiceState {
    return { ...this.state };
  }

  /**
   * Handle model initialization progress
   */
  private handleProgress = (progress: InitProgressReport) => {
    const percent = Math.round(progress.progress * 100);
    const isDownloading = progress.text.toLowerCase().includes("download");

    this.updateState({
      status: isDownloading ? "downloading" : "loading",
      downloadProgress: percent,
      downloadStatus: progress.text,
    });
  };

  /**
   * Initialize the WebLLM engine with a specific model
   */
  async initialize(modelId: string = DEFAULT_MODEL.id): Promise<void> {
    // Check WebGPU first
    if (this.state.isWebGPUSupported === null) {
      const supported = await this.checkWebGPUSupport();
      if (!supported) {
        throw new Error(this.state.error || "WebGPU not supported");
      }
    } else if (!this.state.isWebGPUSupported) {
      throw new Error(this.state.error || "WebGPU not supported");
    }

    // Already loaded with this model
    if (this.state.currentModel === modelId && this.engine) {
      return;
    }

    try {
      this.updateState({
        status: "loading",
        error: null,
        downloadProgress: 0,
        downloadStatus: "Initializing...",
      });

      // Cleanup existing engine
      await this.cleanup();

      // Create Web Worker for off-main-thread processing
      this.worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), { type: "module" });

      // Create engine with worker
      this.engine = await CreateWebWorkerMLCEngine(this.worker, modelId, {
        initProgressCallback: this.handleProgress,
      });

      this.updateState({
        status: "ready",
        currentModel: modelId,
        downloadProgress: 100,
        downloadStatus: "Model ready",
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize model";

      this.updateState({
        status: "error",
        error: errorMessage,
        downloadProgress: 0,
        downloadStatus: "",
      });

      throw error;
    }
  }

  /**
   * Generate text with streaming
   */
  async generateStreaming(
    messages: ChatCompletionMessageParam[],
    callbacks: StreamCallbacks,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<void> {
    if (!this.engine || this.state.status !== "ready") {
      throw new Error("Model not initialized. Please load a model first.");
    }

    this.abortController = new AbortController();
    let fullText = "";

    try {
      const stream = await this.engine.chat.completions.create({
        messages,
        stream: true,
        max_tokens: options?.maxTokens ?? 512,
        temperature: options?.temperature ?? 0.2,
      });

      for await (const chunk of stream) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        const delta = chunk.choices[0]?.delta?.content || "";
        fullText += delta;
        callbacks.onToken(delta, fullText);
      }

      if (!this.abortController?.signal.aborted) {
        callbacks.onComplete(fullText);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        callbacks.onError(error);
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Generate text without streaming (for simpler use cases)
   */
  async generate(
    messages: ChatCompletionMessageParam[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    if (!this.engine || this.state.status !== "ready") {
      throw new Error("Model not initialized. Please load a model first.");
    }

    const response = await this.engine.chat.completions.create({
      messages,
      max_tokens: options?.maxTokens ?? 512,
      temperature: options?.temperature ?? 0.2,
    });

    return response.choices[0]?.message?.content || "";
  }

  /**
   * Abort current generation
   */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.abort();

    if (this.engine) {
      try {
        await this.engine.unload();
      } catch {
        // Ignore cleanup errors
      }
      this.engine = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.updateState({
      status: "idle",
      currentModel: null,
      downloadProgress: 0,
      downloadStatus: "",
    });
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.state.status === "ready" && this.engine !== null;
  }
}

// Export singleton instance
export const duckBrainService = new DuckBrainService();
