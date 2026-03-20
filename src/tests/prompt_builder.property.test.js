/**
 * Property-based tests for PromptBuilder output structure.
 *
 * Property 3: Built messages array always starts with a system role turn
 *             and ends with a user role turn.
 * Validates: Requirements 4.2
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import PromptBuilder from "../prompt_builder.js";

// ── Arbitraries ───────────────────────────────────────────────────────────────

const platformArb = fc.constantFrom("linkedin", "ecommerce", "blog", "generic");

const contextArb = fc.record({
  platform: platformArb,
  pageType: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  role: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  snippet: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
});

const turnArb = fc.record({
  role: fc.constantFrom("user", "assistant"),
  content: fc.string({ minLength: 1, maxLength: 500 }),
});

const historyArb = fc.array(turnArb, { minLength: 0, maxLength: 20 });

const userPromptArb = fc.string({ minLength: 1, maxLength: 500 });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PromptBuilder — Property 3: messages array structure (Validates: Requirements 4.2)", () => {
  const builder = new PromptBuilder();

  it("result is always an array", () => {
    fc.assert(
      fc.property(contextArb, historyArb, userPromptArb, (context, history, userPrompt) => {
        const result = builder.build(context, history, userPrompt);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("first element always has role === 'system'", () => {
    fc.assert(
      fc.property(contextArb, historyArb, userPromptArb, (context, history, userPrompt) => {
        const result = builder.build(context, history, userPrompt);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].role).toBe("system");
      }),
      { numRuns: 100 }
    );
  });

  it("last element always has role === 'user'", () => {
    fc.assert(
      fc.property(contextArb, historyArb, userPromptArb, (context, history, userPrompt) => {
        const result = builder.build(context, history, userPrompt);
        const last = result[result.length - 1];
        expect(last.role).toBe("user");
      }),
      { numRuns: 100 }
    );
  });

  it("last element's content equals the userPrompt", () => {
    fc.assert(
      fc.property(contextArb, historyArb, userPromptArb, (context, history, userPrompt) => {
        const result = builder.build(context, history, userPrompt);
        const last = result[result.length - 1];
        expect(last.content).toBe(userPrompt);
      }),
      { numRuns: 100 }
    );
  });
});
