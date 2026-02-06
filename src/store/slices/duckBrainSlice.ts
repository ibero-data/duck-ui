import type { StateCreator } from "zustand";
import { toast } from "sonner";
import { generateUUID } from "@/lib/utils";
import { executeExternalQuery, resultToJSON, validateConnection } from "@/services/duckdb";
import type { DuckStoreState, DuckBrainSlice, DuckBrainMessage, QueryResult } from "../types";

export const createDuckBrainSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  DuckBrainSlice
> = (set, get) => ({
  duckBrain: {
    modelStatus: "idle",
    downloadProgress: 0,
    downloadStatus: "",
    isWebGPUSupported: null,
    currentModel: null,
    error: null,
    messages: [],
    isGenerating: false,
    streamingContent: "",
    isPanelOpen: false,
    aiProvider: "webllm",
    providerConfigs: {},
  },

  initializeDuckBrain: async (modelId) => {
    const { duckBrainService } = await import("@/lib/duckBrain");

    duckBrainService.subscribe((serviceState) => {
      set((state) => ({
        duckBrain: {
          ...state.duckBrain,
          modelStatus: serviceState.status,
          downloadProgress: serviceState.downloadProgress,
          downloadStatus: serviceState.downloadStatus,
          isWebGPUSupported: serviceState.isWebGPUSupported,
          currentModel: serviceState.currentModel,
          error: serviceState.error,
        },
      }));
    });

    try {
      await duckBrainService.initialize(modelId);
    } catch (error) {
      toast.error(
        `Failed to initialize Duck Brain: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },

  generateSQL: async (naturalLanguage) => {
    const {
      duckBrainService,
      buildTextToSQLMessages,
      formatSchemaForContext,
      extractSQLFromResponse,
    } = await import("@/lib/duckBrain");

    const { databases, duckBrain } = get();
    const { aiProvider, providerConfigs } = duckBrain;
    const isExternalProvider = aiProvider !== "webllm";

    if (!isExternalProvider && duckBrain.modelStatus !== "ready") {
      toast.error("Duck Brain is not ready. Please wait for the model to load.");
      return null;
    }

    if (isExternalProvider) {
      if (aiProvider === "openai-compatible") {
        const config = providerConfigs["openai-compatible"];
        if (!config?.baseUrl || !config?.modelId) {
          toast.error("Please configure the Base URL and Model ID in Brain settings.");
          return null;
        }
      } else {
        const config = providerConfigs[aiProvider as "openai" | "anthropic"];
        if (!config?.apiKey) {
          toast.error(`Please configure your ${aiProvider} API key in Brain settings.`);
          return null;
        }
      }
    }

    const userMessage: DuckBrainMessage = {
      id: generateUUID(),
      role: "user",
      content: naturalLanguage,
      timestamp: new Date(),
    };

    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        messages: [...state.duckBrain.messages, userMessage],
        isGenerating: true,
        streamingContent: "",
      },
    }));

    try {
      const schemaContext = formatSchemaForContext(databases);
      const messages = buildTextToSQLMessages(
        naturalLanguage,
        schemaContext.formatted,
        duckBrain.messages,
        true
      );

      let fullResponse = "";

      if (isExternalProvider) {
        const { createProvider } = await import("@/lib/duckBrain/providers");
        const config = providerConfigs[aiProvider as "openai" | "anthropic" | "openai-compatible"]!;
        const provider = createProvider(aiProvider as "openai" | "anthropic" | "openai-compatible");

        await provider.initialize({
          apiKey: "apiKey" in config ? config.apiKey : undefined,
          modelId: config.modelId,
          baseUrl: "baseUrl" in config ? config.baseUrl : undefined,
        });

        await provider.generateStreaming(
          messages,
          {
            onToken: (token) => {
              fullResponse += token;
              set((state) => ({
                duckBrain: {
                  ...state.duckBrain,
                  streamingContent: fullResponse,
                },
              }));
            },
            onComplete: (finalText) => {
              const parsed = extractSQLFromResponse(finalText);

              const assistantMessage: DuckBrainMessage = {
                id: generateUUID(),
                role: "assistant",
                content: finalText,
                timestamp: new Date(),
                sql: parsed.sql || undefined,
              };

              set((state) => ({
                duckBrain: {
                  ...state.duckBrain,
                  messages: [...state.duckBrain.messages, assistantMessage],
                  isGenerating: false,
                  streamingContent: "",
                },
              }));
            },
            onError: (error) => {
              set((state) => ({
                duckBrain: {
                  ...state.duckBrain,
                  isGenerating: false,
                  streamingContent: "",
                  error: error.message,
                },
              }));
              toast.error(`Generation failed: ${error.message}`);
            },
          },
          { maxTokens: 512, temperature: 0.2 }
        );

        await provider.cleanup();
      } else {
        await duckBrainService.generateStreaming(
          messages,
          {
            onToken: (_token, fullText) => {
              fullResponse = fullText;
              set((state) => ({
                duckBrain: {
                  ...state.duckBrain,
                  streamingContent: fullText,
                },
              }));
            },
            onComplete: (finalText) => {
              const parsed = extractSQLFromResponse(finalText);

              const assistantMessage: DuckBrainMessage = {
                id: generateUUID(),
                role: "assistant",
                content: finalText,
                timestamp: new Date(),
                sql: parsed.sql || undefined,
              };

              set((state) => ({
                duckBrain: {
                  ...state.duckBrain,
                  messages: [...state.duckBrain.messages, assistantMessage],
                  isGenerating: false,
                  streamingContent: "",
                },
              }));
            },
            onError: (error) => {
              set((state) => ({
                duckBrain: {
                  ...state.duckBrain,
                  isGenerating: false,
                  streamingContent: "",
                  error: error.message,
                },
              }));
              toast.error(`Generation failed: ${error.message}`);
            },
          },
          { maxTokens: 512, temperature: 0.2 }
        );
      }

      const parsed = extractSQLFromResponse(fullResponse);
      return parsed.sql;
    } catch (error) {
      set((state) => ({
        duckBrain: {
          ...state.duckBrain,
          isGenerating: false,
          streamingContent: "",
        },
      }));
      toast.error(
        `Failed to generate SQL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return null;
    }
  },

  toggleBrainPanel: () => {
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        isPanelOpen: !state.duckBrain.isPanelOpen,
      },
    }));
  },

  abortGeneration: async () => {
    const { duckBrainService } = await import("@/lib/duckBrain");
    duckBrainService.abort();
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        isGenerating: false,
        streamingContent: "",
      },
    }));
  },

  clearBrainMessages: () => {
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        messages: [],
      },
    }));
  },

  addBrainMessage: (message) => {
    const newMessage: DuckBrainMessage = {
      ...message,
      id: generateUUID(),
      timestamp: new Date(),
    };
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        messages: [...state.duckBrain.messages, newMessage],
      },
    }));
  },

  setStreamingContent: (content) => {
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        streamingContent: content,
      },
    }));
  },

  setIsGenerating: (isGenerating) => {
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        isGenerating,
      },
    }));
  },

  executeQueryInChat: async (messageId, sql) => {
    const { currentConnection, connection, updateMessageQueryResult } = get();

    updateMessageQueryResult(messageId, { status: "running" });

    try {
      let queryResult: QueryResult;

      if (currentConnection?.scope === "External") {
        queryResult = await executeExternalQuery(sql, currentConnection);
      } else {
        if (!connection) {
          throw new Error("WASM connection not initialized");
        }
        const wasmConnection = validateConnection(connection);
        const result = await wasmConnection.query(sql);
        queryResult = resultToJSON(result);
      }

      if (queryResult.error) {
        updateMessageQueryResult(messageId, {
          status: "error",
          error: queryResult.error,
        });
        return null;
      }

      const serializeValue = (value: unknown): unknown => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        if (Array.isArray(value)) {
          return value.map(serializeValue);
        }
        if (value && typeof value === "object") {
          const result: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(value)) {
            result[k] = serializeValue(v);
          }
          return result;
        }
        return value;
      };

      const serializedResult = serializeValue(queryResult) as QueryResult;

      updateMessageQueryResult(messageId, {
        status: "success",
        data: serializedResult,
        executedAt: new Date(),
      });

      return serializedResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Query execution failed";

      updateMessageQueryResult(messageId, {
        status: "error",
        error: errorMessage,
      });

      return null;
    }
  },

  updateMessageQueryResult: (messageId, queryResult) => {
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        messages: state.duckBrain.messages.map((m) =>
          m.id === messageId ? { ...m, queryResult } : m
        ),
      },
    }));
  },

  setAIProvider: (provider) => {
    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        aiProvider: provider,
        modelStatus: provider === "webllm" ? "idle" : "ready",
        error: null,
      },
    }));
  },

  updateProviderConfig: (provider, config) => {
    const providerConfig =
      provider === "openai-compatible"
        ? { baseUrl: config.baseUrl || "", modelId: config.modelId, apiKey: config.apiKey }
        : { apiKey: config.apiKey || "", modelId: config.modelId };

    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        providerConfigs: {
          ...state.duckBrain.providerConfigs,
          [provider]: providerConfig,
        },
      },
    }));
  },

  initializeExternalProvider: async () => {
    const { duckBrain } = get();
    const { aiProvider, providerConfigs } = duckBrain;

    if (aiProvider === "webllm") {
      return;
    }

    const config = providerConfigs[aiProvider as "openai" | "anthropic" | "openai-compatible"];

    if (aiProvider === "openai-compatible") {
      if (!config || !("baseUrl" in config) || !config.baseUrl || !config.modelId) {
        toast.error("Please configure the Base URL and Model ID first");
        return;
      }
    } else {
      if (!config || !("apiKey" in config) || !config.apiKey) {
        toast.error(`Please configure your ${aiProvider} API key first`);
        return;
      }
    }

    set((state) => ({
      duckBrain: {
        ...state.duckBrain,
        modelStatus: "loading",
        error: null,
      },
    }));

    try {
      const { createProvider } = await import("@/lib/duckBrain/providers");
      const provider = createProvider(aiProvider);
      await provider.initialize({
        apiKey: "apiKey" in config ? config.apiKey : undefined,
        modelId: config.modelId,
        baseUrl: "baseUrl" in config ? config.baseUrl : undefined,
      });

      set((state) => ({
        duckBrain: {
          ...state.duckBrain,
          modelStatus: "ready",
          currentModel: config.modelId,
        },
      }));

      const providerName =
        aiProvider === "openai-compatible" ? "OpenAI-Compatible API" : aiProvider;
      toast.success(`${providerName} provider connected`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect";
      set((state) => ({
        duckBrain: {
          ...state.duckBrain,
          modelStatus: "error",
          error: errorMessage,
        },
      }));
      toast.error(`Failed to connect: ${errorMessage}`);
    }
  },
});
