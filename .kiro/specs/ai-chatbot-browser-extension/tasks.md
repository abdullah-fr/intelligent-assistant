# Implementation Plan: AI Chatbot Browser Extension

## Overview

Implement the extension incrementally: start with the manifest and browser shim, then build each module (context extractor, chat UI, session memory, prompt builder, AI client, background service worker), wire them together, and finish with the options page.

## Tasks

- [x] 1. Set up project structure and browser compatibility shim
  - Create the directory layout matching the manifest structure
  - Create `browser_shim.js` exporting `browserAPI` (browser namespace fallback to chrome)
  - Create `manifest.json` with MV3 fields: `manifest_version: 3`, permissions `["activeTab", "storage", "scripting"]`, `background.service_worker`, `content_scripts` declaration, and `options_ui`
  - Add placeholder icon files under `icons/` (16, 48, 128)
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 2. Implement Context Extractor
  - [x] 2.1 Implement `context_extractor.js` with `ContextExtractor` class
    - URL hostname detection for LinkedIn, known e-commerce domains, blog/article pages, and generic fallback
    - DOM structural signal detection (`[itemtype*="Product"]`, `article` tags) as secondary signal
    - LinkedIn profile extractor: visible name, role, company, summary fields
    - E-commerce extractor: visible product name, price, description fields
    - Blog extractor: title, h1/h2 headings (comma-joined), body snippet ≤500 chars
    - Generic extractor: page title and visible text snippet ≤500 chars
    - All extracted field values must be strings; output conforms to `{ platform, pageType, ...fields }`
    - Only read visible DOM elements; skip hidden elements (`display:none`, `visibility:hidden`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 2.2 Write property test for ContextExtractor output shape
    - **Property 1: Context object always has string-typed platform, pageType, and all field values**
    - **Validates: Requirements 3.7**

  - [x] 2.3 Write unit tests for platform detection and extraction
    - Test LinkedIn URL detection and field extraction from mock DOM
    - Test e-commerce DOM signal detection and field extraction
    - Test blog extraction with snippet truncation at 500 chars
    - Test generic fallback extraction
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Implement Chat UI
  - [x] 3.1 Implement `chat_ui.js` with `ChatUI` class using Shadow DOM
    - `mount(shadowRoot)`: render panel HTML (input field, submit button, response area, collapse toggle) inside the shadow root
    - Scoped CSS injected into the shadow root so host-page styles cannot interfere
    - `collapse()` / `expand()`: toggle between full panel and compact icon without removing from DOM
    - `setLoading(message)`: display status message in response area
    - `setResponse(text)`: replace loading message with full response, preserving line breaks
    - `appendChunk(delta)`: append streaming token to response area
    - `setError(message)`: display error with visual distinction (e.g., red border/text)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.2 Write unit tests for ChatUI state transitions
    - Test collapse/expand toggle preserves DOM node
    - Test `setLoading` → `setResponse` replacement
    - Test `setError` applies distinct styling
    - Test `appendChunk` accumulates text correctly
    - _Requirements: 2.3, 2.4, 2.5, 5.1, 5.2, 5.4, 5.5_

- [x] 4. Implement Session Memory
  - [x] 4.1 Implement `session_memory.js` with `SessionMemory` class
    - In-memory `Map` keyed by `tabId`
    - `getHistory(tabId)`: return ordered array of `{ role, content }` turns, empty array if none
    - `addTurn(tabId, turn)`: append turn; drop oldest pair when history exceeds 20 turns (10 exchanges)
    - `clearTab(tabId)`: delete the tab's history entry
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 4.2 Write property test for session memory turn limit
    - **Property 2: History length never exceeds 20 turns regardless of how many turns are added**
    - **Validates: Requirements 6.2**

  - [x] 4.3 Write unit tests for SessionMemory
    - Test `addTurn` eviction when limit exceeded
    - Test `clearTab` removes history
    - Test `getHistory` returns empty array for unknown tabId
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 5. Implement Prompt Builder
  - [x] 5.1 Implement `prompt_builder.js` with `PromptBuilder` class
    - `build(context, history, userPrompt)`: return messages array `[systemTurn, ...historyTurns, userTurn]`
    - System prompt: `"You are a helpful assistant. The user is currently on a {platform} page ({pageType}). Page context: {serialized fields}. Answer the user's question based on this context."`
    - Serialize context fields as `key: value` lines, omitting undefined fields
    - Append `userPrompt` as the final user turn
    - _Requirements: 4.2_

  - [x] 5.2 Write property test for prompt builder output
    - **Property 3: Built messages array always starts with a system role turn and ends with a user role turn**
    - **Validates: Requirements 4.2**

  - [x] 5.3 Write unit tests for PromptBuilder
    - Test system prompt includes platform and pageType
    - Test history turns are included in order
    - Test undefined context fields are omitted from serialization
    - _Requirements: 4.2, 6.2_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement AI Client
  - [x] 7.1 Implement `ai_client.js` with `AIClient` class
    - `complete(messages, config)`: POST to Groq (`https://api.groq.com/openai/v1/chat/completions`) or Hugging Face (`https://api-inference.huggingface.co/models/{model}`) based on `config.provider`
    - Set `AbortController` timeout at `config.timeoutMs` (default 30000 ms); on timeout return timeout error message
    - On HTTP error response, extract and return descriptive error message
    - On success, extract and return generated text string
    - `stream(messages, config, onChunk)`: same as `complete` but parse SSE chunks and call `onChunk(delta)` for each token; only used when provider supports streaming
    - API key read from `config.apiKey`; never stored or forwarded elsewhere
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 7.4_

  - [x] 7.2 Write unit tests for AIClient error handling
    - Test timeout triggers after 30 s and returns timeout error message
    - Test HTTP 4xx/5xx returns descriptive error message
    - Test successful response extracts generated text
    - _Requirements: 4.4, 4.5, 4.6_

- [x] 8. Implement Background Service Worker
  - [x] 8.1 Implement `background.js` message handler
    - Import `browserAPI`, `SessionMemory`, `PromptBuilder`, `AIClient`
    - `browser.runtime.onMessage` listener: handle `PROMPT` message type
      - Read `apiKey` and `provider` from `browser.storage.local`
      - If no API key, send `{ type: "NO_API_KEY" }` back to content script
      - Retrieve history via `SessionMemory.getHistory(sender.tab.id)`
      - Build messages via `PromptBuilder.build(context, history, prompt)`
      - Call `AIClient.complete` (or `stream` if streaming enabled)
      - On success: `addTurn` for user and assistant, send `{ type: "RESPONSE", text }`
      - On stream: send incremental `{ type: "STREAM_CHUNK", delta }` messages, then add turns
      - On error: send `{ type: "ERROR", message }`
    - Register `browser.tabs.onRemoved` → `SessionMemory.clearTab(tabId)`
    - Register `browser.webNavigation.onCommitted` → `SessionMemory.clearTab(tabId)` on URL change within same tab
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 Write unit tests for background message handler
    - Test `NO_API_KEY` response when storage returns no key
    - Test full prompt → response flow with mocked AIClient
    - Test session memory is updated after successful response
    - Test tab close triggers `clearTab`
    - _Requirements: 4.1, 6.3, 6.4, 7.5_

- [x] 9. Implement Content Script
  - [x] 9.1 Implement `content_script.js` as the page entry point
    - On `document_idle`: check for existing Chat UI instance (guard against duplicate injection via a sentinel attribute on the host element)
    - Create a `<div>` host element, attach a Shadow DOM, call `ChatUI.mount(shadowRoot)`
    - Instantiate `ContextExtractor` and call `extract()` to get the `ContextObject`
    - On submit button click: call `ChatUI.setLoading("Analyzing page…")`, send `{ type: "PROMPT", prompt, context }` via `browser.runtime.sendMessage`
    - Handle `RESPONSE` → `ChatUI.setResponse(text)`
    - Handle `STREAM_CHUNK` → `ChatUI.appendChunk(delta)`
    - Handle `ERROR` → `ChatUI.setError(message)`
    - Handle `NO_API_KEY` → `ChatUI.setError("Please configure your API key in the extension options.")`
    - _Requirements: 2.1, 2.7, 4.1, 5.1, 5.2, 5.4, 5.5, 7.5_

- [x] 10. Implement Options Page
  - [x] 10.1 Implement `options.html` and `options.js`
    - `options.html`: password-type input for API key, `<select>` for provider (groq / huggingface), Save button
    - `options.js`: on load, read `browser.storage.local` and populate fields; on Save, write `{ apiKey, provider }` to `browser.storage.local`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

- [x] 11. Security constraints verification
  - [x] 11.1 Audit all modules for security requirement compliance
    - Verify no `document.querySelector` calls interact with host-page forms or buttons
    - Verify no access to `document.cookie`, `localStorage`, `sessionStorage`, or `indexedDB`
    - Verify no `<script>` injection into the host page's main execution context
    - Verify clipboard writes only occur via explicit user action (browser native copy)
    - Verify `manifest.json` has no broad host permissions beyond `content_scripts` `<all_urls>`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties; unit tests cover specific examples and edge cases
- All modules import `browserAPI` from `browser_shim.js` instead of referencing `browser` or `chrome` directly
