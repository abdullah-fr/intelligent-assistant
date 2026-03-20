/**
 * content_script.js — self-contained, no ES module imports.
 * Modern chat UI with conversation history display.
 */

// ── Browser shim ──────────────────────────────────────────────────────────────
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// ── ContextExtractor ──────────────────────────────────────────────────────────
const ECOMMERCE_HOSTNAMES = [
  "amazon.com","ebay.com","etsy.com","shopify.com","walmart.com",
  "target.com","bestbuy.com","newegg.com","wayfair.com","homedepot.com",
  "costco.com","macys.com","nordstrom.com","zappos.com","overstock.com",
];
const BLOG_HOSTNAMES = [
  "medium.com","wordpress.com","blogger.com","substack.com",
  "ghost.io","tumblr.com","dev.to","hashnode.com",
];
const BLOG_PATH_PATTERNS = [/\/blog\//i,/\/article\//i,/\/post\//i,/\/articles\//i,/\/posts\//i];

function _isVisible(el) {
  try { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden"; }
  catch { return false; }
}
function _firstVisibleText(selector) {
  for (const el of document.querySelectorAll(selector)) {
    if (_isVisible(el)) { const t = el.textContent.trim(); if (t) return t; }
  }
  return "";
}
function _allVisibleText(selector) {
  const r = [];
  for (const el of document.querySelectorAll(selector)) {
    if (_isVisible(el)) { const t = el.textContent.trim(); if (t) r.push(t); }
  }
  return r.join(", ");
}
function _visibleBodySnippet(max = 500) {
  // Skip nav/header/footer, grab content area text
  const SKIP = new Set(["script","style","noscript","iframe","svg","canvas","nav","header","footer"]);

  // Try to find the main content area first
  const main = document.querySelector("main, #main, #content, .main, .content, [role='main']");
  const root = main || document.body;

  const parts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el && el !== root) {
        if (SKIP.has(el.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  let total = 0;
  while ((node = walker.nextNode())) {
    const chunk = node.textContent.replace(/\s+/g, " ").trim();
    if (!chunk) continue;
    parts.push(chunk);
    total += chunk.length;
    if (total >= max) break;
  }
  // Also append image alt texts
  const alts = Array.from(root.querySelectorAll("img[alt]"))
    .map(img => img.alt.trim()).filter(Boolean).join(" ");
  return (parts.join(" ") + " " + alts).trim().slice(0, max);
}

class ContextExtractor {
  extract() {
    const p = this._detectPlatform();
    if (p === "linkedin") return this._linkedin();
    if (p === "ecommerce") return this._ecommerce();
    if (p === "blog") return this._blog();
    return this._generic();
  }
  _detectPlatform() {
    const h = location.hostname.replace(/^www\./, "");
    const path = location.pathname;
    if (h === "linkedin.com" || h.endsWith(".linkedin.com")) return "linkedin";
    if (ECOMMERCE_HOSTNAMES.some(d => h === d || h.endsWith("." + d))) return "ecommerce";
    if (BLOG_HOSTNAMES.some(d => h === d || h.endsWith("." + d))) return "blog";
    if (BLOG_PATH_PATTERNS.some(re => re.test(path))) return "blog";
    if (document.querySelector('[itemtype*="Product"]')) return "ecommerce";
    // Detect listing/ecommerce pages by presence of price-like elements
    if (document.querySelector('[class*="price"],[class*="Price"],[class*="cost"],[class*="amount"]')) return "ecommerce";
    if (document.querySelector("article")) return "blog";
    return "generic";
  }
  _linkedin() {
    return { platform: "linkedin", pageType: "profile",
      name: String(_firstVisibleText(".text-heading-xlarge") || _firstVisibleText("h1")),
      role: String(_firstVisibleText(".text-body-medium.break-words")),
      company: String(_firstVisibleText(".pv-text-details__right-panel-item-text")),
      summary: String(_firstVisibleText('[data-field="summary"]')),
    };
  }
  _ecommerce() {
    const listings = this._extractListings();
    if (listings.length > 0) {
      return {
        platform: "ecommerce", pageType: "listing",
        title: String(document.title),
        items: listings.slice(0, 30).map(i => `${i.name}: ${i.price}${i.stars ? ` (${i.stars})` : ""}`).join(" | "),
        snippet: String(_visibleBodySnippet(12000)),
      };
    }
    return { platform: "ecommerce", pageType: "product",
      productName: String(_firstVisibleText('[itemprop="name"]') || _firstVisibleText("h1")),
      price: String(_firstVisibleText('[itemprop="price"]') || _firstVisibleText('[class*="price"],[class*="Price"]')),
      description: String(_firstVisibleText('[itemprop="description"]')),
      snippet: String(_visibleBodySnippet(12000)),
    };
  }
  _extractListings() {
    const results = [];
    const seen = new Set();
    // Only look at elements with price-like text that are small/leaf nodes
    const PRICE_RE = /(?:PKR|Rs\.?|USD|\$|£|€)\s*[\d,.]+|[\d,.]+\s*(?:lacs?|lakhs?|crore)/i;

    // Walk all elements, find ones whose direct text (not children) looks like a price
    const allEls = Array.from(document.querySelectorAll("*"));
    for (const el of allEls) {
      if (!_isVisible(el)) continue;
      // Only consider leaf-ish nodes (not containers with many children)
      if (el.children.length > 4) continue;
      const ownText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).join(" ");
      if (!PRICE_RE.test(ownText)) continue;

      const price = ownText.trim();
      // Walk up max 8 levels to find a card container with a name
      let container = el.parentElement;
      let name = "";
      for (let i = 0; i < 8 && container && container !== document.body; i++) {
        const heading = container.querySelector("h1,h2,h3,h4");
        if (heading && _isVisible(heading)) {
          const t = heading.textContent.trim();
          if (t && t !== price && t.length < 100 && !seen.has(t)) {
            name = t;
            break;
          }
        }
        container = container.parentElement;
      }
      if (name) {
        seen.add(name);
        // Get star rating
        let stars = "";
        const starEl = container?.querySelector('[class*="star"],[class*="rating"],[class*="Star"],[class*="Rating"]');
        if (starEl) {
          const filled = (starEl.textContent.match(/★/g) || []).length;
          if (filled) stars = filled + " stars";
        }
        results.push({ name, price, stars });
        if (results.length >= 30) break;
      }
    }
    return results;
  }
  _blog() {
    return { platform: "blog", pageType: "article",
      title: String(document.title),
      headings: String(_allVisibleText("h1, h2")),
      snippet: String(_visibleBodySnippet(12000)),
    };
  }
  _generic() {
    return { platform: "generic", pageType: "page", title: String(document.title), snippet: String(_visibleBodySnippet(12000)) };
  }
}

// ── ChatUI ────────────────────────────────────────────────────────────────────
const PANEL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

  #kiro-launcher {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    box-shadow: 0 4px 20px rgba(99,102,241,0.5);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    transition: transform 0.2s, box-shadow 0.2s;
    color: white;
    font-size: 22px;
  }
  #kiro-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(99,102,241,0.65); }
  #kiro-launcher.kiro-hidden { display: none; }

  #kiro-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 380px;
    height: 560px;
    background: #0f0f13;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: opacity 0.2s, transform 0.2s;
  }
  #kiro-panel.kiro-hidden { display: none; }

  /* Header */
  #kiro-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: linear-gradient(135deg, #1e1b4b, #1a1a2e);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  #kiro-header-left { display: flex; align-items: center; gap: 10px; }
  #kiro-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0;
  }
  #kiro-title { font-size: 14px; font-weight: 600; color: #e2e8f0; letter-spacing: 0.01em; }
  #kiro-subtitle { font-size: 11px; color: #6366f1; margin-top: 1px; }
  #kiro-header-actions { display: flex; gap: 6px; }
  .kiro-icon-btn {
    background: rgba(255,255,255,0.06);
    border: none; border-radius: 8px;
    width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #94a3b8; font-size: 14px;
    transition: background 0.15s, color 0.15s;
  }
  .kiro-icon-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }

  /* Messages */
  #kiro-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    scroll-behavior: smooth;
  }
  #kiro-messages::-webkit-scrollbar { width: 4px; }
  #kiro-messages::-webkit-scrollbar-track { background: transparent; }
  #kiro-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

  .kiro-msg { display: flex; flex-direction: column; max-width: 88%; animation: kiro-fadein 0.2s ease; }
  @keyframes kiro-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  .kiro-msg.user { align-self: flex-end; align-items: flex-end; }
  .kiro-msg.assistant { align-self: flex-start; align-items: flex-start; }

  .kiro-bubble {
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 13.5px;
    line-height: 1.55;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .kiro-msg.user .kiro-bubble {
    background: linear-gradient(135deg, #6366f1, #7c3aed);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .kiro-msg.assistant .kiro-bubble {
    background: rgba(255,255,255,0.06);
    color: #e2e8f0;
    border: 1px solid rgba(255,255,255,0.07);
    border-bottom-left-radius: 4px;
  }
  .kiro-msg.assistant .kiro-bubble.kiro-error {
    background: rgba(239,68,68,0.1);
    border-color: rgba(239,68,68,0.3);
    color: #fca5a5;
  }
  .kiro-msg-time {
    font-size: 10px;
    color: #475569;
    margin-top: 3px;
    padding: 0 2px;
  }

  /* Typing indicator */
  #kiro-typing {
    display: none;
    align-self: flex-start;
    padding: 10px 14px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    border-bottom-left-radius: 4px;
    gap: 5px;
    align-items: center;
  }
  #kiro-typing.visible { display: flex; }
  .kiro-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #6366f1;
    animation: kiro-bounce 1.2s infinite;
  }
  .kiro-dot:nth-child(2) { animation-delay: 0.2s; }
  .kiro-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes kiro-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
    30% { transform: translateY(-5px); opacity: 1; }
  }

  /* Empty state */
  #kiro-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #475569;
    font-size: 13px;
    text-align: center;
    padding: 20px;
  }
  #kiro-empty-icon { font-size: 36px; opacity: 0.4; }
  #kiro-empty-text { color: #64748b; line-height: 1.5; }

  /* Input area */
  #kiro-input-area {
    padding: 12px 14px;
    background: rgba(255,255,255,0.02);
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  #kiro-input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 8px 8px 8px 14px;
    transition: border-color 0.15s;
  }
  #kiro-input-row:focus-within { border-color: rgba(99,102,241,0.5); }
  #kiro-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-size: 13.5px;
    line-height: 1.5;
    resize: none;
    max-height: 100px;
    font-family: inherit;
    padding: 2px 0;
  }
  #kiro-input::placeholder { color: #475569; }
  #kiro-send-btn {
    width: 34px; height: 34px; flex-shrink: 0;
    background: linear-gradient(135deg, #6366f1, #7c3aed);
    border: none; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: white; font-size: 15px;
    transition: opacity 0.15s, transform 0.15s;
  }
  #kiro-send-btn:hover { opacity: 0.85; transform: scale(1.05); }
  #kiro-send-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
  #kiro-footer-hint {
    font-size: 10px; color: #334155; text-align: center; margin-top: 7px;
  }
