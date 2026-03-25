import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lightway/core": resolve("packages/core/src/index.ts"),
      "@lightway/http": resolve("packages/http/src/index.ts"),
      "@lightway/definition-loader-json": resolve(
        "packages/definition-loader-json/src/index.ts"
      ),
      "@lightway/provider-openai": resolve(
        "packages/provider-openai/src/index.ts"
      ),
      "@lightway/provider-bedrock": resolve(
        "packages/provider-bedrock/src/index.ts"
      ),
      "@lightway/context-memory": resolve(
        "packages/context-memory/src/index.ts"
      ),
      "@lightway/plugin-preprocess-common": resolve(
        "packages/plugin-preprocess-common/src/index.ts"
      ),
      "@lightway/plugin-postprocess-common": resolve(
        "packages/plugin-postprocess-common/src/index.ts"
      )
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
