# Intelligent Assistant

A cross-browser MV3 extension that injects a floating AI chatbot into any webpage. It reads the page content, extracts structured context (listings, prices, articles, profiles), and sends it to an AI model (Groq by default) so you can ask questions about what's on the screen.

![AI Assistant UI](src/icons/icon128.png)

---

## Features

- Floating chat panel with conversation history and typing indicators
- Smart context extraction — detects page type (ecommerce, blog, LinkedIn, generic) and extracts relevant data
- Listing-aware — extracts product/car names and prices from any listing page
- Keyboard shortcut: Enter to send, Shift+Enter for new line
- Keyboard isolation — typing in the assistant won't leak to the underlying page (Discord, Slack, etc.)
- Streaming responses via Groq API (SSE)
- Session memory — conversation history per tab, cleared on navigation
- Options page to configure API key, provider, model, and streaming
- Works in Brave, Chrome, and any Chromium-based browser

---

## Installation (Load Unpacked)

1. Clone the repo:
   ```bash
   git clone https://github.com/abdullah-fr/intelligent-assistant.git
   cd intelligent-assistant
   ```

2. Open your browser and go to `brave://extensions` or `chrome://extensions`

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked** and select the `src/` folder

5. The extension icon will appear in your toolbar

---

## Configuration

1. Click the extension icon → **Options** (or right-click → Extension options)
2. Enter your **Groq API key** — get one free at [console.groq.com](https://console.groq.com)
3. Select provider (`groq` or `huggingface`), model, and whether to enable streaming
4. Save — the assistant is ready to use on any page

**Default model:** `llama-3.3-70b-versatile`

---

## Usage

1. Navigate to any webpage
2. Click the **✦** launcher button (bottom-right corner)
3. Type your question and press **Enter**
4. The assistant reads the page content and answers based on what's there

### Example questions
- "What is the lowest priced car on this page?"
- "Summarize this article"
- "What are the 4-star rated items here?"
- "What is this person's job title?" (on LinkedIn)

---

## Project Structure

```
src/
├── manifest.json          # MV3 extension manifest
├── background.js          # Service worker — handles AI API calls, session memory
├── content_script.js      # Injected into every page — UI + context extraction
├── options.html/js        # Settings page
├── browser_shim.js        # Cross-browser API compatibility (chrome/browser)
├── ai_client.js           # Groq/HuggingFace API client with streaming support
├── prompt_builder.js      # Builds system + history + user messages
├── session_memory.js      # Per-tab conversation history (max 20 turns)
├── context_extractor.js   # DOM context extraction by page type
├── chat_ui.js             # Chat UI component (used in tests)
├── icons/                 # Extension icons (16, 48, 128px)
└── tests/                 # Vitest unit + property-based tests (112 tests)
```

---

## Running Tests

```bash
npm install
npm test
```

Uses [Vitest](https://vitest.dev) with jsdom. 112 tests across 11 test files covering all modules.

---

## Supported AI Providers

| Provider | Models | Streaming |
|---|---|---|
| Groq | llama-3.3-70b-versatile, mixtral-8x7b, gemma2-9b-it | ✅ |
| HuggingFace | gpt2, and others | ❌ |

---

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read current tab info |
| `storage` | Save API key and settings |
| `scripting` | Inject content script |
| `webNavigation` | Clear session memory on page navigation |
| `tabs` | Send streaming chunks to content script |

---

## License

MIT
