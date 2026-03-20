/**
 * Unit tests for AIClient error handling and response extraction.
 * Requirements: 4.4, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AIClient from "../ai_client.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides = {}) {
  return {
    provider: "groq",
    apiKey: "test-key",
    model: "llama3-8b-8192",
    timeoutMs: 30000,
    ...overrides,
  };
}

function mockFetch(responseInit) {
  global.fetch = vi.fn().mockResolvedValue(responseInit);
}

function mockFetchReject(error) {
  global.fetch = vi.fn().mockRejectedValue(error);
}

// ── complete() ────────────────────────────────────────────────────────────────

describe("AIClient.complete() — timeout (Req 4.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns timeout message when request exceeds timeoutMs", async () => {
    // fetch never resolves
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const client = new AIClient();
    const promise = client.complete([{ role: "user", content: "hi" }], makeConfig({ timeoutMs: 100 }));

    vi.advanceTimersByTime(200);

    const result = await promise;
    expect(result).toBe("Request timed out. Please try again.");
  });
});

describe("AIClient.complete() — HTTP errors (Req 4.5)", () => {
  it("returns descriptive message for 401 Unauthorized", async () => {
    mockFetch({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { message: "Invalid API key" } }),
    });

    const client = new AIClient();
    const result = await client.complete([{ role: "user", content: "hi" }], makeConfig());
    expect(result).toContain("401");
    expect(result).toContain("Invalid API key");
  });

  it("returns descriptive message for 429 rate limit", async () => {
    mockFetch({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ error: { message: "Rate limit exceeded" } }),
    });

    const client = new AIClient();
    const result = await client.complete([{ role: "user", content: "hi" }], makeConfig());
    expect(result).toContain("429");
    expect(result).toContain("Rate limit exceeded");
  });

  it("returns descriptive message for 500 when error body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => { throw new SyntaxError("not json"); },
    });

    const client = new AIClient();
    const result = await client.complete([{ role: "user", content: "hi" }], makeConfig());
    expect(result).toContain("500");
  });
});

describe("AIClient.complete() — success (Req 4.6)", () => {
  it("extracts generated text from Groq response", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello from Groq!" } }],
      }),
    });

    const client = new AIClient();
    const result = await client.complete([{ role: "user", content: "hi" }], makeConfig());
    expect(result).toBe("Hello from Groq!");
  });

  it("extracts generated_text from HuggingFace array response", async () => {
    mockFetch({
      ok: true,
      json: async () => [{ generated_text: "Hello from HF!" }],
    });

    const client = new AIClient();
    const result = await client.complete(
      [{ role: "user", content: "hi" }],
      makeConfig({ provider: "huggingface", model: "gpt2" })
    );
    expect(result).toBe("Hello from HF!");
  });

  it("extracts generated_text from HuggingFace object response", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ generated_text: "Hello from HF object!" }),
    });

    const client = new AIClient();
    const result = await client.complete(
      [{ role: "user", content: "hi" }],
      makeConfig({ provider: "huggingface", model: "gpt2" })
    );
    expect(result).toBe("Hello from HF object!");
  });

  it("uses the last message content as HuggingFace input", async () => {
    let capturedBody;
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: async () => [{ generated_text: "ok" }],
      });
    });

    const client = new AIClient();
    await client.complete(
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
        { role: "user", content: "last message" },
      ],
      makeConfig({ provider: "huggingface", model: "gpt2" })
    );

    expect(capturedBody.inputs).toBe("last message");
  });
});

// ── stream() ──────────────────────────────────────────────────────────────────

describe("AIClient.stream() — SSE parsing (Req 4.7)", () => {
  it("calls onChunk for each SSE delta and stops at [DONE]", async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      "data: [DONE]",
    ].join("\n");

    const encoder = new TextEncoder();
    const encoded = encoder.encode(sseLines);

    let readCount = 0;
    const reader = {
      read: vi.fn().mockImplementation(() => {
        if (readCount === 0) {
          readCount++;
          return Promise.resolve({ done: false, value: encoded });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    });

    const client = new AIClient();
    const chunks = [];
    await client.stream(
      [{ role: "user", content: "hi" }],
      makeConfig(),
      (delta) => chunks.push(delta)
    );

    expect(chunks).toEqual(["Hello", " world"]);
  });

  it("throws on HTTP error during stream", async () => {
    mockFetch({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({ error: { message: "Forbidden" } }),
    });

    const client = new AIClient();
    await expect(
      client.stream([{ role: "user", content: "hi" }], makeConfig(), () => {})
    ).rejects.toThrow("403");
  });
});

// ── API key handling (Req 7.4) ────────────────────────────────────────────────

describe("AIClient — API key usage (Req 7.4)", () => {
  it("sends the API key only in the Authorization header", async () => {
    let capturedHeaders;
    let capturedBody;
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      capturedHeaders = opts.headers;
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      });
    });

    const client = new AIClient();
    await client.complete(
      [{ role: "user", content: "hi" }],
      makeConfig({ apiKey: "secret-key-123" })
    );

    expect(capturedHeaders["Authorization"]).toBe("Bearer secret-key-123");
    // API key must not appear in the request body
    expect(JSON.stringify(capturedBody)).not.toContain("secret-key-123");
  });
});
