/**
 * Unit tests for PromptBuilder.
 * Requirements: 4.2, 6.2
 */

import { describe, it, expect, beforeEach } from "vitest";
import PromptBuilder from "../prompt_builder.js";

describe("PromptBuilder", () => {
  let builder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  it("system prompt includes the platform value", () => {
    const context = { platform: "linkedin", pageType: "profile", name: "Alice" };
    const result = builder.build(context, [], "Hello");
    expect(result[0].content).toContain("linkedin");
  });

  it("system prompt includes the pageType value", () => {
    const context = { platform: "ecommerce", pageType: "product-detail", title: "Widget" };
    const result = builder.build(context, [], "What is this?");
    expect(result[0].content).toContain("product-detail");
  });

  it("history turns are included in order at indices 1 and 2", () => {
    const context = { platform: "generic", pageType: "page" };
    const history = [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ];
    const result = builder.build(context, history, "follow-up");
    expect(result[1]).toEqual({ role: "user", content: "first question" });
    expect(result[2]).toEqual({ role: "assistant", content: "first answer" });
  });

  it("undefined context fields are omitted from the system prompt", () => {
    const context = { platform: "blog", pageType: "article", title: "My Post", snippet: undefined };
    const result = builder.build(context, [], "Summarize");
    expect(result[0].content).not.toContain("snippet");
  });

  it("null context fields are omitted from the system prompt", () => {
    const context = { platform: "blog", pageType: "article", title: "My Post", snippet: null };
    const result = builder.build(context, [], "Summarize");
    expect(result[0].content).not.toContain("snippet");
  });

  it("userPrompt is the last turn with role 'user'", () => {
    const context = { platform: "generic", pageType: "page" };
    const history = [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }];
    const result = builder.build(context, history, "my question");
    const last = result[result.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("my question");
  });

  it("empty history produces exactly 2 elements (system + user)", () => {
    const context = { platform: "generic", pageType: "page" };
    const result = builder.build(context, [], "anything");
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
  });
});
