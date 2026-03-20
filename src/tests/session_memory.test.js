/**
 * Unit tests for SessionMemory.
 * Requirements: 6.1, 6.2, 6.4
 */

import { describe, it, expect, beforeEach } from "vitest";
import SessionMemory from "../session_memory.js";

const TAB_A = 1;
const TAB_B = 2;

let memory;

beforeEach(() => {
  memory = new SessionMemory();
});

// ── getHistory ────────────────────────────────────────────────────────────────

describe("getHistory(tabId) (Req 6.1)", () => {
  it("returns an empty array for an unknown tabId", () => {
    const result = memory.getHistory(TAB_A);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("returns [] not null or undefined for unknown tabId", () => {
    expect(memory.getHistory(999)).not.toBeNull();
    expect(memory.getHistory(999)).not.toBeUndefined();
  });
});

// ── addTurn ───────────────────────────────────────────────────────────────────

describe("addTurn(tabId, turn) (Req 6.1, 6.2)", () => {
  it("stores turns in insertion order", () => {
    memory.addTurn(TAB_A, { role: "user", content: "first" });
    memory.addTurn(TAB_A, { role: "assistant", content: "second" });
    memory.addTurn(TAB_A, { role: "user", content: "third" });

    const history = memory.getHistory(TAB_A);
    expect(history[0].content).toBe("first");
    expect(history[1].content).toBe("second");
    expect(history[2].content).toBe("third");
  });

  it("evicts the oldest turn when the 21st turn is added", () => {
    for (let i = 0; i < 21; i++) {
      memory.addTurn(TAB_A, { role: "user", content: `turn-${i}` });
    }

    const history = memory.getHistory(TAB_A);
    expect(history).toHaveLength(20);
    expect(history[0].content).toBe("turn-1"); // turn-0 was dropped
    expect(history[19].content).toBe("turn-20");
  });

  it("caps history at 20 turns regardless of how many are added", () => {
    for (let i = 0; i < 50; i++) {
      memory.addTurn(TAB_A, { role: "user", content: `turn-${i}` });
    }

    expect(memory.getHistory(TAB_A)).toHaveLength(20);
  });
});

// ── clearTab ──────────────────────────────────────────────────────────────────

describe("clearTab(tabId) (Req 6.4)", () => {
  it("removes all history for the given tab", () => {
    memory.addTurn(TAB_A, { role: "user", content: "hello" });
    memory.addTurn(TAB_A, { role: "assistant", content: "hi" });

    memory.clearTab(TAB_A);

    expect(memory.getHistory(TAB_A)).toHaveLength(0);
  });

  it("does not throw when clearing an unknown tabId", () => {
    expect(() => memory.clearTab(999)).not.toThrow();
  });
});

// ── tab isolation ─────────────────────────────────────────────────────────────

describe("tab isolation (Req 6.1)", () => {
  it("turns added to one tab do not appear in another", () => {
    memory.addTurn(TAB_A, { role: "user", content: "tab-a message" });

    expect(memory.getHistory(TAB_B)).toHaveLength(0);
  });

  it("clearing one tab does not affect another", () => {
    memory.addTurn(TAB_A, { role: "user", content: "a" });
    memory.addTurn(TAB_B, { role: "user", content: "b" });

    memory.clearTab(TAB_A);

    expect(memory.getHistory(TAB_A)).toHaveLength(0);
    expect(memory.getHistory(TAB_B)).toHaveLength(1);
  });
});
