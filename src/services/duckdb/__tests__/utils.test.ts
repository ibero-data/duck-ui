import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff, updateHistory } from "../utils";

// Mock generateUUID since it depends on crypto
vi.mock("@/lib/utils", () => ({
  generateUUID: () => "test-uuid-" + Math.random().toString(36).slice(2, 8),
}));

describe("retryWithBackoff", () => {
  it("returns result on first success", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(op);
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const result = await retryWithBackoff(op, 3, 10);
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("throws after all retries exhausted", async () => {
    const op = vi.fn().mockRejectedValue(new Error("always fail"));
    await expect(retryWithBackoff(op, 2, 10)).rejects.toThrow("always fail");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("uses exponential backoff delays", async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, delay: number) => {
      delays.push(delay);
      return originalSetTimeout(fn, 0);
    }) as typeof setTimeout);

    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    await retryWithBackoff(op, 3, 100);
    expect(delays).toEqual([100, 200]);

    vi.restoreAllMocks();
  });
});

describe("updateHistory", () => {
  it("adds a new query to empty history", () => {
    const result = updateHistory([], "SELECT 1");
    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("SELECT 1");
    expect(result[0].id).toBeTruthy();
    expect(result[0].timestamp).toBeInstanceOf(Date);
    expect(result[0].error).toBeUndefined();
  });

  it("adds error message when provided", () => {
    const result = updateHistory([], "BAD SQL", "syntax error");
    expect(result[0].error).toBe("syntax error");
  });

  it("moves duplicate query to the top", () => {
    const existing = [
      { id: "1", query: "SELECT 1", timestamp: new Date() },
      { id: "2", query: "SELECT 2", timestamp: new Date() },
      { id: "3", query: "SELECT 3", timestamp: new Date() },
    ];

    const result = updateHistory(existing, "SELECT 2");
    expect(result).toHaveLength(3);
    expect(result[0].query).toBe("SELECT 2");
    expect(result[1].query).toBe("SELECT 1");
    expect(result[2].query).toBe("SELECT 3");
  });

  it("caps history at 15 items", () => {
    const existing = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      query: `SELECT ${i}`,
      timestamp: new Date(),
    }));

    const result = updateHistory(existing, "SELECT new");
    expect(result).toHaveLength(15);
    expect(result[0].query).toBe("SELECT new");
  });

  it("prepends new queries to the front", () => {
    const existing = [{ id: "1", query: "SELECT 1", timestamp: new Date() }];
    const result = updateHistory(existing, "SELECT 2");
    expect(result[0].query).toBe("SELECT 2");
    expect(result[1].query).toBe("SELECT 1");
  });
});
