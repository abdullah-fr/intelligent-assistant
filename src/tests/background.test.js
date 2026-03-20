/**
 * Unit tests for background.js message handler.
 * Requirements: 4.1, 6.3, 6.4, 7.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies before importing background.js ─────────────────────────

// Captured listener references
let onMessageListener = null;
let onRemovedListener = null;
let onCommittedListener = null;

// Configurable mock storage data
let mockStorageData = {};

// Mock tabs.sendMessage
const mockSendMessage = vi.fn();

// Mock browserAPI
vi.mock("../browser_shim.js", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn((fn) => { onMessageListener = fn; }),
      },
    },
    storage: {
      local: {
        get: vi.fn((_keys) => Promise.resolve(mockStorageData)),
      },
    },
    tabs: {
      sendMessage: mockSendMessage,
      onRemoved: {
        addListener: vi.fn((fn) => { onRemovedListener = fn; }),
      },
    },
    webNavigation: {
      onCommitted: {
        addListener: vi.fn((fn) => { onCommittedListener = fn; }),
      },
    },
  },
}));

// Mock SessionMemory
const mockGetHistory = vi.fn().mockReturnValue([]);
const mockAddTurn = vi.fn();
const mockClearTab = vi.fn();

vi.mock("../session_memory.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    getHistory: mockGetHistory,
    addTurn: mockAddTurn,
    clearTab: mockClearTab,
  })),
}));

// Mock PromptBuilder
const mockBuild = vi.fn().mockReturnValue([{ role: "user", content: "built prompt" }]);

vi.mock("../prompt_builder.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    build: mockBuild,
  })),
}));

// Mock AIClient
const mockComplete = vi.fn();
const mockStream = vi.fn();

vi.mock("../ai_client.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    complete: mockComplete,
    stream: mockStream,
  })),
}));

// Import background.js AFTER mocks are set up — this triggers listener registration
await import("../background.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Invoke the captured onMessage listener and collect the sendResponse value.
 */
function sendMessage(message, senderTabId = 1) {
  return new Promise((resolve) => {
    const sender = { tab: { id: senderTabId } };
    onMessageListener(message, sender, resolve);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockStorageData = {};
  mockGetHistory.mockReturnValue([]);
  mockBuild.mockReturnValue([{ role: "user", content: "built prompt" }]);
  mockComplete.mockResolvedValue("Hello");
});

// ── 1. NO_API_KEY ─────────────────────────────────────────────────────────────

describe("NO_API_KEY response (Req 7.5)", () => {
  it("sends { type: 'NO_API_KEY' } when storage returns no apiKey", async () => {
    mockStorageData = {}; // no apiKey

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
    mockComplete.mockResolvedValue("Hello from AI");

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "Summarize this page",
      context: { platform: "blog", pageType: "article" },
    });

    expect(response).toEqual({ type: "RESPONSE", text: "Hello from AI" });
  });

  it("passes the built messages to AIClient.complete", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    const builtMessages = [{ role: "system", content: "sys" }, { role: "user", content: "hi" }];
    mockBuild.mockReturnValue(builtMessages);
    mockComplete.mockResolvedValue("ok");

    await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });

    expect(mockComplete).toHaveBeenCalledWith(builtMessages, expect.objectContaining({ apiKey: "key-123" }));
  });

  it("ignores non-PROMPT message types and returns false", () => {
    const result = onMessageListener({ type: "OTHER" }, { tab: { id: 1 } }, () => {});
    expect(result).toBe(false);
  });
});

// ── 3. Session memory updated after successful response ───────────────────────

describe("Session memory updated after response (Req 6.3, 6.4)", () => {
  it("calls addTurn twice — once for user, once for assistant", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    mockComplete.mockResolvedValue("AI answer");

    await sendMessage({
      type: "PROMPT",
      prompt: "User question",
      context: { platform: "generic", pageType: "page" },
    }, 42);

    expect(mockAddTurn).toHaveBeenCalledTimes(2);
    expect(mockAddTurn).toHaveBeenNthCalledWith(1, 42, { role: "user", content: "User question" });
    expect(mockAddTurn).toHaveBeenNthCalledWith(2, 42, { role: "assistant", content: "AI answer" });
  });

  it("retrieves history for the correct tabId before building prompt", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    mockComplete.mockResolvedValue("ok");

    await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    }, 7);

    expect(mockGetHistory).toHaveBeenCalledWith(7);
  });

  it("does NOT call addTurn when no API key is configured", async () => {
    mockStorageData = {};

    await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });

    expect(mockAddTurn).not.toHaveBeenCalled();
  });
});

// ── 4. Tab close triggers clearTab ────────────────────────────────────────────

describe("Tab close triggers clearTab (Req 6.4)", () => {
  it("calls SessionMemory.clearTab with the closed tabId", () => {
    onRemovedListener(5);
    expect(mockClearTab).toHaveBeenCalledWith(5);
  });

  it("calls clearTab for each tab closed independently", () => {
    onRemovedListener(10);
    onRemovedListener(20);
    expect(mockClearTab).toHaveBeenCalledWith(10);
    expect(mockClearTab).toHaveBeenCalledWith(20);
    expect(mockClearTab).toHaveBeenCalledTimes(2);
  });
});

// ── 5. Navigation triggers clearTab ──────────────────────────────────────────

describe("Navigation triggers clearTab (Req 6.3)", () => {
  it("calls clearTab when top-level frame navigates (frameId === 0)", () => {
    onCommittedListener({ tabId: 3, frameId: 0 });
    expect(mockClearTab).toHaveBeenCalledWith(3);
  });

  it("does NOT call clearTab for sub-frame navigation (frameId !== 0)", () => {
    onCommittedListener({ tabId: 3, frameId: 1 });
    expect(mockClearTab).not.toHaveBeenCalled();
  });
});

// ── 6. Error handling ─────────────────────────────────────────────────────────

describe("Error handling (Req 4.5)", () => {
  it("sends { type: 'ERROR', message } when AIClient.complete rejects", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    mockComplete.mockRejectedValue(new Error("Network failure"));

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });

    expect(response).toEqual({ type: "ERROR", message: "Network failure" });
  });

  it("sends a fallback error message when the error has no message property", async () => {
    mockStorageData = { apiKey: "key-123", provider: "groq" };
    mockComplete.mockRejectedValue({});

    const response = await sendMessage({
      type: "PROMPT",
      prompt: "hi",
      context: { platform: "generic", pageType: "page" },
    });

    expect(response.type).toBe("ERROR");
    expect(typeof response.message).toBe("string");
    expect(response.message.length).toBeGreaterThan(0);
  });
});
