/**
 * ChatUI — manages the Shadow DOM chat panel lifecycle and user interactions.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5
 */

const PANEL_CSS = `
  :host {
    all: initial;
  }

  #kiro-panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 320px;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    color: #111827;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #kiro-panel.kiro-hidden {
    display: none;
  }

  #kiro-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #1d4ed8;
    color: #ffffff;
    cursor: default;
  }

  #kiro-title {
    font-weight: 600;
    font-size: 14px;
  }

  #kiro-collapse-btn {
    background: none;
    border: none;
    color: #ffffff;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 2px;
  }

  #kiro-collapse-btn:hover {
    opacity: 0.8;
  }

  #kiro-response {
    min-height: 80px;
    max-height: 240px;
    overflow-y: auto;
    padding: 12px 14px;
    white-space: pre-wrap;
    word-break: break-word;
    color: #374151;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    flex: 1;
  }

  #kiro-response.kiro-error {
    color: #dc2626;
    border: 1px solid #fca5a5;
    background: #fff1f2;
  }

  #kiro-input-row {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    background: #ffffff;
  }

  #kiro-input {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    outline: none;
    color: #111827;
    background: #ffffff;
  }

  #kiro-input:focus {
    border-color: #1d4ed8;
  }

  #kiro-submit-btn {
    background: #1d4ed8;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }

  #kiro-submit-btn:hover {
    background: #1e40af;
  }

  #kiro-icon {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    background: #1d4ed8;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    z-index: 2147483647;
    color: #ffffff;
    font-size: 22px;
    border: none;
  }

  #kiro-icon.kiro-hidden {
    display: none;
  }
`;

const PANEL_HTML = `
  <style>${PANEL_CSS}</style>
  <div id="kiro-panel">
    <div id="kiro-header">
      <span id="kiro-title">AI Assistant</span>
      <button id="kiro-collapse-btn" title="Collapse">−</button>
    </div>
    <div id="kiro-response"></div>
    <div id="kiro-input-row">
      <input id="kiro-input" type="text" placeholder="Ask something…" />
      <button id="kiro-submit-btn">Send</button>
    </div>
  </div>
  <button id="kiro-icon" class="kiro-hidden" title="Open AI Assistant">💬</button>
`;

class ChatUI {
  constructor() {
    /** @type {ShadowRoot|null} */
    this._root = null;
    /** @type {Function|null} Callback invoked with the input value on submit */
    this.onSubmit = null;
  }

  /**
   * Render the panel HTML inside the provided shadow root and wire up events.
   * @param {ShadowRoot} shadowRoot
   */
  mount(shadowRoot) {
    this._root = shadowRoot;
    shadowRoot.innerHTML = PANEL_HTML;

    const submitBtn = shadowRoot.getElementById("kiro-submit-btn");
    const input = shadowRoot.getElementById("kiro-input");
    const collapseBtn = shadowRoot.getElementById("kiro-collapse-btn");
    const icon = shadowRoot.getElementById("kiro-icon");

    submitBtn.addEventListener("click", () => this._handleSubmit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._handleSubmit();
    });
    collapseBtn.addEventListener("click", () => this.collapse());
    icon.addEventListener("click", () => this.expand());
  }

  /** Collapse to compact icon without removing from DOM. */
  collapse() {
    if (!this._root) return;
    this._root.getElementById("kiro-panel").classList.add("kiro-hidden");
    this._root.getElementById("kiro-icon").classList.remove("kiro-hidden");
  }

  /** Expand back to full panel. */
  expand() {
    if (!this._root) return;
    this._root.getElementById("kiro-panel").classList.remove("kiro-hidden");
    this._root.getElementById("kiro-icon").classList.add("kiro-hidden");
  }

  /**
   * Display a status/loading message in the response area.
   * @param {string} message
   */
  setLoading(message) {
    if (!this._root) return;
    const area = this._root.getElementById("kiro-response");
    area.classList.remove("kiro-error");
    area.textContent = message;
  }

  /**
   * Replace the response area content with the full response text.
   * Line breaks in the text are preserved via white-space: pre-wrap.
   * @param {string} text
   */
  setResponse(text) {
    if (!this._root) return;
    const area = this._root.getElementById("kiro-response");
    area.classList.remove("kiro-error");
    area.textContent = text;
  }

  /**
   * Append a streaming token delta to the response area.
   * @param {string} delta
   */
  appendChunk(delta) {
    if (!this._root) return;
    const area = this._root.getElementById("kiro-response");
    area.classList.remove("kiro-error");
    area.textContent += delta;
  }

  /**
   * Display an error message with red styling.
   * @param {string} message
   */
  setError(message) {
    if (!this._root) return;
    const area = this._root.getElementById("kiro-response");
    area.classList.add("kiro-error");
    area.textContent = message;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _handleSubmit() {
    if (!this._root) return;
    const input = this._root.getElementById("kiro-input");
    const value = input.value.trim();
    if (!value) return;
    if (typeof this.onSubmit === "function") {
      this.onSubmit(value);
    }
    input.value = "";
  }
}

export default ChatUI;
