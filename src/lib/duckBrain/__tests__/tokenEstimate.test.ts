import { describe, it, expect } from "vitest";
import { estimateTokens, formatTokenCount } from "../tokenEstimate";

describe("estimateTokens", () => {
  it("uses the ~4 chars/token heuristic, rounding up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("x".repeat(4000))).toBe(1000);
  });
});

describe("formatTokenCount", () => {
  it("keeps small counts plain and compacts thousands", () => {
    expect(formatTokenCount(42)).toBe("42");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1000)).toBe("1k");
    expect(formatTokenCount(1234)).toBe("1.2k");
    expect(formatTokenCount(15600)).toBe("15.6k");
  });
});
