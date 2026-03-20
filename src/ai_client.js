/**
 * AI Client module — abstracts over Groq and Hugging Face APIs.
 * Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 7.4
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama3-8b-8192";
const DEFAULT_TIMEOUT_MS = 30000;

class AIClient {
  /**
   * Send a non-streaming completion request.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} config
   * @param {string} config.provider - "groq" | "huggingface"
   * @param {string} config.apiKey
   * @param {string} [config.model]
   * @param {number} [config.timeoutMs]
   * @returns {Promise<string>} generated text or error message
   */
  async complete(messages, config) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    try {
      const { url, body } = this._buildRequest(messages, config, false);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return await this._extractErrorMessage(response);
      }

      const data = await response.json();
      return this._extractSuccessText(data, config.provider);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        return "Request timed out. Please try again.";
      }
      return err.message || "An unexpected error occurred.";
    }
  }

  /**
   * Send a streaming completion request (Groq only).
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} config
   * @param {Function} onChunk - called with each text delta
   * @returns {Promise<void>}
   */
  async stream(messages, config, onChunk) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    try {
      const { url, body } = this._buildRequest(messages, config, true);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMsg = await this._extractErrorMessage(response);
        throw new Error(errorMsg);
      }

      await this._parseSSEStream(response, onChunk);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }
      throw err;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  _buildRequest(messages, config, streaming) {
    if (config.provider === "huggingface") {
      const model = config.model || "gpt2";
      return {
        url: `https://api-inference.huggingface.co/models/${model}`,
        body: {
          inputs: messages[messages.length - 1].content,
          parameters: { max_new_tokens: 512 },
        },
      };
    }

    // Default: Groq
    return {
      url: GROQ_URL,
      body: {
        model: config.model || DEFAULT_GROQ_MODEL,
        messages,
        stream: streaming,
      },
    };
  }

  async _extractErrorMessage(response) {
    const status = response.status;
    try {
      const errData = await response.json();
      const msg =
        errData?.error?.message ||
        errData?.error ||
        errData?.message ||
        response.statusText ||
        "Unknown error";
      return `API error (${status}): ${msg}`;
    } catch {
      return `API error (${status}): ${response.statusText || "Unknown error"}`;
    }
  }

  _extractSuccessText(data, provider) {
    if (provider === "huggingface") {
      return (
        (Array.isArray(data) ? data[0]?.generated_text : data?.generated_text) ?? ""
      );
    }
    // Groq / OpenAI-compatible
    return data?.choices?.[0]?.message?.content ?? "";
  }

  async _parseSSEStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const payload = trimmed.slice("data: ".length);
        if (payload === "[DONE]") return;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }
}

export default AIClient;
