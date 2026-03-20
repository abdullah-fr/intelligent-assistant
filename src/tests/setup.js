/**
 * Global test setup — defines chrome/browser globals so the inline browser shim
 * in background.js and content_script.js doesn't throw in jsdom.
 */

// Captured listener references (shared across test files via globalThis)
globalThis._testListeners = {
  onMessage: null,
  onRemoved: null,
  onCommitted: null,
  onPageMessage: null,
};

globalThis._mockStorageData = {};
globalThis._mockSendMessage = () => {};
globalThis._mockTabsSendMessage = () => {};

globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener: (fn) => { globalThis._testListeners.onMessage = fn; },
    },
    sendMessage: (...args) => globalThis._mockSendMessage(...args),
  },
  storage: {
    local: {
      get: (_keys) => Promise.resolve(globalThis._mockStorageData),
    },
  },
  tabs: {
    sendMessage: (...args) => globalThis._mockTabsSendMessage(...args),
    onRemoved: {
      addListener: (fn) => { globalThis._testListeners.onRemoved = fn; },
    },
  },
  webNavigation: {
    onCommitted: {
      addListener: (fn) => { globalThis._testListeners.onCommitted = fn; },
    },
  },
};
