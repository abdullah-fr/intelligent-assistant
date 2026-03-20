/**
 * background.js — fully self-contained service worker (no ES module imports).
 * Inlines: browser_shim, session_memory, prompt_builder, ai_client
 * Requirements: 4.1–4.7, 6.1–6.5
 */

// ── Browser shim ──────────────────────────────────────────────────────────────
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// ── SessionMemory ─────────────────────────────────────────────────────────────
const MAX_TURNS = 20;
class SessionMemory {
  constructor() { this._store = new Map(); }
  getHistory(tabId) { return this._store.get(tabId) || []; }
  addTurn(tabId, turn) {
    if (!this._store.has(tabId)) this._store.set(tabId, []);
    const h = this._store.get(tabId);
    h.push(turn);
    while (h.length > MAX_TURNS) h.shift();
  }
  clearTab(tabId) { this._store.delete(tabId); }
}

// ── PromptBuilder ─────────────────────────────────────────────────────────────
class PromptBuilder {
  build(context, history, userPrompt) {
    const { platform, pageType, ...fields } = context;
    const serialized = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const systemContent =
      `You are a helpful assistant with access to the current page content and general knowledge.\n` +
      `The user is on: ${platform} page (${pageType}) — ${fields.title || ""}\n\n` +
      `Current page data:\n${serialized}\n\n` +
      `Answer using the page data when it contains the answer. For questions about the broader website or things not on this specific page, use your general knowledge and clearly say so.`;
    return [{ role: "system", content: systemContent }, ...history, { role: "user", content: userPrompt }];
  }
}

// ── AIClient ──────────────────────────────────────────────────────────────────
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT = 30000;

class AIClient {
  async complete(messages, config) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT);
    try {
      const { url, body } = this._buildRequest(messages, config, false);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!res.ok) return await this._errorMsg(res);
      const data = await res.json();
      return this._successText(data, config.provider);
    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError") return "Request timed out. Please try again.";
      return err.message || "An unexpected error occurred.";
    }
  }

  async stream(messages, config, onChunk) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT);
    try {
      const { url, body } = this._buildRequest(messages, config, true);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(await this._errorMsg(res));
      await this._parseSSE(res, onChunk);
    } catch (err) {
      clearTimeout(tid);
      if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
      throw err;
    }
  }

  _buildRequest(messages, config, streaming) {
    if (config.provider === "huggingface") {
      return {
        url: `https://api-inference.huggingface.co/models/${config.model || "gpt2"}`,
        body: { inputs: messages[messages.length - 1].content, parameters: { max_new_tokens: 512 } },
      };
    }
    return { url: GROQ_URL, body: { model: config.model || DEFAULT_MODEL, messages, stream: streaming } };
  }

  async _errorMsg(res) {
    try {
      const d = await res.json();
      const m = d?.error?.message || d?.error || d?.message || res.statusText || "Unknown error";
      return `API error (${res.status}): ${m}`;
    } catch { return `API error (${res.status}): ${res.statusText || "Unknown error"}`; }
  }

  _successText(data, provider) {
    if (provider === "huggingface")
      return (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text) ?? "";
    return data?.choices?.[0]?.message?.content ?? "";
  }

  async _parseSSE(res, onChunk) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data: ")) continue;
        const payload = t.slice(6);
        if (payload === "[DONE]") return;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch { /* ignore malformed */ }
      }
    }
  }
}

// ── Runtime ───────────────────────────────────────────────────────────────────
const memory = new SessionMemory();
const promptBuilder = new PromptBuilder();
const aiClient = new AIClient();

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "PROMPT") return false;
  const tabId = sender.tab?.id;
  (async () => {
    const { apiKey, provider, model, stream: streamEnabled } =
      await browserAPI.storage.local.get(["apiKey", "provider", "model", "stream"]);
    if (!apiKey) { sendResponse({ type: "NO_API_KEY" }); return; }
    const { prompt, context } = message;
    const history = memory.getHistory(tabId);
    const messages = promptBuilder.build(context, history, prompt);
    const config = {
      provider: provider || "groq",
      apiKey,
      model: model || (provider === "huggingface" ? undefined : "llama-3.3-70b-versatile"),
      timeoutMs: 30000,
    };
    try {
      if (streamEnabled && provider !== "huggingface") {
        let fullText = "";
        await aiClient.stream(messages, config, (delta) => {
          fullText += delta;
          browserAPI.tabs.sendMessage(tabId, { type: "STREAM_CHUNK", delta });
        });
        memory.addTurn(tabId, { role: "user", content: prompt });
        memory.addTurn(tabId, { role: "assistant", content: fullText });
        browserAPI.tabs.sendMessage(tabId, { type: "RESPONSE", text: "" });
      } else {
        const text = await aiClient.complete(messages, config);
        memory.addTurn(tabId, { role: "user", content: prompt });
        memory.addTurn(tabId, { role: "assistant", content: text });
        sendResponse({ type: "RESPONSE", text });
      }
    } catch (err) {
      sendResponse({ type: "ERROR", message: err.message || "An unexpected error occurred." });
    }
  })();
  return true;
});

browserAPI.tabs.onRemoved.addListener((tabId) => memory.clearTab(tabId));
if (browserAPI.webNavigation) {
  browserAPI.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) memory.clearTab(details.tabId);
  });
}
