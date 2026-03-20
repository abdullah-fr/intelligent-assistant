/**
 * Unit tests for content_script.js — injection guard, UI wiring, and message handling.
 * Requirements: 2.1, 2.7, 4.1, 5.1, 5.2, 5.4, 5.5, 7.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ─────────────────────────────────────────────────────────

// Captured message listener
let onMessageListener = null;

// Mock sendMessage — stores the last call's args
let lastSendMessageArgs = null;
const mockSendMessage = vi.fn((msg, cb) => {
  lastSendMessageArgs = { msg, cb };
});

vi.mock("../browser_shim.js", () => ({
  default: {
    runtime: {
      sendMessage: (...args) => mockSendMessage(...args),
      onMessage: {
        addListener: vi.fn((fn) => { onMessageListener = fn; }),
      },
    },
  },
}));

// Mock ChatUI — track method calls
const mockMount = vi.fn();
const mockSetLoading = vi.fn();
const mockSetResponse = vi.fn();
const mockAppendChunk = vi.fn();
const mockSetError = vi.fn();

let capturedOnSubmit = null;

vi.mock("../chat_ui.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    mount: mockMount,
    setLoading: mockSetLoading,
    setResponse: mockSetResponse,
    appendChunk: mockAppendChunk,
    setError: mockSetError,
    set onSubmit(fn) { capturedOnSubmit = fn; },
    get onSubmit() { return capturedOnSubmit; },
  })),
}));

// Mock ContextExtractor
const mockExtract = vi.fn().mockReturnValue({
  platform: "generic",
  pageType: "page",
  title: "Test Page",
  snippet: "Some content",
});

vi.mock("../context_extractor.js", () => ({
  default: vi.fn().mockImplementation(() => ({
    extract: mockExtract,
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Reset DOM and module state, then re-import content_script.js.
 * Each test that needs a fresh injection should call this.
 */
async function loadContentScript() {
  // Remove any existing sentinel
  const existing = document.querySelector("[data-kiro-injected]");
  if (existing) existing.remove();

  vi.resetModules();
  vi.clearAllMocks();
  onMessageListener = null;
  capturedOnSubmit = null;
  lastSendMessageArgs = null;

  // Re-apply mocks after resetModules
  vi.mock("../browser_shim.js", () => ({
    default: {
      runtime: {
        sendMessage: (...args) => mockSendMessage(...args),
        onMessage: {
          addListener: vi.fn((fn) => { onMessageListener = fn; }),
        },
      },
    },
  }));

  vi.mock("../chat_ui.js", () => ({
    default: vi.fn().mockImplementation(() => ({
      mount: mockMount,
      setLoading: mockSetLoading,
      setResponse: mockSetResponse,
      appendChunk: mockAppendChunk,
      setError: mockSetError,
      set onSubmit(fn) { capturedOnSubmit = fn; },
      get onSubmit() { return capturedOnSubmit; },
    })),
  }));

  vi.mock("../context_extractor.js", () => ({
    default: vi.fn().mockImplementation(() => ({
      extract: mockExtract,
    })),
  }));

  await import("../content_script.js");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await loadContentScript();
});

// ── 1. Injection guard (Req 2.7) ──────────────────────────────────────────────

describe("Duplicate injection guard (Req 2.7)", () => {
  it("injects a host element with data-kiro-injected attribute", () => {
    expect(document.querySelector("[data-kiro-injected]")).not.toBeNull();
  });

  it("does not inject a second host element when sentinel already exists", async () => {
    // The sentinel is already in the DOM from beforeEach
    vi.clearAllMocks();
    await import("../content_script.js");

    const sentinels = document.querySelectorAll("[data-kiro-injected]");
    expect(sentinels.length).toBe(1);
    // mount should NOT have been called again
    expect(mockMount).not.toHaveBeenCalled();
  });
});

// ── 2. Shadow DOM setup (Req 2.1) ─────────────────────────────────────────────

