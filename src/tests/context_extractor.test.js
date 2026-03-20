/**
 * Unit tests for ContextExtractor — platform detection and field extraction.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach } from "vitest";
import ContextExtractor from "../context_extractor.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockLocation(hostname, pathname = "/") {
  Object.defineProperty(globalThis, "location", {
    value: { hostname, pathname },
    writable: true,
    configurable: true,
  });
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

describe("LinkedIn platform detection and extraction (Req 3.1, 3.2)", () => {
  beforeEach(() => {
    mockLocation("linkedin.com", "/in/janedoe");
    document.body.innerHTML = `
      <h1 class="text-heading-xlarge">Jane Doe</h1>
      <div class="text-body-medium break-words">Senior Engineer</div>
      <div class="pv-text-details__right-panel-item-text">Acme Corp</div>
    `;
  });

  it("detects platform as linkedin from hostname", () => {
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("linkedin");
  });

  it("sets pageType to profile", () => {
    const result = new ContextExtractor().extract();
    expect(result.pageType).toBe("profile");
  });

  it("extracts name from .text-heading-xlarge", () => {
    const result = new ContextExtractor().extract();
    expect(result.name).toBe("Jane Doe");
  });

  it("extracts role from .text-body-medium.break-words", () => {
    const result = new ContextExtractor().extract();
    expect(result.role).toBe("Senior Engineer");
  });

  it("extracts company from .pv-text-details__right-panel-item-text", () => {
    const result = new ContextExtractor().extract();
    expect(result.company).toBe("Acme Corp");
  });

  it("falls back to h1 for name when .text-heading-xlarge is absent", () => {
    document.body.innerHTML = `<h1>John Smith</h1>`;
    const result = new ContextExtractor().extract();
    expect(result.name).toBe("John Smith");
  });
});

// ── E-commerce — hostname detection ──────────────────────────────────────────

describe("E-commerce hostname detection (Req 3.1, 3.3)", () => {
  beforeEach(() => {
    mockLocation("amazon.com", "/dp/B001");
    document.body.innerHTML = `
      <h1 itemprop="name">Widget Pro</h1>
      <span itemprop="price">$29.99</span>
      <div itemprop="description">A great widget for all your needs.</div>
    `;
  });

  it("detects platform as ecommerce from known hostname", () => {
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("ecommerce");
  });

  it("sets pageType to product", () => {
    const result = new ContextExtractor().extract();
    expect(result.pageType).toBe("product");
  });

  it("extracts productName from itemprop=name", () => {
    const result = new ContextExtractor().extract();
    expect(result.productName).toBe("Widget Pro");
  });

  it("extracts price from itemprop=price", () => {
    const result = new ContextExtractor().extract();
    expect(result.price).toBe("$29.99");
  });

  it("extracts description from itemprop=description", () => {
    const result = new ContextExtractor().extract();
    expect(result.description).toBe("A great widget for all your needs.");
  });
});

// ── E-commerce — DOM signal detection ────────────────────────────────────────

describe("E-commerce DOM signal detection (Req 3.1, 3.3)", () => {
  it("detects ecommerce via [itemtype*=Product] on a non-ecommerce hostname", () => {
    mockLocation("myshop.example.com", "/products/widget");
    document.body.innerHTML = `
      <div itemscope itemtype="https://schema.org/Product">
        <h1 itemprop="name">Schema Widget</h1>
        <span itemprop="price">$9.99</span>
        <p itemprop="description">Schema-driven product.</p>
      </div>
    `;
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("ecommerce");
  });
});

// ── Blog — hostname detection ─────────────────────────────────────────────────

describe("Blog hostname detection (Req 3.1, 3.4)", () => {
  it("detects platform as blog from medium.com hostname", () => {
    mockLocation("medium.com", "/post/hello-world");
    document.body.innerHTML = `<article><h1>Hello World</h1><p>Content.</p></article>`;
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("blog");
  });
});

// ── Blog — path pattern detection ────────────────────────────────────────────

describe("Blog path pattern detection (Req 3.1, 3.4)", () => {
  it("detects platform as blog from /blog/ path on a generic hostname", () => {
    mockLocation("example.com", "/blog/my-post");
    // No article tag, no known hostname — path pattern should trigger blog
    document.body.innerHTML = `<div><h1>My Post</h1><p>Content here.</p></div>`;
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("blog");
  });
});

// ── Blog — extraction and snippet truncation ──────────────────────────────────

describe("Blog extraction with snippet truncation (Req 3.4)", () => {
  beforeEach(() => {
    mockLocation("medium.com", "/post/long-article");
  });

  it("extracts title, headings, and snippet", () => {
    document.title = "My Article";
    document.body.innerHTML = `
      <article>
        <h1>Main Heading</h1>
        <h2>Sub Heading</h2>
        <p>Short content.</p>
      </article>
    `;
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("blog");
    expect(result.title).toBeTruthy();
    expect(result.headings).toContain("Main Heading");
    expect(result.headings).toContain("Sub Heading");
    expect(typeof result.snippet).toBe("string");
  });

  it("truncates snippet to at most 500 characters", () => {
    const longText = "word ".repeat(200); // 1000 chars
    document.body.innerHTML = `<article><p>${longText}</p></article>`;
    const result = new ContextExtractor().extract();
    expect(result.snippet.length).toBeLessThanOrEqual(500);
  });

  it("snippet is a string even when body is empty", () => {
    document.body.innerHTML = `<article></article>`;
    const result = new ContextExtractor().extract();
    expect(typeof result.snippet).toBe("string");
  });
});

// ── Generic fallback ──────────────────────────────────────────────────────────

describe("Generic fallback extraction (Req 3.5)", () => {
  beforeEach(() => {
    mockLocation("unknown-site.io", "/dashboard");
    document.title = "My Dashboard";
    document.body.innerHTML = `<div><p>Some generic page content here.</p></div>`;
  });

  it("detects platform as generic for unknown hostname with no special DOM", () => {
    const result = new ContextExtractor().extract();
    expect(result.platform).toBe("generic");
  });

  it("sets pageType to page", () => {
    const result = new ContextExtractor().extract();
    expect(result.pageType).toBe("page");
  });

  it("extracts title from document.title", () => {
    const result = new ContextExtractor().extract();
    expect(result.title).toBe("My Dashboard");
  });

  it("extracts a visible text snippet", () => {
    const result = new ContextExtractor().extract();
    expect(result.snippet).toContain("Some generic page content here.");
  });

  it("truncates generic snippet to at most 500 characters", () => {
    const longText = "word ".repeat(200);
    document.body.innerHTML = `<div><p>${longText}</p></div>`;
    const result = new ContextExtractor().extract();
    expect(result.snippet.length).toBeLessThanOrEqual(500);
  });
});
