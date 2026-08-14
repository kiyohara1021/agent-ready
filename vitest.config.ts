import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // CLI integration tests spawn the built binary.
    testTimeout: 20_000,
  },
});
