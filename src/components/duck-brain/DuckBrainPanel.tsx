import React, { useCallback, useMemo } from "react";
import { Brain, X, Loader2, AlertCircle, Download, Trash2, RefreshCw, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDuckStore, type AIProviderType } from "@/store";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/duckBrain";
import { OPENAI_MODELS, ANTHROPIC_MODELS } from "@/lib/duckBrain/providers/types";
import { formatSchemaForContext } from "@/lib/duckBrain/schemaFormatter";
import {
  TEXT_TO_SQL_SYSTEM_PROMPT,
  DUCKDB_FEW_SHOT_EXAMPLES,
} from "@/lib/duckBrain/prompts/text-to-sql";
import { estimateTokens } from "@/lib/duckBrain/tokenEstimate";
import DuckBrainMessages from "./DuckBrainMessages";
import DuckBrainInput from "./DuckBrainInput";
import { toast } from "sonner";

interface DuckBrainPanelProps {
  tabId: string;
}

const DuckBrainPanel: React.FC<DuckBrainPanelProps> = React.memo(({ tabId }) => {
  const duckBrain = useDuckStore((s) => s.duckBrain);
  const databases = useDuckStore((s) => s.databases);
  const toggleBrainPanel = useDuckStore((s) => s.toggleBrainPanel);
  const initializeDuckBrain = useDuckStore((s) => s.initializeDuckBrain);
  const generateSQL = useDuckStore((s) => s.generateSQL);
  const abortGeneration = useDuckStore((s) => s.abortGeneration);
  const clearBrainMessages = useDuckStore((s) => s.clearBrainMessages);
  const executeQueryInChat = useDuckStore((s) => s.executeQueryInChat);
  const updateTabQuery = useDuckStore((s) => s.updateTabQuery);
  const setAIProvider = useDuckStore((s) => s.setAIProvider);
  const updateProviderConfig = useDuckStore((s) => s.updateProviderConfig);

  const {
    modelStatus,
    downloadProgress,
    downloadStatus,
    isWebGPUSupported,
    error,
    messages,
    isGenerating,
    streamingContent,
    aiProvider = "webllm",
    providerConfigs = {},
  } = duckBrain;

  // Get the display name for the current provider/model
  const providerDisplayInfo = useMemo(() => {
    if (aiProvider === "openai") {
      const config = providerConfigs.openai;
      if (config?.apiKey) {
        const model = OPENAI_MODELS.find((m) => m.id === config.modelId);
        return { name: model?.name || "GPT-4o Mini", isCloud: true };
      }
    } else if (aiProvider === "anthropic") {
      const config = providerConfigs.anthropic;
      if (config?.apiKey) {
        const model = ANTHROPIC_MODELS.find((m) => m.id === config.modelId);
        return { name: model?.name || "Claude Sonnet 4", isCloud: true };
      }
    } else if (aiProvider === "openai-compatible") {
      const config = providerConfigs["openai-compatible"];
      if (config?.baseUrl && config?.modelId) {
        return { name: config.modelId, isCloud: true };
      }
    } else if (aiProvider === "chrome-ai") {
      return { name: "Gemini Nano", isCloud: false };
    }
    // Default to local model
    const localModel = AVAILABLE_MODELS.find((m) => m.id === duckBrain.currentModel);
    return { name: localModel?.displayName || "Local Model", isCloud: false };
  }, [aiProvider, providerConfigs, duckBrain.currentModel]);

  // Build list of available providers for selector
  const availableProviders = useMemo(() => {
    const providers: { value: AIProviderType; label: string }[] = [];

    // Add WebLLM if model is loaded or loading
    if (modelStatus === "ready" || modelStatus === "downloading" || modelStatus === "loading") {
      const localModel = AVAILABLE_MODELS.find((m) => m.id === duckBrain.currentModel);
      providers.push({
        value: "webllm",
        label: localModel?.displayName || "Local Model",
      });
    }

    // Add Chrome Built-in AI when it's the active, ready provider
    if (aiProvider === "chrome-ai" && modelStatus === "ready") {
      providers.push({ value: "chrome-ai", label: "Gemini Nano (Chrome)" });
    }

    // Add OpenAI if configured
    if (providerConfigs.openai?.apiKey) {
      const model = OPENAI_MODELS.find((m) => m.id === providerConfigs.openai?.modelId);
      providers.push({
        value: "openai",
        label: model?.name || "GPT-4o Mini",
      });
    }

    // Add Anthropic if configured
    if (providerConfigs.anthropic?.apiKey) {
      const model = ANTHROPIC_MODELS.find((m) => m.id === providerConfigs.anthropic?.modelId);
      providers.push({
        value: "anthropic",
        label: model?.name || "Claude Sonnet 4",
      });
    }

    // Add OpenAI-Compatible if configured
    if (
      providerConfigs["openai-compatible"]?.baseUrl &&
      providerConfigs["openai-compatible"]?.modelId
    ) {
      providers.push({
        value: "openai-compatible",
        label: providerConfigs["openai-compatible"].modelId,
      });
    }

    return providers;
  }, [modelStatus, duckBrain.currentModel, providerConfigs, aiProvider]);

  const handleSend = useCallback(
    async (message: string) => {
      await generateSQL(message);
    },
    [generateSQL]
  );

  // Models switchable in-chat for the active provider (promised in #23).
  const switchableModels = useMemo(() => {
    if (aiProvider === "openai") return OPENAI_MODELS;
    if (aiProvider === "anthropic") return ANTHROPIC_MODELS;
    return null;
  }, [aiProvider]);

  const activeModelId =
    aiProvider === "openai" || aiProvider === "anthropic"
      ? providerConfigs[aiProvider]?.modelId || switchableModels?.[0]?.id
      : undefined;

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (aiProvider !== "openai" && aiProvider !== "anthropic") return;
      const config = providerConfigs[aiProvider];
      updateProviderConfig(aiProvider, { ...config, modelId });
    },
    [aiProvider, providerConfigs, updateProviderConfig]
  );

  // Everything sent alongside the user's prompt: system prompt, few-shot
  // examples, schema context, and the chat history. Recomputed as those grow
  // so the input can show a pre-run token estimate (#23).
  const baselineTokens = useMemo(() => {
    const schema = formatSchemaForContext(databases).formatted;
    const fewShot = DUCKDB_FEW_SHOT_EXAMPLES.map((m) =>
      typeof m.content === "string" ? m.content : ""
    ).join("\n");
    const history = messages.map((m) => m.content).join("\n");
    return estimateTokens(`${TEXT_TO_SQL_SYSTEM_PROMPT}\n${schema}\n${fewShot}\n${history}`);
  }, [databases, messages]);

  const handleExecuteSQL = useCallback(
    async (messageId: string, sql: string) => {
      try {
        const result = await executeQueryInChat(messageId, sql);
        if (result) {
          toast.success(`Query returned ${result.rowCount} rows`);
        }
      } catch {
        // Error is already handled in the store and shown in ResultsArtifact
      }
    },
    [executeQueryInChat]
  );

  const handleInsertSQL = useCallback(
    (sql: string) => {
      updateTabQuery(tabId, sql);
      toast.success("SQL inserted into editor");
    },
    [updateTabQuery, tabId]
  );

  const handleInitialize = useCallback(async () => {
    await initializeDuckBrain(DEFAULT_MODEL.id);
  }, [initializeDuckBrain]);

  // Render WebGPU not supported state
  if (isWebGPUSupported === false) {
    return (
      <div className="flex flex-col h-full border-l bg-background">
        <Header onClose={toggleBrainPanel} />
        <div className="flex-1 flex items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-sm">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="mt-2">
              <p className="font-medium">WebGPU Not Supported</p>
              <p className="text-xs mt-1">
                Duck Brain requires WebGPU for local AI processing. Please use Chrome 113+ or Edge
                113+.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Check if external provider is configured
  const hasExternalProvider =
    (aiProvider === "openai" && providerConfigs.openai?.apiKey) ||
    (aiProvider === "anthropic" && providerConfigs.anthropic?.apiKey) ||
    (aiProvider === "openai-compatible" &&
      providerConfigs["openai-compatible"]?.baseUrl &&
      providerConfigs["openai-compatible"]?.modelId);

  // Render idle state (not initialized) - only for WebLLM without external provider
  if ((modelStatus === "idle" || modelStatus === "checking") && !hasExternalProvider) {
    return (
      <div className="flex flex-col h-full border-l bg-background">
        <Header onClose={toggleBrainPanel} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <Brain className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="font-semibold mb-2">Initialize Duck Brain</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Download an AI model to enable natural language to SQL conversion. This runs 100%
              locally in your browser.
            </p>
            <div className="space-y-2 text-xs text-muted-foreground mb-4">
              <p>
                <strong>Model:</strong> {DEFAULT_MODEL.displayName}
              </p>
              <p>
                <strong>Size:</strong> {DEFAULT_MODEL.size}
              </p>
              <p>First load downloads the model. Future loads use cache.</p>
            </div>
            <Button onClick={handleInitialize} className="gap-2">
              <Download className="h-4 w-4" />
              Load AI Model
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render downloading/loading state
  if (modelStatus === "downloading" || modelStatus === "loading") {
    return (
      <div className="flex flex-col h-full border-l bg-background">
        <Header onClose={toggleBrainPanel} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm w-full">
            <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
            <h3 className="font-semibold mb-2">
              {modelStatus === "downloading" ? "Downloading Model..." : "Loading Model..."}
            </h3>
            <Progress value={downloadProgress} className="mb-2" />
            <p className="text-xs text-muted-foreground">
              {downloadStatus || `${downloadProgress}%`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (modelStatus === "error") {
    return (
      <div className="flex flex-col h-full border-l bg-background">
        <Header onClose={toggleBrainPanel} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="font-semibold mb-2">Failed to Load Model</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {error || "An unknown error occurred"}
            </p>
            <Button onClick={handleInitialize} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render ready state with chat interface
  return (
    <div className="flex flex-col h-full border-l bg-background">
      <Header
        onClose={toggleBrainPanel}
        onClear={clearBrainMessages}
        showClear={messages.length > 0}
      />

      {/* Status Badge & Provider Selector */}
      <div className="px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
            Ready
          </Badge>
          {/* Provider selector - show when multiple providers available */}
          {availableProviders.length > 1 ? (
            <Select
              value={aiProvider}
              onValueChange={(value) => setAIProvider(value as AIProviderType)}
            >
              <SelectTrigger className="h-6 w-auto gap-1 px-2 text-xs border-0 bg-transparent">
                <div className="flex items-center gap-1">
                  {providerDisplayInfo.isCloud && <Cloud className="h-3 w-3" />}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {providerDisplayInfo.isCloud && <Cloud className="h-3 w-3" />}
              <span>{providerDisplayInfo.name}</span>
            </div>
          )}
          {/* Model switcher for the active cloud provider (#23) */}
          {switchableModels && activeModelId && (
            <Select value={activeModelId} onValueChange={handleModelChange}>
              <SelectTrigger className="h-6 w-auto gap-1 px-2 text-xs border-0 bg-transparent ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {switchableModels.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Messages */}
      <DuckBrainMessages
        messages={messages}
        streamingContent={streamingContent}
        isGenerating={isGenerating}
        onExecuteSQL={handleExecuteSQL}
        onInsertSQL={handleInsertSQL}
        className="flex-1"
      />

      {/* Input */}
      <div className="p-3 border-t">
        <DuckBrainInput
          onSend={handleSend}
          onAbort={abortGeneration}
          isGenerating={isGenerating}
          disabled={modelStatus !== "ready" && !hasExternalProvider}
          databases={databases}
          placeholder="Ask Duck Brain... (@ for tables)"
          baselineTokens={baselineTokens}
        />
      </div>
    </div>
  );
});

// Header component
interface HeaderProps {
  onClose: () => void;
  onClear?: () => void;
  showClear?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onClose, onClear, showClear }) => (
  <div className="flex items-center justify-between px-3 py-2 border-b">
    <div className="flex items-center gap-2">
      <Brain className="h-5 w-5 text-primary" />
      <span className="font-semibold text-sm">Duck Brain</span>
    </div>
    <div className="flex items-center gap-1">
      {showClear && onClear && (
        <Button variant="ghost" size="icon" onClick={onClear} className="h-7 w-7">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
        <X className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export default DuckBrainPanel;
