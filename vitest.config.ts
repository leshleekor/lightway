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
      "@lightway/provider-claude": resolve(
        "packages/provider-claude/src/index.ts"
      ),
      "@lightway/store-in-memory": resolve(
        "packages/store-in-memory/src/index.ts"
      ),
      "@lightway/preprocess-common": resolve(
        "packages/preprocess-common/src/index.ts"
      ),
      "@lightway/preprocess-pii-masking": resolve(
        "packages/preprocess-pii-masking/src/index.ts"
      ),
      "@lightway/postprocess-common": resolve(
        "packages/postprocess-common/src/index.ts"
      ),
      "@lightway/postprocess-audit-log": resolve(
        "packages/postprocess-audit-log/src/index.ts"
      )
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
