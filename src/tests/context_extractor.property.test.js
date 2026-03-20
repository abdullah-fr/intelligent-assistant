/**
 * Property-based tests for ContextExtractor output shape.
 *
 * Property 1: Context object always has string-typed platform, pageType,
 *             and all field values.
 * Validates: Requirements 3.7
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import ContextExtractor from "../context_extractor.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mock location.hostname and location.pathname via Object.defineProperty.
 * Returns a restore function.
 */
function mockLocation(hostname, pathname = "/") {
  Object.defineProperty(globalThis, "location", {
    value: { hostname, pathname },
    writable: true,
    configurable: true,
  });
}

/** Set up a minimal DOM body for a given platform scenario. */
function setupDOM(platform) {
  switch (platform) {
    case "linkedin":
      document.body.innerHTML = `
        <h1 class="text-heading-xlarge">Jane Doe</h1>
        <div class="text-body-medium break-words">Software Engineer</div>
        <div class="pv-text-details__right-panel-item-text">Acme Corp</div>
      `;
      break;
    case "ecommerce":
      document.body.innerHTML = `
        <h1 itemprop="name">Widget Pro</h1>
        <span itemprop="price">$29.99</span>
        <div itemprop="description">A great widget.</div>
      `;
      break;
    case "blog":
      document.body.innerHTML = `
        <article>
          <h1>My Blog Post</h1>
          <h2>Introduction</h2>
          <p>Some visible content here.</p>
        </article>
      `;
      break;
    default:
      document.body.innerHTML = `<p>Generic page content.</p>`;
  }
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

/**
 * Generates one of the four platform scenarios as a config object.
 * Each scenario specifies how to mock location and the DOM.
 */
const platformScenarioArb = fc.oneof(
  // LinkedIn
  fc.record({
    platform: fc.constant("linkedin"),
    hostname: fc.constant("linkedin.com"),
    pathname: fc.constantFrom("/in/janedoe", "/in/johndoe", "/"),
  }),
  // E-commerce (known hostname)
  fc.record({
    platform: fc.constant("ecommerce"),
    hostname: fc.constantFrom("amazon.com", "ebay.com", "walmart.com"),
    pathname: fc.constantFrom("/dp/B001", "/itm/123", "/ip/456"),
  }),
  // Blog (known hostname)
  fc.record({
    platform: fc.constant("blog"),
    hostname: fc.constantFrom("medium.com", "dev.to", "substack.com"),
    pathname: fc.constantFrom("/post/hello", "/article/world", "/"),
  }),
  // Generic (unknown hostname, no special DOM)
  fc.record({
    platform: fc.constant("generic"),
    hostname: fc.constantFrom("example.com", "mysite.org", "dashboard.io"),
    pathname: fc.constantFrom("/", "/home", "/dashboard"),
  })
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ContextExtractor — Property 1: output shape (Validates: Requirements 3.7)", () => {
  beforeEach(() => {
    document.title = "Test Page";
  });

  it("platform and pageType are always strings", () => {
    fc.assert(
      fc.property(platformScenarioArb, (scenario) => {
        mockLocation(scenario.hostname, scenario.pathname);
        setupDOM(scenario.platform);

        const extractor = new ContextExtractor();
        const result = extractor.extract();

        expect(typeof result.platform).toBe("string");
        expect(typeof result.pageType).toBe("string");
        expect(result.platform.length).toBeGreaterThan(0);
        expect(result.pageType.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });

  it("all field values in the result object are strings", () => {
    fc.assert(
      fc.property(platformScenarioArb, (scenario) => {
        mockLocation(scenario.hostname, scenario.pathname);
        setupDOM(scenario.platform);

        const extractor = new ContextExtractor();
        const result = extractor.extract();

        for (const [key, value] of Object.entries(result)) {
          expect(
            typeof value,
            `Field "${key}" should be a string but got ${typeof value}`
          ).toBe("string");
        }
      }),
      { numRuns: 50 }
    );
  });

  it("no field value is null or undefined", () => {
    fc.assert(
      fc.property(platformScenarioArb, (scenario) => {
        mockLocation(scenario.hostname, scenario.pathname);
        setupDOM(scenario.platform);

        const extractor = new ContextExtractor();
        const result = extractor.extract();

        for (const [key, value] of Object.entries(result)) {
          expect(
            value,
            `Field "${key}" must not be null or undefined`
          ).not.toBeNull();
          expect(value).not.toBeUndefined();
        }
      }),
      { numRuns: 50 }
    );
  });

  it("platform value is one of the four known platform types", () => {
    const validPlatforms = ["linkedin", "ecommerce", "blog", "generic"];

    fc.assert(
      fc.property(platformScenarioArb, (scenario) => {
        mockLocation(scenario.hostname, scenario.pathname);
        setupDOM(scenario.platform);

        const extractor = new ContextExtractor();
        const result = extractor.extract();

        expect(validPlatforms).toContain(result.platform);
      }),
      { numRuns: 50 }
    );
  });
});
