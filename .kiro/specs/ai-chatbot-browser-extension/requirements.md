# Requirements Document

## Introduction

A cross-browser AI chatbot browser extension that injects a floating chat UI into any website, extracts visible page context, and sends user prompts along with that context to a free AI backend (Groq/Hugging Face) to generate structured, thoughtful responses. The extension operates entirely user-driven — no auto-sending, no hidden scraping — and works across Chrome, Firefox, Edge, Opera, and Brave via the WebExtension API (Manifest V3).

## Glossary

- **Extension**: The browser extension as a whole, including all its components.
- **Content_Script**: JavaScript injected into web pages to extract context and render the chat UI.
- **Background_Script**: The service worker that handles AI API communication, session memory, and prompt construction.
- **Chat_UI**: The floating chatbot panel injected into the active web page by the Content_Script.
- **Context_Extractor**: The module within the Content_Script responsible for detecting the platform and extracting visible page data.
- **Context_Object**: A structured JSON object containing extracted page data (platform, pageType, and relevant fields).
- **AI_Client**: The module within the Background_Script that communicates with the external AI API.
- **Session_Memory**: An in-memory store scoped to the current browser tab that holds the conversation history.
- **Options_Page**: An extension settings page where users configure API keys and preferences.
- **Platform**: The detected website type (e.g., LinkedIn, e-commerce, blog, dashboard, generic).
- **User**: The human operating the browser and interacting with the Chat_UI.

---

## Requirements

### Requirement 1: Cross-Browser Manifest and Extension Packaging

**User Story:** As a developer, I want the extension to be packaged with a Manifest V3 configuration compatible with all major browsers, so that users can install it on Chrome, Firefox, Edge, Opera, and Brave without separate builds.

#### Acceptance Criteria

1. THE Extension SHALL use a Manifest V3 manifest file as its configuration entry point.
2. THE Extension SHALL declare permissions limited to `activeTab`, `storage`, and `scripting` to minimize the permission footprint.
3. WHEN the Extension is loaded in Chrome, Edge, Opera, or Brave, THE Extension SHALL activate without browser-specific errors.
4. WHEN the Extension is loaded in Firefox, THE Extension SHALL activate without browser-specific errors using the WebExtension API compatibility layer.
5. THE Extension SHALL use a single shared codebase for all supported browsers, with conditional handling only where browser API differences require it.

---

### Requirement 2: Floating Chat UI Injection

**User Story:** As a user, I want a floating chatbot panel to appear on any webpage I visit, so that I can interact with the AI without leaving the page.

#### Acceptance Criteria

1. WHEN a web page finishes loading, THE Content_Script SHALL inject the Chat_UI into the page's DOM as a floating panel.
2. THE Chat_UI SHALL be positioned in a fixed location on the screen so that it remains visible during page scrolling.
3. THE Chat_UI SHALL include a text input field, a submit button, a response display area, and a collapse/expand toggle.
4. WHEN the User clicks the collapse toggle, THE Chat_UI SHALL minimize to a compact icon without being removed from the DOM.
5. WHEN the User clicks the compact icon, THE Chat_UI SHALL expand back to its full panel state.
6. THE Chat_UI SHALL apply styles scoped to its own container so that the host page's CSS does not interfere with its appearance.
7. WHEN the Chat_UI is injected into a page that already contains a Chat_UI instance, THE Content_Script SHALL not inject a duplicate instance.

---

### Requirement 3: Platform Detection and Context Extraction

**User Story:** As a user, I want the extension to automatically understand the type of page I am on, so that the AI can generate responses relevant to the current context.

#### Acceptance Criteria

1. WHEN the Content_Script runs on a page, THE Context_Extractor SHALL detect the Platform by inspecting the page URL and visible DOM structure.
2. WHEN the detected Platform is LinkedIn and the page is a profile page, THE Context_Extractor SHALL extract the visible name, role, company, and summary fields into a Context_Object.
3. WHEN the detected Platform is an e-commerce product page, THE Context_Extractor SHALL extract the visible product name, price, and description into a Context_Object.
4. WHEN the detected Platform is a blog or article page, THE Context_Extractor SHALL extract the visible title, headings, and a content snippet of no more than 500 characters into a Context_Object.
5. WHEN the detected Platform does not match a known type, THE Context_Extractor SHALL build a Context_Object containing the page title and a visible text snippet of no more than 500 characters.
6. THE Context_Extractor SHALL only read content that is visible in the rendered DOM and SHALL NOT access hidden elements, shadow DOM internals not exposed to the content script, or browser storage belonging to the host page.
7. THE Context_Object SHALL conform to the structure `{ platform, pageType, ...extractedFields }` where all field values are strings.

