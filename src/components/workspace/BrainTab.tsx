import { useState, useEffect } from "react";
import { useDuckStore, type AIProviderType } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Check,
  Loader2,
  AlertCircle,
  Cpu,
  HardDrive,
  Zap,
  Trash2,
  Key,
  Cloud,
  Eye,
  EyeOff,
  Server,
  Link,
} from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_MODELS, type ModelConfig } from "@/lib/duckBrain";
import {
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
} from "@/lib/duckBrain/providers/types";

const BrainTab = () => {
  const { duckBrain, initializeDuckBrain, setAIProvider, updateProviderConfig } = useDuckStore();
  const [isClearing, setIsClearing] = useState(false);
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [isTesting, setIsTesting] = useState(false);

  // OpenAI-compatible provider inputs
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState("");
  const [compatibleModelId, setCompatibleModelId] = useState("");
  const [compatibleApiKey, setCompatibleApiKey] = useState("");

  useEffect(() => {
    checkCacheSize();
    const inputs: Record<string, string> = {};
    if (duckBrain.providerConfigs.openai?.apiKey) {
      inputs.openai = duckBrain.providerConfigs.openai.apiKey;
    }
    if (duckBrain.providerConfigs.anthropic?.apiKey) {
      inputs.anthropic = duckBrain.providerConfigs.anthropic.apiKey;
    }
    setApiKeyInputs(inputs);

    // Initialize openai-compatible inputs
    const compatibleConfig = duckBrain.providerConfigs["openai-compatible"];
    if (compatibleConfig) {
      setCompatibleBaseUrl(compatibleConfig.baseUrl || "");
      setCompatibleModelId(compatibleConfig.modelId || "");
      setCompatibleApiKey(compatibleConfig.apiKey || "");
    }
  }, []);

  const checkCacheSize = async () => {
    try {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage) {
          const sizeInMB = (estimate.usage / (1024 * 1024)).toFixed(1);
          setCacheSize(`${sizeInMB} MB`);
        }
      }
    } catch {
      // Ignore errors
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      const databases = await indexedDB.databases();
      let cleared = 0;

      for (const db of databases) {
        if (
          db.name &&
          (db.name.includes("webllm") ||
            db.name.includes("mlc") ||
            db.name.includes("cache") ||
            db.name.includes("model"))
        ) {
          indexedDB.deleteDatabase(db.name);
          cleared++;
        }
      }

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          if (
            name.includes("webllm") ||
            name.includes("mlc") ||
            name.includes("model")
          ) {
            await caches.delete(name);
            cleared++;
          }
        }
      }

      toast.success(
        cleared > 0
          ? `Cleared ${cleared} cached items. Reload page to see changes.`
          : "No cached model data found."
      );
      checkCacheSize();
    } catch (err) {
      console.error("Failed to clear cache:", err);
      toast.error("Failed to clear cache. Try clearing manually via browser settings.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleProviderChange = (provider: AIProviderType) => {
    setAIProvider(provider);
  };

  const handleApiKeyChange = (provider: "openai" | "anthropic", value: string) => {
    setApiKeyInputs((prev) => ({ ...prev, [provider]: value }));
  };

  const handleSaveApiKey = async (provider: "openai" | "anthropic") => {
    const apiKey = apiKeyInputs[provider];
    if (!apiKey) {
      toast.error("Please enter an API key");
      return;
    }

    const currentConfig = duckBrain.providerConfigs[provider];
    const defaultModel = provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-20250514";

    updateProviderConfig(provider, {
      apiKey,
      modelId: currentConfig?.modelId || defaultModel,
    });

    setIsTesting(true);
    try {
      const { testProviderConnection } = await import("@/lib/duckBrain/providers");
      const result = await testProviderConnection(provider, {
        apiKey,
        modelId: currentConfig?.modelId || defaultModel,
      });

      if (result.success) {
        toast.success(`${provider === "openai" ? "OpenAI" : "Anthropic"} API key saved and verified`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
    } catch {
      toast.success("API key saved");
    } finally {
      setIsTesting(false);
    }
  };

  const handleModelChange = (provider: "openai" | "anthropic", modelId: string) => {
    const currentConfig = duckBrain.providerConfigs[provider];
    updateProviderConfig(provider, {
      apiKey: currentConfig?.apiKey || "",
      modelId,
    });
  };

  const handleSaveCompatibleConfig = async () => {
    if (!compatibleBaseUrl) {
      toast.error("Please enter a Base URL");
      return;
    }
    if (!compatibleModelId) {
      toast.error("Please enter a Model ID");
      return;
    }

    setIsTesting(true);
    try {
      const { testProviderConnection } = await import("@/lib/duckBrain/providers");
      const result = await testProviderConnection("openai-compatible", {
        baseUrl: compatibleBaseUrl,
        modelId: compatibleModelId,
        apiKey: compatibleApiKey || undefined,
      });

      if (result.success) {
        // Only save config if connection test succeeds
        updateProviderConfig("openai-compatible", {
          baseUrl: compatibleBaseUrl,
          modelId: compatibleModelId,
          apiKey: compatibleApiKey || undefined,
        });
        toast.success("Connected successfully!");
      } else {
        toast.error(`Connection failed: ${result.error || "Unknown error"}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Connection failed";
      toast.error(errorMessage);
    } finally {
      setIsTesting(false);
    }
  };

  const {
    modelStatus,
    currentModel,
    downloadProgress,
    downloadStatus,
    isWebGPUSupported,
    error,
    aiProvider = "webllm",
    providerConfigs = {},
  } = duckBrain;

  const isDownloading = modelStatus === "downloading" || modelStatus === "loading";

  const handleLoadModel = async (modelId: string) => {
    try {
      await initializeDuckBrain(modelId);
    } catch (err) {
      console.error("Failed to load model:", err);
    }
  };

  const getModelStatus = (model: ModelConfig) => {
    if (currentModel === model.id) {
      if (modelStatus === "ready") return "ready";
      if (isDownloading) return "downloading";
    }
    return "available";
  };

  return (
    <div className="p-4 space-y-6 overflow-auto h-full">
      {/* WebGPU Status Alert */}
      {isWebGPUSupported === false && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>WebGPU Not Supported</strong> - Duck Brain requires WebGPU for
            local AI inference. Please use Chrome 113+ or Edge 113+.
          </AlertDescription>
        </Alert>
      )}

      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <CardTitle>AI Provider</CardTitle>
          </div>
          <CardDescription>
            Choose between local (WebLLM) or cloud-based AI providers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={aiProvider === "webllm" ? "default" : "outline"}
              onClick={() => handleProviderChange("webllm")}
              className="flex items-center gap-2"
            >
              <Cpu className="h-4 w-4" />
              Local (WebLLM)
            </Button>
            <Button
              variant={aiProvider === "openai" ? "default" : "outline"}
              onClick={() => handleProviderChange("openai")}
              className="flex items-center gap-2"
            >
              <Cloud className="h-4 w-4" />
              OpenAI
            </Button>
            <Button
              variant={aiProvider === "anthropic" ? "default" : "outline"}
              onClick={() => handleProviderChange("anthropic")}
              className="flex items-center gap-2"
            >
              <Cloud className="h-4 w-4" />
              Anthropic
            </Button>
            <Button
              variant={aiProvider === "openai-compatible" ? "default" : "outline"}
              onClick={() => handleProviderChange("openai-compatible")}
              className="flex items-center gap-2"
            >
              <Server className="h-4 w-4" />
              OpenAI-Compatible
            </Button>
          </div>

          {aiProvider === "webllm" && (
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertDescription>
                <strong>100% Local AI</strong> - Models run entirely in your browser.
              </AlertDescription>
            </Alert>
          )}

          {aiProvider === "openai" && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="openai-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  OpenAI API Key
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="openai-key"
                      type={showApiKey.openai ? "text" : "password"}
                      placeholder="sk-..."
                      value={apiKeyInputs.openai || ""}
                      onChange={(e) => handleApiKeyChange("openai", e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, openai: !prev.openai }))}
                    >
                      {showApiKey.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    onClick={() => handleSaveApiKey("openai")}
                    disabled={isTesting || !apiKeyInputs.openai}
                  >
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={providerConfigs.openai?.modelId || "gpt-4o-mini"}
                  onValueChange={(value) => handleModelChange("openai", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} - {model.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {providerConfigs.openai?.apiKey && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  API Key Configured
                </Badge>
              )}
            </div>
          )}

          {aiProvider === "anthropic" && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="anthropic-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Anthropic API Key
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="anthropic-key"
                      type={showApiKey.anthropic ? "text" : "password"}
                      placeholder="sk-ant-..."
                      value={apiKeyInputs.anthropic || ""}
                      onChange={(e) => handleApiKeyChange("anthropic", e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, anthropic: !prev.anthropic }))}
                    >
                      {showApiKey.anthropic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    onClick={() => handleSaveApiKey("anthropic")}
                    disabled={isTesting || !apiKeyInputs.anthropic}
                  >
                    {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={providerConfigs.anthropic?.modelId || "claude-sonnet-4-20250514"}
                  onValueChange={(value) => handleModelChange("anthropic", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANTHROPIC_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} - {model.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {providerConfigs.anthropic?.apiKey && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  API Key Configured
                </Badge>
              )}
            </div>
          )}

          {aiProvider === "openai-compatible" && (
            <div className="space-y-4 pt-2">
              <Alert>
                <Server className="h-4 w-4" />
                <AlertDescription>
                  <strong>OpenAI-Compatible API</strong> - Connect to Ollama, LocalAI, vLLM, DeepSeek, and other services that implement the OpenAI chat completions API.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="compatible-base-url" className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Base URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="compatible-base-url"
                  type="url"
                  placeholder="http://localhost:11434/v1"
                  value={compatibleBaseUrl}
                  onChange={(e) => setCompatibleBaseUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The API endpoint URL (e.g., http://localhost:11434/v1 for Ollama)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="compatible-model-id" className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Model ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="compatible-model-id"
                  type="text"
                  placeholder="llama3.2"
                  value={compatibleModelId}
                  onChange={(e) => setCompatibleModelId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The model name as recognized by your API (e.g., llama3.2, deepseek-coder)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="compatible-api-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  API Key <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="compatible-api-key"
                    type={showApiKey["openai-compatible"] ? "text" : "password"}
                    placeholder="Optional - only if your server requires authentication"
                    value={compatibleApiKey}
                    onChange={(e) => setCompatibleApiKey(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey((prev) => ({ ...prev, "openai-compatible": !prev["openai-compatible"] }))}
                  >
                    {showApiKey["openai-compatible"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleSaveCompatibleConfig}
                disabled={isTesting || !compatibleBaseUrl || !compatibleModelId}
                className="w-full"
              >
                {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isTesting ? "Testing Connection..." : "Test & Save"}
              </Button>

              {providerConfigs["openai-compatible"]?.baseUrl && providerConfigs["openai-compatible"]?.modelId && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  Configured: {providerConfigs["openai-compatible"].modelId}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Download Progress - Only show for WebLLM */}
      {aiProvider === "webllm" && isDownloading && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">
                    {modelStatus === "downloading" ? "Downloading model..." : "Loading model..."}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} />
              <p className="text-xs text-muted-foreground">{downloadStatus}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {modelStatus === "error" && error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Available Models - Only for WebLLM */}
      {aiProvider === "webllm" && (
        <Card>
          <CardHeader>
            <CardTitle>Available Local Models</CardTitle>
            <CardDescription>
              Select a model to use with Duck Brain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {AVAILABLE_MODELS.map((model) => {
                const status = getModelStatus(model);
                const isCurrentlyDownloading = isDownloading && currentModel === model.id;

                return (
                  <div
                    key={model.id}
                    className={`flex items-start justify-between p-4 rounded-lg border ${
                      status === "ready" ? "border-green-500/50 bg-green-500/5" : "border-border"
                    }`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{model.displayName}</span>
                        {status === "ready" && (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{model.description}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <HardDrive className="h-3 w-3" />
                          {model.size}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Context: {model.contextLength.toLocaleString()} tokens
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {status === "ready" ? (
                        <Button variant="outline" size="sm" disabled>
                          <Check className="h-4 w-4 mr-1" />
                          Loaded
                        </Button>
                      ) : isCurrentlyDownloading ? (
                        <Button variant="outline" size="sm" disabled>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Loading...
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadModel(model.id)}
                          disabled={isDownloading || isWebGPUSupported === false}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Load
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storage Info - Only for WebLLM */}
      {aiProvider === "webllm" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Storage Information</CardTitle>
              {cacheSize && (
                <Badge variant="secondary" className="font-mono">
                  {cacheSize} used
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-3">
              <p>Models are cached in your browser's IndexedDB storage.</p>
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs">Clear all cached model data to free up storage.</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearCache}
                  disabled={isClearing}
                >
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear Cache
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BrainTab;
