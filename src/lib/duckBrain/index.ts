// Duck Brain - Local AI Data Analyst for DuckUI
// Powered by WebLLM (in-browser LLM inference)

export { duckBrainService } from "./webllm.service";
export type {
  ModelStatus,
  DuckBrainServiceState,
  StreamCallbacks,
} from "./webllm.service";

export { AVAILABLE_MODELS, DEFAULT_MODEL } from "./models.config";
export type { ModelConfig } from "./models.config";

export { formatSchemaForContext, getSchemaSummary } from "./schemaFormatter";
export type { SchemaContext } from "./schemaFormatter";

export { extractSQLFromResponse, formatSQLForDisplay } from "./sqlParser";
export type { ParsedSQLResult } from "./sqlParser";

export { buildTextToSQLMessages } from "./prompts/text-to-sql";
