/**
 * Property-based tests for SessionMemory turn limit.
 *
 * Property 2: History length never exceeds 20 turns regardless of how many
 *             turns are added.
 * Validates: Requirements 6.2
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import SessionMemory from "../session_memory.js";

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Generates a single conversation turn with a valid role and arbitrary content. */
const turnArb = fc.record({
  role: fc.constantFrom("user", "assistant"),
  content: fc.string(),
});

/**
 * Generates a sequence of 1–100 turns to stress-test the eviction logic.
 */
const turnSequenceArb = fc.array(turnArb, { minLength: 1, maxLength: 100 });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionMemory — Property 2: turn limit (Validates: Requirements 6.2)", () => {
  it("history length never exceeds 20 turns regardless of how many turns are added", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), turnSequenceArb, (tabId, turns) => {
        const memory = new SessionMemory();

        for (const turn of turns) {
          memory.addTurn(tabId, turn);
        }

        expect(memory.getHistory(tabId).length).toBeLessThanOrEqual(20);
      }),
      { numRuns: 100 }
    );
  });
});
