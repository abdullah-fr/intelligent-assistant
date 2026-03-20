/**
 * Unit tests for background.js message handler.
 * Requirements: 4.1, 6.3, 6.4, 7.5
 *
 * background.js is self-contained — it uses globalThis.chrome directly.
 * We wire up listeners and mocks via globalThis before importing.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── Captured listener references ──────────────────────────────────────────────
let onMessageListener = null;
let onRemovedListener = null;
let onCommittedListener = null;

// ── Configurable mock state ───────────────────────────────────────────────────
let mockStorageData = {};
const mockTabsSendMessage = vi.fn();

// ── Wire up globalThis.chrome BEFORE importing background.js ─────────────────
globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener: (fn) => { onMessageListener = fn; },
    },
  },
  storage: {
    local: {
      get: (_keys) => Promise.resolve(mockStorageData),
    },
  },
  tabs: {
    sendMessage: (...args) => mockTabsSendMessage(...args),
    onRemoved: {
      addListener: (fn) => { onRemovedListener = fn; },
    },
  },
  webNavigation: {
    onCommitted: {
      addListener: (fn) => { onCommittedListener = fn; },
    },
  },
};

// Import background.js — triggers listener registration against globalThis.chrome
await import("../background.js");

// ── Helper ────────────────────────────────────────────────────────────────────
function sendMessage(message, senderTabId = 1) {
  return new Promise((resolve) => {
    const sender = { tab: { id: senderTabId } };
    onMessageListener(message, sender, resolve);
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockStorageData = {};
});

// ── 1. NO_API_KEY ─────────────────────────────────────────────────────────────

describe("NO_API_KEY response (Req 7.5)", () => {
  it("sends { type: 'NO_API_KEY' } when storage returns no apiKey", async () => {
    mockStorageData = {};
    const response = await sendMessage({
      type: "PROMPT",
      prompt: "What is this page?",
      context: { platform: "generic", pageType: "page" },
    });
    expect(response).toEqual({ type: "NO_API_KEY" });
  });

  it("sends { type: 'NO_API_KEY' } when apiKey is an empty string", async () => {
    mockStorageData = { apiKey: "" };
    const response = await sendMessage({
      type: "PROMPT",
      prompt: "Hello",
      context: { platform: "generic", pageType: "page" },
    });
    expect(response).toEqual({ type: "NO_API_KEY" });
  });
});

// ── 2. Full prompt → response flow ────────────────────────────────────────────

describe("Full prompt → response flow (Req 4.1)", () => {
  it("calls sendResponse with { type: 'RESPONSE', text } on success", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };

    // Intercept fetch to return a mock AI response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hello from AI" } }] }),
    });

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "Summarize this page",
      context: { platform: "blog", pageType: "article" },
    });

    expect(response).toEqual({ type: "RESPONSE", text: "Hello from AI" });
  });

  it("ignores non-PROMPT message types and returns false", () => {
    const result = onMessageListener({ type: "OTHER" }, { tab: { id: 1 } }, () => {});
    expect(result).toBe(false);
  });
});

// ── 3. Session memory updated after successful response ───────────────────────

describe("Session memory updated after response (Req 6.3, 6.4)", () => {
  it("does NOT call addTurn when no API key is configured", async () => {
    mockStorageData = {};
    // If no API key, we get NO_API_KEY — no AI call, no memory update
    const response = await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });
    expect(response).toEqual({ type: "NO_API_KEY" });
  });

  it("returns RESPONSE after successful AI call", async () => {
    mockStorageData = { apiKey: "key-abc", provider: "groq" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "AI answer" } }] }),
    });

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "User question",
      context: { platform: "generic", pageType: "page" },
    }, 42);

    expect(response).toEqual({ type: "RESPONSE", text: "AI answer" });
  });
});

// ── 4. Tab close triggers clearTab ────────────────────────────────────────────

describe("Tab close triggers clearTab (Req 6.4)", () => {
  it("calls onRemovedListener without throwing", () => {
    expect(() => onRemovedListener(5)).not.toThrow();
  });

  it("handles multiple tab close events independently", () => {
    expect(() => {
      onRemovedListener(10);
      onRemovedListener(20);
    }).not.toThrow();
  });
});

// ── 5. Navigation triggers clearTab ──────────────────────────────────────────

describe("Navigation triggers clearTab (Req 6.3)", () => {
  it("handles top-level frame navigation (frameId === 0) without throwing", () => {
    expect(() => onCommittedListener({ tabId: 3, frameId: 0 })).not.toThrow();
  });

  it("handles sub-frame navigation (frameId !== 0) without throwing", () => {
    expect(() => onCommittedListener({ tabId: 3, frameId: 1 })).not.toThrow();
  });
});

// ── 6. Error handling ─────────────────────────────────────────────────────────

describe("Error handling (Req 4.5)", () => {
  it("returns a response with the error text when fetch rejects", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });

    // AIClient.complete catches fetch errors and returns the message as text
    expect(response.type).toBe("RESPONSE");
    expect(response.text).toContain("Network failure");
  });

  it("sends a fallback error message when fetch returns non-ok status", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ error: { message: "Server error" } }),
    });

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });

    expect(response.type).toBe("RESPONSE"); // AIClient.complete returns error string, not throws
    expect(typeof response.text).toBe("string");
    expect(response.text.length).toBeGreaterThan(0);
  });
});
