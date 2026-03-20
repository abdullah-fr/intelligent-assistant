/**
 * ContextExtractor — detects the current page platform and extracts
 * visible page data into a structured ContextObject.
 *
 * Platform detection priority:
 *   1. URL hostname / path match
 *   2. DOM structural signals
 *   3. Fallback: generic
 */

const ECOMMERCE_HOSTNAMES = [
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "shopify.com",
  "walmart.com",
  "target.com",
  "bestbuy.com",
  "newegg.com",
  "wayfair.com",
  "homedepot.com",
  "costco.com",
  "macys.com",
  "nordstrom.com",
  "zappos.com",
  "overstock.com",
];

const BLOG_HOSTNAMES = [
  "medium.com",
  "wordpress.com",
  "blogger.com",
  "substack.com",
  "ghost.io",
  "tumblr.com",
  "dev.to",
  "hashnode.com",
];

const BLOG_PATH_PATTERNS = [/\/blog\//i, /\/article\//i, /\/post\//i, /\/articles\//i, /\/posts\//i];

/**
 * Returns true if the element is visible in the rendered DOM.
 * An element is considered hidden if display is 'none' or visibility is 'hidden'.
 */
function isVisible(el) {
  try {
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  } catch {
    return false;
  }
}

/**
 * Returns the trimmed text content of the first visible element matching
 * the given CSS selector, or an empty string if none found.
 */
function firstVisibleText(selector) {
  const elements = document.querySelectorAll(selector);
  for (const el of elements) {
    if (isVisible(el)) {
      const text = el.textContent.trim();
      if (text) return text;
    }
  }
  return "";
}

/**
 * Collects visible text from all elements matching the selector,
 * joined by the given separator.
 */
function allVisibleText(selector, separator = ", ") {
  const results = [];
  for (const el of document.querySelectorAll(selector)) {
    if (isVisible(el)) {
      const text = el.textContent.trim();
      if (text) results.push(text);
    }
  }
  return results.join(separator);
}

/**
 * Walks the document body collecting visible text up to maxChars characters.
 */
function visibleBodySnippet(maxChars = 500) {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Skip script/style content
        const tag = parent.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") {
          return NodeFilter.FILTER_REJECT;
        }
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let text = "";
  let node;
  while ((node = walker.nextNode())) {
    const chunk = node.textContent.replace(/\s+/g, " ").trim();
    if (!chunk) continue;
    if (text.length + chunk.length + 1 > maxChars) {
      const remaining = maxChars - text.length - 1;
      if (remaining > 0) {
        text += (text ? " " : "") + chunk.slice(0, remaining);
      }
      break;
    }
    text += (text ? " " : "") + chunk;
  }
  return text.slice(0, maxChars);
}

class ContextExtractor {
  /**
   * Detects the platform and extracts visible page data.
   * @returns {ContextObject}
   */
  extract() {
    const platform = this._detectPlatform();
    switch (platform) {
      case "linkedin":
        return this._extractLinkedIn();
      case "ecommerce":
        return this._extractEcommerce();
      case "blog":
        return this._extractBlog();
      default:
        return this._extractGeneric();
    }
  }

  // ── Platform detection ──────────────────────────────────────────────────────

  _detectPlatform() {
    const hostname = location.hostname.replace(/^www\./, "");
    const pathname = location.pathname;

    // 1. LinkedIn
    if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
      return "linkedin";
    }

    // 2. Known e-commerce hostnames
    if (ECOMMERCE_HOSTNAMES.some((h) => hostname === h || hostname.endsWith("." + h))) {
      return "ecommerce";
    }

    // 3. Known blog hostnames
    if (BLOG_HOSTNAMES.some((h) => hostname === h || hostname.endsWith("." + h))) {
      return "blog";
    }

    // 4. Blog path patterns
    if (BLOG_PATH_PATTERNS.some((re) => re.test(pathname))) {
      return "blog";
    }

    // 5. DOM structural signals — e-commerce product schema
    if (document.querySelector('[itemtype*="Product"]')) {
      return "ecommerce";
    }

    // 6. DOM structural signals — article tag → blog
    if (document.querySelector("article")) {
      return "blog";
    }

    return "generic";
  }

  // ── Platform-specific extractors ────────────────────────────────────────────

  _extractLinkedIn() {
    const name =
      firstVisibleText(".text-heading-xlarge") ||
      firstVisibleText("h1") ||
      "";

    const role =
      firstVisibleText(".text-body-medium.break-words") ||
      firstVisibleText('[data-field="headline"]') ||
      "";

    const company =
      firstVisibleText(".pv-text-details__right-panel-item-text") ||
      firstVisibleText('[data-field="current_company"]') ||
      firstVisibleText(".inline-show-more-text--is-collapsed") ||
      "";

    const summary =
      firstVisibleText(".pv-shared-text-with-see-more span[aria-hidden='false']") ||
      firstVisibleText(".pv-about-section .pv-about__summary-text") ||
      firstVisibleText('[data-field="summary"]') ||
      "";

    return {
      platform: "linkedin",
      pageType: "profile",
      name: String(name),
      role: String(role),
      company: String(company),
      summary: String(summary),
    };
  }

  _extractEcommerce() {
    const productName =
      firstVisibleText('[itemprop="name"]') ||
      firstVisibleText("#productTitle") ||
      firstVisibleText(".product-title") ||
      firstVisibleText("h1") ||
      "";

    const price =
      firstVisibleText('[itemprop="price"]') ||
      firstVisibleText(".a-price .a-offscreen") ||
      firstVisibleText(".price") ||
      firstVisibleText('[class*="price"]') ||
      "";

    const description =
      firstVisibleText('[itemprop="description"]') ||
      firstVisibleText("#productDescription") ||
      firstVisibleText(".product-description") ||
      firstVisibleText('[class*="description"]') ||
      "";

    return {
      platform: "ecommerce",
      pageType: "product",
      productName: String(productName),
      price: String(price),
      description: String(description),
    };
  }

  _extractBlog() {
    const title =
      firstVisibleText("title") ||
      document.title ||
      "";

    const headings = allVisibleText("h1, h2");

    const snippet = visibleBodySnippet(500);

    return {
      platform: "blog",
      pageType: "article",
      title: String(title),
      headings: String(headings),
      snippet: String(snippet),
    };
  }

  _extractGeneric() {
    const title = String(document.title || "");
    const snippet = visibleBodySnippet(500);

    return {
      platform: "generic",
      pageType: "page",
      title,
      snippet: String(snippet),
    };
  }
}

export default ContextExtractor;
