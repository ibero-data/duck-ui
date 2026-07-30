/**
 * Cheap client-side token estimation for the "what will this cost me" hint
 * shown before a Duck Brain request (#23). Providers tokenize differently and
 * we never want a network round-trip just for a hint, so this uses the common
 * ~4 characters/token heuristic. Treat the result as an order-of-magnitude
 * estimate, not billing truth.
 */
export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

/** "1234" → "1.2k" — compact display for the token hint. */
export const formatTokenCount = (tokens: number): string => {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
};
