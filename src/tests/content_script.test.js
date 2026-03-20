/**
 * Unit tests for content_script.js — injection guard, UI wiring, and message handling.
 * Requirements: 2.1, 2.7, 4.1, 5.1, 5.2, 5.4, 5.5, 7.5
 *
 * content_script.js is self-contained — it uses globalThis.chrome directly
 * and inlines ChatUI + ContextExtractor. We test via DOM state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Captured state ────────────────────────────────────────────────────────────
let onMessageListener = null;
let lastSentMessage = null;
let lastSentCallback = null;

// ── Wire globalThis.chrome before each fresh import ───────────────────────────
function setupChrome() {
  onMessageListener = null;
  lastSentMessage = null;
  lastSentCallback = null;

  globalThis.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        lastSentMessage = msg;
        lastSentCallback = cb;
      },
      onMessage: {
        addListener: (fn) => { onMessageListener = fn; },
      },
    },
    storage: { local: { get: () => Promise.resolve({}) } },
    tabs: {
      sendMessage: vi.fn(),
      onRemoved: { addListener: vi.fn() },
    },
    webNavigation: { onCommitted: { addListener: vi.fn() } },
  };
}

// ── Helper: load a fresh content_script into a clean DOM ─────────────────────
async function loadContentScript() {
  // Remove any existing sentinel
  document.querySelectorAll("[data-kiro-injected]").forEach(el => el.remove());

  setupChrome();
  vi.resetModules();

  await import("../content_script.js");
}

// ── Helper: get the shadow root of the injected host ─────────────────────────
function getShadow() {
  const host = document.querySelector("[data-kiro-injected]");
  return host ? host.shadowRoot : null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(async () => {
  await loadContentScript();
});

// ── 1. Injection guard (Req 2.7) ──────────────────────────────────────────────

describe("Duplicate injection guard (Req 2.7)", () => {
  it("injects a host element with data-kiro-injected attribute", () => {
    expect(document.querySelector("[data-kiro-injected]")).not.toBeNull();
  });

  it("does not inject a second host element when sentinel already exists", async () => {
    // sentinel already in DOM from beforeEach — re-import should be a no-op
    vi.resetModules();
    await import("../content_script.js");

    const sentinels = document.querySelectorAll("[data-kiro-injected]");
    expect(sentinels.length).toBe(1);
  });
});

// ── 2. Shadow DOM setup (Req 2.1) ─────────────────────────────────────────────

describe("Shadow DOM setup (Req 2.1)", () => {
  it("appends the host element to document.body", () => {
    const host = document.querySelector("[data-kiro-injected]");
    expect(document.body.contains(host)).toBe(true);
  });

  it("creates a shadow root on the host element", () => {
    const host = document.querySelector("[data-kiro-injected]");
    expect(host.shadowRoot).not.toBeNull();
  });

  it("renders the launcher button inside the shadow root", () => {
    const shadow = getShadow();
    expect(shadow.getElementById("kiro-launcher")).not.toBeNull();
  });

  it("renders the chat panel inside the shadow root", () => {
    const shadow = getShadow();
    expect(shadow.getElementById("kiro-panel")).not.toBeNull();
  });
});

// ── 3. Submit handler (Req 4.1, 5.1) ─────────────────────────────────────────

describe("Submit handler (Req 4.1, 5.1)", () => {
  function submitMessage(text) {
    const shadow = getShadow();
    const input = shadow.getElementById("kiro-input");
    input.value = text;
    shadow.getElementById("kiro-send-btn").click();
  }

  it("sends a PROMPT message via chrome.runtime.sendMessage on submit", () => {
    submitMessage("What is this page?");
    expect(lastSentMessage).not.toBeNull();
    expect(lastSentMessage.type).toBe("PROMPT");
    expect(lastSentMessage.prompt).toBe("What is this page?");
  });

  it("includes context in the sent message", () => {
    submitMessage("Tell me more");
    expect(lastSentMessage.context).toBeDefined();
    expect(lastSentMessage.context.platform).toBeDefined();
  });

  it("shows the typing indicator while waiting for response", () => {
    submitMessage("Summarize this");
    const shadow = getShadow();
    const typing = shadow.getElementById("kiro-typing");
    expect(typing.classList.contains("visible")).toBe(true);
  });

  it("adds the user message as a bubble in the chat", () => {
    submitMessage("Hello there");
    const shadow = getShadow();
    const userBubbles = shadow.querySelectorAll(".kiro-msg.user .kiro-bubble");
    expect(userBubbles.length).toBeGreaterThan(0);
    expect(userBubbles[userBubbles.length - 1].textContent).toBe("Hello there");
  });

  it("clears the input after submit", () => {
    const shadow = getShadow();
    const input = shadow.getElementById("kiro-input");
    input.value = "test message";
    shadow.getElementById("kiro-send-btn").click();
    expect(input.value).toBe("");
  });
});

// ── 4. Response handling (Req 5.2, 5.4, 7.5) ─────────────────────────────────

describe("sendMessage callback — response handling", () => {
  function submitAndGetCallback(text = "Hello") {
    const shadow = getShadow();
    const input = shadow.getElementById("kiro-input");
    input.value = text;
    shadow.getElementById("kiro-send-btn").click();
    return lastSentCallback;
  }

  it("adds an assistant bubble when callback receives { type: 'RESPONSE', text }", () => {
    const cb = submitAndGetCallback("Hello");
    cb({ type: "RESPONSE", text: "Here is the answer." });

    const shadow = getShadow();
    const assistantBubbles = shadow.querySelectorAll(".kiro-msg.assistant .kiro-bubble");
    expect(assistantBubbles.length).toBeGreaterThan(0);
    expect(assistantBubbles[assistantBubbles.length - 1].textContent).toBe("Here is the answer.");
  });

  it("adds an error bubble when callback receives { type: 'ERROR', message }", () => {
    const cb = submitAndGetCallback("Hello");
    cb({ type: "ERROR", message: "Something went wrong." });

    const shadow = getShadow();
    const errorBubbles = shadow.querySelectorAll(".kiro-bubble.kiro-error");
    expect(errorBubbles.length).toBeGreaterThan(0);
    expect(errorBubbles[errorBubbles.length - 1].textContent).toBe("Something went wrong.");
  });

  it("adds an API key error bubble when callback receives { type: 'NO_API_KEY' }", () => {
    const cb = submitAndGetCallback("Hello");
    cb({ type: "NO_API_KEY" });

    const shadow = getShadow();
    const errorBubbles = shadow.querySelectorAll(".kiro-bubble.kiro-error");
    expect(errorBubbles.length).toBeGreaterThan(0);
    expect(errorBubbles[errorBubbles.length - 1].textContent).toContain("API key");
  });

  it("does not throw when callback receives null/undefined response", () => {
    const cb = submitAndGetCallback("Hello");
    expect(() => cb(null)).not.toThrow();
    expect(() => cb(undefined)).not.toThrow();
  });

  it("hides the typing indicator after receiving a response", () => {
    const cb = submitAndGetCallback("Hello");
    cb({ type: "RESPONSE", text: "Done." });

    const shadow = getShadow();
    const typing = shadow.getElementById("kiro-typing");
    expect(typing.classList.contains("visible")).toBe(false);
  });
});

// ── 5. Streaming chunks (Req 5.5) ─────────────────────────────────────────────

describe("onMessage listener — streaming chunks (Req 5.5)", () => {
  it("registers an onMessage listener", () => {
    expect(onMessageListener).toBeTypeOf("function");
  });

  it("appends chunk text to a streaming bubble on STREAM_CHUNK", () => {
    // First submit to set up the UI state
    const shadow = getShadow();
    const input = shadow.getElementById("kiro-input");
    input.value = "stream test";
    shadow.getElementById("kiro-send-btn").click();

    onMessageListener({ type: "STREAM_CHUNK", delta: "Hello " });
    onMessageListener({ type: "STREAM_CHUNK", delta: "world" });

    const assistantBubbles = shadow.querySelectorAll(".kiro-msg.assistant .kiro-bubble");
    expect(assistantBubbles.length).toBeGreaterThan(0);
    expect(assistantBubbles[assistantBubbles.length - 1].textContent).toBe("Hello world");
  });

  it("ignores non-STREAM_CHUNK message types", () => {
    const shadow = getShadow();
    const before = shadow.querySelectorAll(".kiro-msg.assistant").length;
    onMessageListener({ type: "RESPONSE", text: "hi" });
    const after = shadow.querySelectorAll(".kiro-msg.assistant").length;
    expect(after).toBe(before);
  });
});
