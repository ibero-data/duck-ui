# Duck Brain AI Assistant

Duck Brain is an AI-powered assistant that helps you write SQL queries using natural language. It understands your database schema and generates accurate SQL tailored to your data.

## Overview

Duck Brain offers two ways to use AI:

1. **Local AI (WebLLM)** - Runs entirely in your browser using WebGPU. Your data never leaves your machine.
2. **Cloud AI** - Connect to OpenAI (GPT-4), Anthropic (Claude), or Google (Gemini) for more powerful models.

::: tip Privacy First
With local AI, all processing happens in your browser. Your queries, data, and schema never leave your machine.
:::

## Browser Requirements

### For Local AI (WebLLM)

Local AI requires **WebGPU** support:

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 113+ | ✅ Full support |
| Edge | 113+ | ✅ Full support |
| Firefox | - | ❌ Not supported |
| Safari | - | ❌ Not supported |

::: warning WebGPU Required
WebGPU is different from WebGL. Chrome/Edge 113+ have WebGPU enabled by default. Check `chrome://gpu` for WebGPU status.
:::

### For Cloud AI

Cloud AI works in any modern browser - no special requirements.

## Getting Started

### Opening Duck Brain

1. Click the **Brain icon** in the bottom-right corner of the SQL editor
2. The Duck Brain panel opens on the right side

### Using Local AI

1. On first use, click **Load AI Model**
2. Wait for the model to download (~2GB for Phi-3.5 Mini)
3. Once loaded, the model is cached for future sessions
4. Type your question and press Enter

### Using Cloud AI

1. Go to **Settings** (gear icon in header)
2. Navigate to the **Duck Brain** section
3. Enter your API key for OpenAI, Anthropic, or Gemini
4. Select your preferred model
5. Return to Duck Brain and start chatting

## Available Models

### Local Models (WebLLM)

| Model | Size | Best For |
|-------|------|----------|
| **Phi-3.5 Mini** | ~2.3GB | Best quality, recommended for most users |
| Llama 3.2 1B | ~1.1GB | Fastest, good for quick queries |
| Qwen 2.5 1.5B | ~1GB | Good balance of size and capability |

### Cloud Models

**OpenAI:**
- GPT-4o - Most capable
- GPT-4o Mini - Fast and affordable
- GPT-4 Turbo - GPT-4 with vision
- GPT-3.5 Turbo - Fast, simple tasks

**Anthropic:**
- Claude Sonnet 4 - Best balance
- Claude 3.5 Sonnet - Fast and capable
- Claude 3.5 Haiku - Fastest, affordable

**Google:**
- Gemini 1.5 Pro - Most capable
- Gemini 1.5 Flash - Fast and efficient

## Using Duck Brain

### Asking Questions

Duck Brain understands natural language. Just describe what you want:

```
Show me the top 10 customers by total sales
```

```
Find all orders from last month where the amount is over $1000
```

```
What's the average order value by product category?
```

### Referencing Tables with @

Use `@` to reference specific tables or columns:

```
Show me all rows from @customers where status is active
```

```
Join @orders with @products and show the top sellers
```

When you type `@`, an autocomplete menu shows available tables and columns.

### Schema Awareness

Duck Brain automatically knows your database schema:
- Table names and their columns
- Column types (VARCHAR, INTEGER, etc.)
- Row counts for each table

This context helps generate accurate SQL for your specific data.

### Running Generated SQL

1. Duck Brain generates SQL and shows it in a code block
2. Click **Execute** to run the query immediately
3. Click **Insert** to add the SQL to your editor
4. Results appear inline in the chat

### Switching Providers

If you have multiple AI providers configured:

1. Look for the provider selector in the Duck Brain header
2. Click to switch between local and cloud models
3. Your choice is remembered for the session

## How It Works

### Local AI Architecture

```
User Query → Duck Brain → WebLLM Engine → WebGPU → GPU
                ↓
          Schema Context
                ↓
         SQL Generation
                ↓
            Response
```

1. Your question is combined with database schema context
2. The local LLM (running via WebLLM) generates SQL
3. All processing happens on your GPU via WebGPU
4. No data ever leaves your browser

### Cloud AI Flow

```
User Query + Schema → API Request → Cloud Provider → Response
```

1. Your question and schema summary are sent to the cloud API
2. The cloud model generates SQL
3. Response is streamed back to your browser

::: warning Cloud Privacy
When using cloud AI, your query and a summary of your schema are sent to the provider. Actual data values are never sent.
:::

## Best Practices

### Writing Good Prompts

1. **Be specific**: "Show sales by month for 2024" is better than "show me sales"
2. **Reference tables**: Use `@table_name` to be explicit
3. **Describe the output**: "as a percentage" or "ordered by date descending"

### For Complex Queries

1. Start simple, then refine
2. Ask for explanations: "Explain this query"
3. Request modifications: "Now add a filter for status = 'active'"

### Performance Tips

1. **Local AI**:
   - First load downloads ~2GB model
   - Subsequent loads use cached model
   - GPU memory affects performance

2. **Cloud AI**:
   - Faster initial response
   - No local GPU required
   - Requires internet connection

## Troubleshooting

### "WebGPU Not Supported"

**Problem**: Can't use local AI

**Solutions**:
1. Update to Chrome/Edge 113+
2. Check `chrome://gpu` for WebGPU status
3. Try enabling `#enable-unsafe-webgpu` flag
4. Use cloud AI as alternative

### "Model download failed"

**Problem**: Can't download the AI model

**Solutions**:
1. Check internet connection
2. Clear browser cache and retry
3. Try a smaller model (Llama 3.2 1B)
4. Check available disk space

### "Generation is slow"

**Problem**: AI responses take too long

**Solutions**:
1. Try a smaller model
2. Close other GPU-intensive applications
3. Use cloud AI for faster responses
4. Reduce query complexity

### "API key invalid"

**Problem**: Cloud AI not working

**Solutions**:
1. Verify API key is correct
2. Check API key permissions
3. Ensure you have API credits
4. Try generating a new key

## Technical Details

### WebLLM Integration

Duck Brain uses [WebLLM](https://webllm.mlc.ai/) for local inference:

- Runs optimized LLMs in browser via WebGPU
- Models are quantized (4-bit) for efficiency
- Cached in browser's Cache Storage
- No backend server required

### Provider Abstraction

All AI providers implement a common interface:

```typescript
interface AIProvider {
  generateStreaming(messages, callbacks): Promise<void>;
  generateText(messages): Promise<string>;
  abort(): void;
}
```

This allows seamless switching between local and cloud AI.

### Schema Context

Before each generation, Duck Brain builds a schema context:

```sql
-- Table: customers (1,234 rows)
-- Columns: id (INTEGER), name (VARCHAR), email (VARCHAR), ...

-- Table: orders (5,678 rows)
-- Columns: id (INTEGER), customer_id (INTEGER), amount (DECIMAL), ...
```

This context is prepended to your query to help the AI understand your data structure.