`;

class ChatUI {
  constructor() {
    this._root = null;
    this.onSubmit = null;
    this._messages = []; // { role, content, time }
    this._streaming = false;
    this._streamingBubble = null;
  }

  mount(shadowRoot) {
    this._root = shadowRoot;
    shadowRoot.innerHTML = `<style>${PANEL_CSS}</style>
      <button id="kiro-launcher" title="AI Assistant">✦</button>
      <div id="kiro-panel" class="kiro-hidden">
        <div id="kiro-header">
          <div id="kiro-header-left">
            <div id="kiro-avatar">✦</div>
            <div>
              <div id="kiro-title">AI Assistant</div>
              <div id="kiro-subtitle">Powered by Groq</div>
            </div>
          </div>
          <div id="kiro-header-actions">
            <button class="kiro-icon-btn" id="kiro-clear-btn" title="Clear chat">🗑</button>
            <button class="kiro-icon-btn" id="kiro-collapse-btn" title="Minimize">−</button>
          </div>
        </div>
        <div id="kiro-messages">
          <div id="kiro-empty">
            <div id="kiro-empty-icon">✦</div>
            <div id="kiro-empty-text">Ask me anything about this page.<br/>I can summarize, explain, or answer questions.</div>
          </div>
        </div>
        <div id="kiro-typing"><div class="kiro-dot"></div><div class="kiro-dot"></div><div class="kiro-dot"></div></div>
        <div id="kiro-input-area">
          <div id="kiro-input-row">
            <textarea id="kiro-input" rows="1" placeholder="Ask something about this page…"></textarea>
            <button id="kiro-send-btn" title="Send">➤</button>
          </div>
          <div id="kiro-footer-hint">Press Enter to send · Shift+Enter for new line</div>
        </div>
      </div>`;

    this._root.getElementById("kiro-launcher").addEventListener("click", () => this.expand());
    this._root.getElementById("kiro-collapse-btn").addEventListener("click", () => this.collapse());
    this._root.getElementById("kiro-clear-btn").addEventListener("click", () => this._clearChat());
    this._root.getElementById("kiro-send-btn").addEventListener("click", () => this._handleSubmit());
    const input = this._root.getElementById("kiro-input");

    // Plain keydown — no capture needed on the element itself
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this._handleSubmit();
        return;
      }
      e.stopPropagation();
    });
    input.addEventListener("keyup", e => e.stopPropagation());
    input.addEventListener("keypress", e => e.stopPropagation());

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 100) + "px";
    });

    // Also stop mousedown on the input area to prevent focus stealing
    const inputArea = shadowRoot.getElementById("kiro-input-area");
    if (inputArea) {
      inputArea.addEventListener("mousedown", e => e.stopPropagation(), true);
    }
  }

  // Call this after mounting to attach host-level keyboard capture
  // (must be called with the host element so we can intercept before Discord)
  attachHostGuard(host) {
    // Bubble-phase listener on the host — fires after textarea handlers,
    // catches anything that bubbled up and stops it reaching the page.
    host.addEventListener("keydown", e => e.stopPropagation());
    host.addEventListener("keyup", e => e.stopPropagation());
    host.addEventListener("keypress", e => e.stopPropagation());
  }

  collapse() {
    if (!this._root) return;
    this._root.getElementById("kiro-panel").classList.add("kiro-hidden");
    this._root.getElementById("kiro-launcher").classList.remove("kiro-hidden");
  }

  expand() {
    if (!this._root) return;
    this._root.getElementById("kiro-panel").classList.remove("kiro-hidden");
    this._root.getElementById("kiro-launcher").classList.add("kiro-hidden");
    setTimeout(() => this._scrollToBottom(), 50);
  }

  setLoading() {
    if (!this._root) return;
    this._setSendDisabled(true);
    this._root.getElementById("kiro-typing").classList.add("visible");
    this._scrollToBottom();
  }

  setResponse(text) {
    if (!this._root) return;
    this._root.getElementById("kiro-typing").classList.remove("visible");
    this._setSendDisabled(false);
    if (this._streamingBubble) {
      // finalize streaming bubble
      this._streamingBubble.textContent = text || this._streamingBubble.textContent;
      this._streamingBubble = null;
      this._streaming = false;
    } else if (text) {
      this._addBubble("assistant", text);
    }
    this._scrollToBottom();
  }

  appendChunk(delta) {
    if (!this._root) return;
    this._root.getElementById("kiro-typing").classList.remove("visible");
    if (!this._streaming) {
      this._streaming = true;
      this._streamingBubble = this._addBubble("assistant", "");
    }
    if (this._streamingBubble) {
      this._streamingBubble.textContent += delta;
      this._scrollToBottom();
    }
  }

  setError(message) {
    if (!this._root) return;
    this._root.getElementById("kiro-typing").classList.remove("visible");
    this._setSendDisabled(false);
    this._streaming = false;
    this._streamingBubble = null;
    this._addBubble("assistant", message, true);
    this._scrollToBottom();
  }

  addUserMessage(text) {
    this._addBubble("user", text);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _addBubble(role, text, isError = false) {
    const container = this._root.getElementById("kiro-messages");
    const empty = this._root.getElementById("kiro-empty");
    if (empty) empty.remove();

    const wrap = document.createElement("div");
    wrap.className = `kiro-msg ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "kiro-bubble" + (isError ? " kiro-error" : "");
    bubble.textContent = text;

    const time = document.createElement("div");
    time.className = "kiro-msg-time";
    time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    wrap.appendChild(bubble);
    wrap.appendChild(time);
    container.appendChild(wrap);
    return bubble;
  }

  _clearChat() {
    if (!this._root) return;
    const container = this._root.getElementById("kiro-messages");
    container.innerHTML = `<div id="kiro-empty">
      <div id="kiro-empty-icon">✦</div>
      <div id="kiro-empty-text">Ask me anything about this page.<br/>I can summarize, explain, or answer questions.</div>
    </div>`;
    this._streaming = false;
    this._streamingBubble = null;
  }

  _setSendDisabled(disabled) {
    const btn = this._root.getElementById("kiro-send-btn");
    if (btn) btn.disabled = disabled;
  }

  _scrollToBottom() {
    const container = this._root.getElementById("kiro-messages");
    if (container) container.scrollTop = container.scrollHeight;
  }

  _handleSubmit() {
    if (!this._root) return;
    const input = this._root.getElementById("kiro-input");
    const value = input.value.trim();
    if (!value) return;
    this.addUserMessage(value);
    if (typeof this.onSubmit === "function") this.onSubmit(value);
    input.value = "";
    input.style.height = "auto";
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (!document.querySelector("[data-kiro-injected]")) {
  const host = document.createElement("div");
  host.setAttribute("data-kiro-injected", "true");
  const shadowRoot = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  const chatUI = new ChatUI();
  chatUI.mount(shadowRoot);
  chatUI.attachHostGuard(host);
  const extractor = new ContextExtractor();

  function handleResponse(response) {
    if (!response) return;
    if (response.type === "RESPONSE") chatUI.setResponse(response.text);
    else if (response.type === "ERROR") chatUI.setError(response.message);
    else if (response.type === "NO_API_KEY") chatUI.setError("Please configure your API key in the extension options.");
  }

  browserAPI.runtime.onMessage.addListener((message) => {
    if (message && message.type === "STREAM_CHUNK") chatUI.appendChunk(message.delta);
  });

  chatUI.onSubmit = (prompt) => {
    chatUI.setLoading();
    const context = extractor.extract();
    browserAPI.runtime.sendMessage({ type: "PROMPT", prompt, context }, handleResponse);
  };
}
