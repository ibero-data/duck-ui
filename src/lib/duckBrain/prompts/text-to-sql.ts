import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type { DuckBrainMessage } from "@/store";

export const TEXT_TO_SQL_SYSTEM_PROMPT = `You are Duck Brain, a DuckDB SQL query generator.

RULES:
1. Output ONLY the SQL query - no explanations, no markdown code fences
2. Use DuckDB syntax (similar to PostgreSQL)
3. ONLY use tables and columns shown in the DATABASE SCHEMA below
4. If a table or column doesn't exist in the schema, don't use it
5. Always check the schema for correct table and column names

DuckDB Syntax Tips:
- Use ILIKE for case-insensitive matching
- LIMIT goes at the end: SELECT * FROM table LIMIT 10
- String literals use single quotes: 'value'
- Use || for string concatenation
- SAMPLE for random rows: SELECT * FROM table USING SAMPLE 10
- Date functions: date_trunc('month', col), date_part('year', col)
- GROUP BY ALL to group by all non-aggregated columns

IMPORTANT: Start your response directly with SELECT, INSERT, UPDATE, DELETE, CREATE, WITH, SHOW, DESCRIBE, or other SQL keywords. No explanations, no markdown.`;

/**
 * Builds context from previous queries and their results.
 * This allows the model to see what data was returned and iterate on it.
 */
export function buildResultsContext(messages: DuckBrainMessage[]): string {
  // Find recent messages with successful query results
  const messagesWithResults = messages.filter(
    (m) =>
      m.role === "assistant" &&
      m.sql &&
      m.queryResult?.status === "success" &&
      m.queryResult.data
  );

  // Take the last 3 results to avoid context overflow
  const recentResults = messagesWithResults.slice(-3);

  if (recentResults.length === 0) {
    return "";
  }

  const contextParts = recentResults.map((m) => {
    const result = m.queryResult!.data!;
    const preview = result.data.slice(0, 10); // First 10 rows
    const columnInfo = result.columns
      .map((col, i) => `${col} (${result.columnTypes[i]})`)
      .join(", ");

    return `Previous Query: ${m.sql}
Columns: ${columnInfo}
Row Count: ${result.rowCount}
Sample Data (first ${Math.min(10, result.rowCount)} rows):
${JSON.stringify(preview, null, 2)}`;
  });

  return `\n\n--- PREVIOUS QUERY RESULTS ---\nYou can reference these results to write follow-up queries or analyze the data further.\n\n${contextParts.join("\n\n---\n\n")}`;
}

export const DUCKDB_FEW_SHOT_EXAMPLES: ChatCompletionMessageParam[] = [
  {
    role: "user",
    content: "Show me the top 5 customers by total orders",
  },
  {
    role: "assistant",
    content:
      "SELECT customer_id, COUNT(*) as total_orders FROM orders GROUP BY customer_id ORDER BY total_orders DESC LIMIT 5",
  },
  {
    role: "user",
    content: "Find duplicate emails",
  },
  {
    role: "assistant",
    content:
      "SELECT email, COUNT(*) as count FROM users GROUP BY email HAVING COUNT(*) > 1",
  },
  {
    role: "user",
    content: "Calculate month over month revenue growth",
  },
  {
    role: "assistant",
    content: `SELECT
  date_trunc('month', order_date) as month,
  SUM(amount) as revenue,
  LAG(SUM(amount)) OVER (ORDER BY date_trunc('month', order_date)) as prev_month,
  ROUND((SUM(amount) - LAG(SUM(amount)) OVER (ORDER BY date_trunc('month', order_date))) / LAG(SUM(amount)) OVER (ORDER BY date_trunc('month', order_date)) * 100, 2) as growth_pct
FROM orders
GROUP BY date_trunc('month', order_date)
ORDER BY month`,
  },
  {
    role: "user",
    content: "Sample 100 random rows from the transactions table",
  },
  {
    role: "assistant",
    content: "SELECT * FROM transactions USING SAMPLE 100",
  },
];

export function buildTextToSQLMessages(
  userQuery: string,
  schemaContext: string,
  previousMessages: DuckBrainMessage[] = [],
  includeFewShot: boolean = true
): ChatCompletionMessageParam[] {
  // Build results context from previous queries
  const resultsContext = buildResultsContext(previousMessages);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${TEXT_TO_SQL_SYSTEM_PROMPT}\n\n${schemaContext}${resultsContext}`,
    },
  ];

  if (includeFewShot) {
    messages.push(...DUCKDB_FEW_SHOT_EXAMPLES);
  }

  messages.push({
    role: "user",
    content: userQuery,
  });

  return messages;
}
