/**
 * Unit tests for ChatUI — state transitions and DOM behaviour.
 * Requirements: 2.3, 2.4, 2.5, 5.1, 5.2, 5.4, 5.5
 */

import { describe, it, expect } from "vitest";
import ChatUI from "../chat_ui.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a minimal Shadow DOM host and mount a fresh ChatUI into it.
 * jsdom supports attachShadow, so this works in the test environment.
 */
function createMountedUI() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const ui = new ChatUI();
  ui.mount(shadowRoot);
  return { ui, shadowRoot, host };
}

// ── mount ─────────────────────────────────────────────────────────────────────

describe("mount(shadowRoot)", () => {
  it("renders an input field inside the shadow root", () => {
    const { shadowRoot } = createMountedUI();
    expect(shadowRoot.getElementById("kiro-input")).not.toBeNull();
  });

  it("renders a submit button inside the shadow root", () => {
    const { shadowRoot } = createMountedUI();
    expect(shadowRoot.getElementById("kiro-submit-btn")).not.toBeNull();
  });

  it("renders a response area inside the shadow root", () => {
    const { shadowRoot } = createMountedUI();
    expect(shadowRoot.getElementById("kiro-response")).not.toBeNull();
  });

  it("renders a collapse toggle button inside the shadow root", () => {
    const { shadowRoot } = createMountedUI();
    expect(shadowRoot.getElementById("kiro-collapse-btn")).not.toBeNull();
  });

  it("renders a compact icon element inside the shadow root", () => {
    const { shadowRoot } = createMountedUI();
    expect(shadowRoot.getElementById("kiro-icon")).not.toBeNull();
  });
});

// ── collapse / expand ─────────────────────────────────────────────────────────

describe("collapse() / expand() — DOM node preserved (Req 2.4, 2.5)", () => {
  it("collapse() hides the panel but keeps it in the DOM", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.collapse();
    const panel = shadowRoot.getElementById("kiro-panel");
    expect(panel).not.toBeNull(); // still in DOM
    expect(panel.classList.contains("kiro-hidden")).toBe(true);
  });

  it("collapse() shows the compact icon", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.collapse();
    const icon = shadowRoot.getElementById("kiro-icon");
    expect(icon.classList.contains("kiro-hidden")).toBe(false);
  });

  it("expand() shows the panel again", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.collapse();
    ui.expand();
    const panel = shadowRoot.getElementById("kiro-panel");
    expect(panel.classList.contains("kiro-hidden")).toBe(false);
  });

  it("expand() hides the compact icon", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.collapse();
    ui.expand();
    const icon = shadowRoot.getElementById("kiro-icon");
    expect(icon.classList.contains("kiro-hidden")).toBe(true);
  });

  it("panel node identity is preserved across collapse/expand", () => {
    const { ui, shadowRoot } = createMountedUI();
    const panelBefore = shadowRoot.getElementById("kiro-panel");
    ui.collapse();
    ui.expand();
    const panelAfter = shadowRoot.getElementById("kiro-panel");
    expect(panelBefore).toBe(panelAfter);
  });
});

// ── setLoading ────────────────────────────────────────────────────────────────

describe("setLoading(message) (Req 5.1)", () => {
  it("displays the loading message in the response area", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setLoading("Analyzing page…");
    expect(shadowRoot.getElementById("kiro-response").textContent).toBe("Analyzing page…");
  });

  it("clears the error styling when called after setError", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setError("oops");
    ui.setLoading("Loading…");
    expect(shadowRoot.getElementById("kiro-response").classList.contains("kiro-error")).toBe(false);
  });
});

// ── setResponse ───────────────────────────────────────────────────────────────

describe("setResponse(text) — replaces loading message (Req 5.2, 5.3)", () => {
  it("replaces loading message with response text", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setLoading("Generating response…");
    ui.setResponse("Here is your answer.");
    expect(shadowRoot.getElementById("kiro-response").textContent).toBe("Here is your answer.");
  });

  it("preserves line breaks via textContent (white-space: pre-wrap handles rendering)", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setResponse("Line one\nLine two\nLine three");
    expect(shadowRoot.getElementById("kiro-response").textContent).toBe("Line one\nLine two\nLine three");
  });

  it("clears error styling when called after setError", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setError("bad");
    ui.setResponse("good");
    expect(shadowRoot.getElementById("kiro-response").classList.contains("kiro-error")).toBe(false);
  });
});

// ── appendChunk ───────────────────────────────────────────────────────────────

describe("appendChunk(delta) — streaming accumulation (Req 5.5)", () => {
  it("appends delta text to the response area", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setResponse("");
    ui.appendChunk("Hello");
    ui.appendChunk(", ");
    ui.appendChunk("world!");
    expect(shadowRoot.getElementById("kiro-response").textContent).toBe("Hello, world!");
  });

  it("accumulates multiple chunks correctly", () => {
    const { ui, shadowRoot } = createMountedUI();
    const chunks = ["The ", "quick ", "brown ", "fox"];
    chunks.forEach((c) => ui.appendChunk(c));
    expect(shadowRoot.getElementById("kiro-response").textContent).toBe("The quick brown fox");
  });
});

// ── setError ──────────────────────────────────────────────────────────────────

describe("setError(message) — visual distinction (Req 5.4)", () => {
  it("displays the error message in the response area", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setError("Something went wrong.");
    expect(shadowRoot.getElementById("kiro-response").textContent).toBe("Something went wrong.");
  });

  it("applies kiro-error class for visual distinction", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.setError("Network error");
    expect(shadowRoot.getElementById("kiro-response").classList.contains("kiro-error")).toBe(true);
  });
});

// ── onSubmit callback ─────────────────────────────────────────────────────────

describe("onSubmit callback", () => {
  it("calls onSubmit with the input value when submit button is clicked", () => {
    const { ui, shadowRoot } = createMountedUI();
    let received = null;
    ui.onSubmit = (val) => { received = val; };
    const input = shadowRoot.getElementById("kiro-input");
    input.value = "What is this page about?";
    shadowRoot.getElementById("kiro-submit-btn").click();
    expect(received).toBe("What is this page about?");
  });

  it("clears the input field after submit", () => {
    const { ui, shadowRoot } = createMountedUI();
    ui.onSubmit = () => {};
    const input = shadowRoot.getElementById("kiro-input");
    input.value = "Hello";
    shadowRoot.getElementById("kiro-submit-btn").click();
    expect(input.value).toBe("");
  });

  it("does not call onSubmit when input is empty", () => {
    const { ui, shadowRoot } = createMountedUI();
    let called = false;
    ui.onSubmit = () => { called = true; };
    shadowRoot.getElementById("kiro-input").value = "   ";
    shadowRoot.getElementById("kiro-submit-btn").click();
    expect(called).toBe(false);
  });
});
