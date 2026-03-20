import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.js"],
    globals: true,
    setupFiles: ["src/tests/setup.js"],
  },
});