---

### Requirement 4: Prompt Construction and AI API Communication

**User Story:** As a user, I want my prompt and the page context to be sent to a free AI model, so that I receive a relevant and structured response.

#### Acceptance Criteria

1. WHEN the User submits a prompt in the Chat_UI, THE Background_Script SHALL receive the prompt text and the current Context_Object via the browser messaging API.
2. THE Background_Script SHALL construct an AI prompt by combining the Context_Object fields and the User's prompt text into a single structured message.
3. THE AI_Client SHALL send the constructed prompt to the configured AI provider endpoint (Groq API with LLaMA 3 or Hugging Face Inference API).
4. WHEN the AI provider returns a successful response, THE AI_Client SHALL extract the generated text and return it to the Chat_UI.
5. IF the AI provider returns an error response, THEN THE AI_Client SHALL return a descriptive error message to the Chat_UI indicating the failure reason.
6. IF the network request to the AI provider times out after 30 seconds, THEN THE AI_Client SHALL cancel the request and return a timeout error message to the Chat_UI.
7. THE Background_Script SHALL NOT send any data to endpoints other than the configured AI provider and SHALL NOT store prompt or response data on any remote server controlled by the Extension.

---

### Requirement 5: Response Display with Thinking UX

**User Story:** As a user, I want to see visual feedback while the AI is generating a response, so that I know the extension is working and the experience feels natural.

#### Acceptance Criteria

1. WHEN the User submits a prompt, THE Chat_UI SHALL immediately display a status message (e.g., "Analyzing page…" or "Generating response…") in the response area.
2. WHEN the AI_Client returns a response, THE Chat_UI SHALL replace the status message with the full response text.
3. THE Chat_UI SHALL display the AI response in a readable format, preserving line breaks and paragraph structure present in the response text.
4. WHEN the AI_Client returns an error message, THE Chat_UI SHALL display the error message in the response area with a visual distinction from normal responses.
5. WHERE the AI provider supports streaming responses, THE Chat_UI SHALL render response tokens progressively as they arrive rather than waiting for the full response.

---

### Requirement 6: Session Memory

**User Story:** As a user, I want the chatbot to remember the conversation within my current tab session, so that I can ask follow-up questions without repeating context.

#### Acceptance Criteria

1. THE Session_Memory SHALL store the ordered list of User prompts and AI responses for the current tab.
2. WHEN the Background_Script constructs an AI prompt, THE Background_Script SHALL include the prior conversation turns from Session_Memory up to the last 10 exchanges.
3. WHEN the User navigates to a different URL within the same tab, THE Session_Memory for that tab SHALL be cleared.
4. WHEN the browser tab is closed, THE Session_Memory for that tab SHALL be discarded.
5. THE Session_Memory SHALL reside in the Background_Script's runtime memory and SHALL NOT be persisted to `browser.storage` without explicit User consent.

---

### Requirement 7: API Key and Preferences Configuration

**User Story:** As a user, I want to configure my AI provider API key and preferences through an options page, so that I can use my own account and control extension behavior.

#### Acceptance Criteria

1. THE Extension SHALL provide an Options_Page accessible from the browser's extension management UI.
2. THE Options_Page SHALL include an input field for the User to enter an AI provider API key.
3. WHEN the User saves an API key on the Options_Page, THE Extension SHALL store the key in `browser.storage.local` on the User's device.
4. THE Extension SHALL NOT transmit the API key to any endpoint other than the configured AI provider.
5. WHEN no API key has been configured, THE Chat_UI SHALL display a prompt directing the User to the Options_Page to enter an API key before use.
6. THE Options_Page SHALL include a selector for the User to choose between supported AI providers (Groq, Hugging Face).

---

### Requirement 8: Security and Privacy Constraints

**User Story:** As a user, I want assurance that the extension does not automate actions on my behalf or leak my data, so that I can use it safely on sensitive platforms like LinkedIn.

#### Acceptance Criteria

1. THE Extension SHALL NOT programmatically submit, click, or interact with any form or button on the host page on behalf of the User.
2. THE Extension SHALL NOT read cookies, localStorage, sessionStorage, or IndexedDB belonging to the host page.
3. THE Extension SHALL NOT inject scripts that modify the host page's existing JavaScript execution context.
4. WHEN the User copies a response, THE Extension SHALL rely on the browser's native clipboard API triggered by an explicit User action and SHALL NOT write to the clipboard automatically.
5. THE Extension SHALL request only the minimum permissions required for its functionality and SHALL NOT request broad host permissions such as `<all_urls>` in the manifest unless scoped to `activeTab`.