describe("Shadow DOM setup (Req 2.1)", () => {
  it("appends the host element to document.body", () => {
    const host = document.querySelector("[data-kiro-injected]");
    expect(document.body.contains(host)).toBe(true);
  });

  it("calls ChatUI.mount with a ShadowRoot", () => {
    expect(mockMount).toHaveBeenCalledTimes(1);
    const arg = mockMount.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ShadowRoot);
  });
});

// ── 3. Submit handler (Req 4.1, 5.1) ─────────────────────────────────────────

describe("Submit handler (Req 4.1, 5.1)", () => {
  it("calls setLoading with 'Analyzing page…' on submit", () => {
    capturedOnSubmit("What is this page?");
    expect(mockSetLoading).toHaveBeenCalledWith("Analyzing page…");
  });

  it("calls ContextExtractor.extract() on submit", () => {
    capturedOnSubmit("Tell me more");
    expect(mockExtract).toHaveBeenCalled();
  });

  it("sends a PROMPT message with prompt and context via browserAPI.runtime.sendMessage", () => {
    const context = { platform: "blog", pageType: "article", title: "My Blog" };
    mockExtract.mockReturnValueOnce(context);

    capturedOnSubmit("Summarize this");

    expect(mockSendMessage).toHaveBeenCalledWith(
      { type: "PROMPT", prompt: "Summarize this", context },
      expect.any(Function)
    );
  });
});

// ── 4. Response handling (Req 5.2, 5.4, 7.5) ─────────────────────────────────

describe("sendMessage callback — response handling", () => {
  it("calls setResponse when callback receives { type: 'RESPONSE', text }", () => {
    capturedOnSubmit("Hello");
    const { cb } = lastSendMessageArgs;
    cb({ type: "RESPONSE", text: "Here is the answer." });
    expect(mockSetResponse).toHaveBeenCalledWith("Here is the answer.");
  });

  it("calls setError when callback receives { type: 'ERROR', message }", () => {
    capturedOnSubmit("Hello");
    const { cb } = lastSendMessageArgs;
    cb({ type: "ERROR", message: "Something went wrong." });
    expect(mockSetError).toHaveBeenCalledWith("Something went wrong.");
  });

  it("calls setError with API key message when callback receives { type: 'NO_API_KEY' }", () => {
    capturedOnSubmit("Hello");
    const { cb } = lastSendMessageArgs;
    cb({ type: "NO_API_KEY" });
    expect(mockSetError).toHaveBeenCalledWith(
      "Please configure your API key in the extension options."
    );
  });

  it("does not throw when callback receives null/undefined response", () => {
    capturedOnSubmit("Hello");
    const { cb } = lastSendMessageArgs;
    expect(() => cb(null)).not.toThrow();
    expect(() => cb(undefined)).not.toThrow();
  });
});

// ── 5. Streaming chunks (Req 5.5) ─────────────────────────────────────────────

describe("onMessage listener — streaming chunks (Req 5.5)", () => {
  it("registers an onMessage listener", () => {
    expect(onMessageListener).toBeTypeOf("function");
  });

  it("calls appendChunk when a STREAM_CHUNK message is received", () => {
    onMessageListener({ type: "STREAM_CHUNK", delta: "Hello " });
    expect(mockAppendChunk).toHaveBeenCalledWith("Hello ");
  });

  it("accumulates multiple STREAM_CHUNK messages", () => {
    onMessageListener({ type: "STREAM_CHUNK", delta: "foo" });
    onMessageListener({ type: "STREAM_CHUNK", delta: "bar" });
    expect(mockAppendChunk).toHaveBeenCalledTimes(2);
    expect(mockAppendChunk).toHaveBeenNthCalledWith(1, "foo");
    expect(mockAppendChunk).toHaveBeenNthCalledWith(2, "bar");
  });

  it("ignores non-STREAM_CHUNK message types", () => {
    onMessageListener({ type: "RESPONSE", text: "hi" });
    expect(mockAppendChunk).not.toHaveBeenCalled();
  });
});
