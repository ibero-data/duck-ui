import { useState } from "react";
import { useDuckStore, type AIProviderType } from "@/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  HardDrive,
  Key,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_MODELS, type ModelConfig } from "@/lib/duckBrain";
import { OPENAI_MODELS, ANTHROPIC_MODELS } from "@/lib/duckBrain/providers/types";

/** One-click base URLs for the servers people actually run. */
const LOCAL_PRESETS = [
  { label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
];

/**
 * AI provider configuration, as a Settings section.
 *
 * The ranking is deliberate: a local OpenAI-compatible server (Ollama,
 * LM Studio) is the flagship "private" option, because it runs real models at
 * native speed with the same privacy story in-browser inference promises but
 * cannot deliver. WebLLM survives as the explicitly experimental zero-install
 * path at the bottom.
 */
export default function AISettings() {
  const duckBrain = useDuckStore((s) => s.duckBrain);
  const initializeDuckBrain = useDuckStore((s) => s.initializeDuckBrain);
  const setAIProvider = useDuckStore((s) => s.setAIProvider);
  const updateProviderConfig = useDuckStore((s) => s.updateProviderConfig);

  const {
    modelStatus,
    currentModel,
    downloadProgress,
    downloadStatus,
    isWebGPUSupported,
    error,
    aiProvider = "openai-compatible",
    providerConfigs = {},
  } = duckBrain;

  const compatible = providerConfigs["openai-compatible"];
  const [baseUrl, setBaseUrl] = useState(compatible?.baseUrl ?? LOCAL_PRESETS[0].baseUrl);
  const [modelId, setModelId] = useState(compatible?.modelId ?? "");
  const [compatibleKey, setCompatibleKey] = useState(compatible?.apiKey ?? "");
  const [foundModels, setFoundModels] = useState<string[] | null>(null);
  const [listing, setListing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => ({
    openai: providerConfigs.openai?.apiKey ?? "",
    anthropic: providerConfigs.anthropic?.apiKey ?? "",
  }));
  const [webllmOpen, setWebllmOpen] = useState(aiProvider === "webllm");
  const [clearing, setClearing] = useState(false);

  const isDownloading = modelStatus === "downloading" || modelStatus === "loading";

  const findModels = async () => {
    if (!baseUrl) return;
    setListing(true);
    setFoundModels(null);
    try {
      const { listCompatibleModels } = await import("@/lib/duckBrain/providers");
      const result = await listCompatibleModels(baseUrl, compatibleKey || undefined);
      if (result.models.length > 0) {
        setFoundModels(result.models);
        if (!modelId || !result.models.includes(modelId)) setModelId(result.models[0]);
        toast.success(
          `Found ${result.models.length} model${result.models.length === 1 ? "" : "s"}`
        );
      } else {
        setFoundModels([]);
        toast.error(
          result.error
            ? `Couldn't list models: ${result.error}`
            : "The server answered but offers no models"
        );
      }
    } finally {
      setListing(false);
    }
  };

  const saveCompatible = async () => {
    if (!baseUrl || !modelId) {
      toast.error("A base URL and a model are both needed");
      return;
    }
    setTesting(true);
    try {
      const { testProviderConnection } = await import("@/lib/duckBrain/providers");
      const result = await testProviderConnection("openai-compatible", {
        baseUrl,
        modelId,
        apiKey: compatibleKey || undefined,
      });
      if (result.success) {
        updateProviderConfig("openai-compatible", {
          baseUrl,
          modelId,
          apiKey: compatibleKey || undefined,
        });
        setAIProvider("openai-compatible");
        toast.success(`Connected. Duck Brain now uses ${modelId}.`);
      } else {
        toast.error(`Connection failed: ${result.error ?? "unknown error"}`);
      }
    } finally {
      setTesting(false);
    }
  };

  const saveCloudKey = async (provider: "openai" | "anthropic") => {
    const apiKey = apiKeys[provider];
    if (!apiKey) {
      toast.error("Enter an API key first");
      return;
    }
    const defaultModel = provider === "openai" ? "gpt-5-mini" : "claude-sonnet-5";
    const current = providerConfigs[provider];
    updateProviderConfig(provider, { apiKey, modelId: current?.modelId || defaultModel });

    setTesting(true);
    try {
      const { testProviderConnection } = await import("@/lib/duckBrain/providers");
      const result = await testProviderConnection(provider, {
        apiKey,
        modelId: current?.modelId || defaultModel,
      });
      if (result.success) {
        setAIProvider(provider);
        toast.success(`${provider === "openai" ? "OpenAI" : "Anthropic"} key verified`);
      } else {
        toast.error(`Connection failed: ${result.error}`);
      }
    } catch {
      toast.success("API key saved");
    } finally {
      setTesting(false);
    }
  };

  const clearWebllmCache = async () => {
    setClearing(true);
    try {
      const databases = await indexedDB.databases();
      let cleared = 0;
      for (const db of databases) {
        if (db.name && /webllm|mlc|cache|model/.test(db.name)) {
          indexedDB.deleteDatabase(db.name);
          cleared++;
        }
      }
      if ("caches" in window) {
        for (const name of await caches.keys()) {
          if (/webllm|mlc|model/.test(name)) {
            await caches.delete(name);
            cleared++;
          }
        }
      }
      toast.success(
        cleared > 0 ? `Cleared ${cleared} cached items. Reload to finish.` : "No cached model data."
      );
    } catch {
      toast.error("Couldn't clear the cache. Try your browser's site-data settings.");
    } finally {
      setClearing(false);
    }
  };

  const providerChip = (value: AIProviderType, label: string, icon: React.ReactNode) => (
    <Button
      variant={aiProvider === value ? "default" : "outline"}
      onClick={() => setAIProvider(value)}
      className="flex items-center gap-2"
      size="sm"
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duck Brain provider</CardTitle>
          <CardDescription>
            Where "question in, SQL out" actually runs. A local server keeps everything on your
            machine with real model quality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {providerChip(
              "openai-compatible",
              "Local server (Ollama)",
              <Server className="h-4 w-4" />
            )}
            {providerChip("openai", "OpenAI", <Cloud className="h-4 w-4" />)}
            {providerChip("anthropic", "Anthropic", <Cloud className="h-4 w-4" />)}
            {providerChip(
              "webllm",
              "In-browser (experimental)",
              <FlaskConical className="h-4 w-4" />
            )}
          </div>

          {aiProvider === "openai-compatible" && (
            <div className="space-y-4 pt-2">
              <Alert>
                <Server className="h-4 w-4" />
                <AlertDescription>
                  Any OpenAI-compatible endpoint works: Ollama and LM Studio locally, or vLLM,
                  DeepSeek and friends remotely. Nothing but the endpoint you set ever sees your
                  prompts.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="ai-base-url">Server</Label>
                <div className="flex flex-wrap gap-2 pb-1">
                  {LOCAL_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant={baseUrl === preset.baseUrl ? "secondary" : "outline"}
                      onClick={() => {
                        setBaseUrl(preset.baseUrl);
                        setFoundModels(null);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Input
                  id="ai-base-url"
                  type="url"
                  placeholder="http://localhost:11434/v1"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setFoundModels(null);
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-model-id">Model</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={findModels}
                    disabled={listing || !baseUrl}
                  >
                    {listing ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Find models
                  </Button>
                </div>
                {foundModels && foundModels.length > 0 ? (
                  <Select value={modelId} onValueChange={setModelId}>
                    <SelectTrigger id="ai-model-id">
                      <SelectValue placeholder="Pick a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {foundModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="ai-model-id"
                    placeholder="llama3.2, qwen2.5-coder, …"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-compat-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  API key <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="ai-compat-key"
                    type={showKey.compatible ? "text" : "password"}
                    placeholder="Only if the server requires one"
                    value={compatibleKey}
                    onChange={(e) => setCompatibleKey(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() =>
                      setShowKey((prev) => ({ ...prev, compatible: !prev.compatible }))
                    }
                  >
                    {showKey.compatible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                onClick={saveCompatible}
                disabled={testing || !baseUrl || !modelId}
                className="w-full"
              >
                {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {testing ? "Testing connection…" : "Test & save"}
              </Button>

              {compatible?.baseUrl && compatible?.modelId && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  Using {compatible.modelId}
                </Badge>
              )}

              <p className="text-xs text-muted-foreground">
                Ollama blocks unknown browser origins by default. If the connection fails from a
                deployed Duck-UI, start it with{" "}
                <code className="rounded bg-muted px-1">OLLAMA_ORIGINS=https://duckui.com</code> (or
                your own origin). localhost works out of the box.
              </p>
            </div>
          )}

          {(aiProvider === "openai" || aiProvider === "anthropic") && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor={`${aiProvider}-key`} className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  {aiProvider === "openai" ? "OpenAI" : "Anthropic"} API key
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`${aiProvider}-key`}
                      type={showKey[aiProvider] ? "text" : "password"}
                      placeholder={aiProvider === "openai" ? "sk-…" : "sk-ant-…"}
                      value={apiKeys[aiProvider] || ""}
                      onChange={(e) =>
                        setApiKeys((prev) => ({ ...prev, [aiProvider]: e.target.value }))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() =>
                        setShowKey((prev) => ({ ...prev, [aiProvider]: !prev[aiProvider] }))
                      }
                    >
                      {showKey[aiProvider] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => saveCloudKey(aiProvider)}
                    disabled={testing || !apiKeys[aiProvider]}
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Stored encrypted on this device, sent only to{" "}
                  {aiProvider === "openai" ? "api.openai.com" : "api.anthropic.com"}.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={
                    providerConfigs[aiProvider]?.modelId ||
                    (aiProvider === "openai" ? "gpt-5-mini" : "claude-sonnet-5")
                  }
                  onValueChange={(value) => {
                    const current = providerConfigs[aiProvider];
                    updateProviderConfig(aiProvider, {
                      apiKey: current?.apiKey || "",
                      modelId: value,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(aiProvider === "openai" ? OPENAI_MODELS : ANTHROPIC_MODELS).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} - {model.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {providerConfigs[aiProvider]?.apiKey && (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  API key configured
                </Badge>
              )}
            </div>
          )}

          {aiProvider === "webllm" && (
            <Alert>
              <FlaskConical className="h-4 w-4" />
              <AlertDescription>
                <strong>Experimental.</strong> Small models running inside this tab via WebGPU: a
                gigabyte-plus download, short context, and noticeably weaker SQL than a local
                Ollama. Its one real advantage is needing nothing installed — including offline.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* In-browser models: collapsed unless it is the active choice. */}
      <Collapsible open={webllmOpen || aiProvider === "webllm"} onOpenChange={setWebllmOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    In-browser models (experimental)
                  </CardTitle>
                  <CardDescription>
                    Zero-install, works offline. Weak at SQL — prefer a local server if you can run
                    one.
                  </CardDescription>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {isWebGPUSupported === false && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This browser has no WebGPU, which in-browser models require. Every other
                    provider still works.
                  </AlertDescription>
                </Alert>
              )}

              {isDownloading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      {modelStatus === "downloading" ? "Downloading model…" : "Loading model…"}
                    </span>
                    <span className="text-muted-foreground">{downloadProgress}%</span>
                  </div>
                  <Progress value={downloadProgress} />
                  <p className="text-xs text-muted-foreground">{downloadStatus}</p>
                </div>
              )}

              {modelStatus === "error" && error && aiProvider === "webllm" && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3">
                {AVAILABLE_MODELS.map((model: ModelConfig) => {
                  const isActive = currentModel === model.id && modelStatus === "ready";
                  const isLoadingThis = isDownloading && currentModel === model.id;
                  return (
                    <div
                      key={model.id}
                      className={`flex items-start justify-between p-3 rounded-lg border ${
                        isActive ? "border-green-500/50 bg-green-500/5" : "border-border"
                      }`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{model.displayName}</span>
                          {isActive && (
                            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                              <Check className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {model.size}
                          </span>
                          <span>Context: {model.contextLength.toLocaleString()} tokens</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-3"
                        disabled={isActive || isDownloading || isWebGPUSupported === false}
                        onClick={async () => {
                          setAIProvider("webllm");
                          await initializeDuckBrain(model.id);
                        }}
                      >
                        {isActive ? (
                          <Check className="h-4 w-4" />
                        ) : isLoadingThis ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" />
                            Load
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Models cache in this browser's storage.
                </p>
                <Button variant="outline" size="sm" onClick={clearWebllmCache} disabled={clearing}>
                  {clearing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear cache
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
