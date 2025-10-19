import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      PORT: "4000",
      RPC_URL: "https://example.com",
      PRIVATE_KEY_BACKEND_SIGNER:
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      API_KEY_ADMIN: "changeme",
      CHAIN_ID: "97"
    }
  },
  resolve: {
    alias: {
      "@lab/shared": path.resolve(__dirname, "../shared/src/index.ts")
    }
  }
});
