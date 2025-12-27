import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// Create handler for WebLLM engine in Web Worker
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
