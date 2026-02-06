export interface ParsedSQLResult {
  sql: string | null;
  confidence: number;
  issues: string[];
}

const SQL_KEYWORDS = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "WITH",
  "SHOW",
  "DESCRIBE",
  "EXPLAIN",
  "PRAGMA",
  "COPY",
  "EXPORT",
  "IMPORT",
];

/**
 * Extracts clean SQL from an LLM response
 * Handles markdown code blocks, explanatory prefixes, and trailing text
 */
export function extractSQLFromResponse(response: string): ParsedSQLResult {
  const issues: string[] = [];
  let cleaned = response.trim();

  // 1. Extract ALL code blocks and find the best SQL one
  const codeBlockRegex = /```(?:sql|SQL)?\s*([\s\S]*?)```/g;
  const codeBlocks: string[] = [];
  let match;
  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    const blockContent = match[1].trim();
    if (blockContent) {
      codeBlocks.push(blockContent);
    }
  }

  // If we found code blocks, pick the best one (the one that looks most like SQL)
  if (codeBlocks.length > 0) {
    // Find a code block that starts with a SQL keyword
    const bestBlock = codeBlocks.find((block) =>
      SQL_KEYWORDS.some((kw) => block.toUpperCase().startsWith(kw))
    );

    if (bestBlock) {
      cleaned = bestBlock;
      issues.push("Extracted from code block");
    } else {
      // Fallback: use the longest code block (likely the SQL)
      cleaned = codeBlocks.reduce((a, b) => (a.length > b.length ? a : b));
      issues.push("Used longest code block");
    }
  }

  // 2. Remove common prefixes the model might add (only if not from code block)
  if (codeBlocks.length === 0) {
    const prefixPatterns = [
      /^(?:Here(?:'s| is)(?: the)? (?:SQL|query)[:\s]*)/i,
      /^(?:The (?:SQL|query) (?:is|would be)[:\s]*)/i,
      /^(?:SQL[:\s]+)/i,
      /^(?:Query[:\s]+)/i,
      /^(?:Try this[:\s]*)/i,
      /^(?:You can use[:\s]*)/i,
      /^(?:Sure[,!]?\s*(?:here(?:'s| is)[:\s]*)?)/i,
      /^(?:Certainly[,!]?\s*(?:here(?:'s| is)[:\s]*)?)/i,
    ];

    for (const pattern of prefixPatterns) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, "").trim();
        issues.push("Removed explanatory prefix");
        break;
      }
    }
  }

  // 3. If no code blocks were found, try to extract SQL from the text
  // Look for SQL that starts with a keyword and try to find its end
  if (codeBlocks.length === 0) {
    const sqlStartMatch = cleaned.match(new RegExp(`(${SQL_KEYWORDS.join("|")})\\b`, "i"));

    if (sqlStartMatch && sqlStartMatch.index !== undefined) {
      // Start from the SQL keyword
      let sqlPart = cleaned.slice(sqlStartMatch.index);

      // Try to find the end of the SQL (semicolon followed by non-SQL text)
      const semicolonIndex = sqlPart.indexOf(";");
      if (semicolonIndex !== -1) {
        // Check if there's text after the semicolon that looks like an explanation
        const afterSemicolon = sqlPart.slice(semicolonIndex + 1).trim();
        const looksLikeExplanation =
          /^(This|Note|The above|It |I |You |Where |Which |Here |--|\n\n)/i.test(afterSemicolon);

        if (looksLikeExplanation || !afterSemicolon) {
          // Include up to and including the semicolon
          sqlPart = sqlPart.slice(0, semicolonIndex + 1);
          if (afterSemicolon) {
            issues.push("Trimmed trailing explanation after semicolon");
          }
        }
      }

      cleaned = sqlPart.trim();
    }
  }

  // 4. Final cleanup - remove any remaining markdown artifacts
  cleaned = cleaned.replace(/^`+|`+$/g, "").trim();

  // 5. Validate it looks like SQL
  const startsWithKeyword = SQL_KEYWORDS.some((kw) => cleaned.toUpperCase().startsWith(kw));

  if (!startsWithKeyword) {
    issues.push("Does not start with expected SQL keyword");
    return { sql: null, confidence: 0, issues };
  }

  // 6. Basic SQL validation
  if (cleaned.toUpperCase().startsWith("SELECT")) {
    const hasFrom = /\bFROM\b/i.test(cleaned) || /SELECT\s+[\d+\-*/() ]+;?\s*$/i.test(cleaned); // Allow SELECT 1+1 etc
    if (!hasFrom) {
      issues.push("SELECT query might be missing FROM clause");
    }
  }

  // Check for potentially incomplete statements
  const openParens = (cleaned.match(/\(/g) || []).length;
  const closeParens = (cleaned.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    issues.push("Mismatched parentheses - query may be incomplete");
  }

  // 7. Calculate confidence score
  let confidence = 1.0;
  confidence -= issues.length * 0.1;
  confidence = Math.max(0.1, confidence);

  return { sql: cleaned, confidence, issues };
}

/**
 * Formats SQL for display with basic indentation
 */
export function formatSQLForDisplay(sql: string): string {
  return sql
    .replace(/\bSELECT\b/gi, "SELECT")
    .replace(/\bFROM\b/gi, "\nFROM")
    .replace(/\bWHERE\b/gi, "\nWHERE")
    .replace(/\bAND\b/gi, "\n  AND")
    .replace(/\bOR\b/gi, "\n  OR")
    .replace(/\bGROUP BY\b/gi, "\nGROUP BY")
    .replace(/\bORDER BY\b/gi, "\nORDER BY")
    .replace(/\bHAVING\b/gi, "\nHAVING")
    .replace(/\bLIMIT\b/gi, "\nLIMIT")
    .replace(/\bJOIN\b/gi, "\nJOIN")
    .replace(/\bLEFT JOIN\b/gi, "\nLEFT JOIN")
    .replace(/\bRIGHT JOIN\b/gi, "\nRIGHT JOIN")
    .replace(/\bINNER JOIN\b/gi, "\nINNER JOIN")
    .replace(/\bON\b/gi, "\n  ON");
}
