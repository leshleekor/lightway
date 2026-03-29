# Post-Processor Guide

## Overview

A post-processor transforms the result after the provider responds and before the final API response is returned.

Typical integration steps in this monorepo:

1. create a workspace package
2. implement the `Postprocessor` contract
3. export it through `src/index.ts`
4. add the package to `apps/gateway`
5. add a root `tsconfig.json` path alias
6. register it in bootstrap
7. reference it from a definition
8. add tests and run `corepack pnpm validate`

## 1. Create A Workspace Package

Recommended layout:

```text
packages/
  postprocess-custom/
    package.json
    src/
      index.ts
```

Minimal `package.json`:

```json
{
  "name": "@lightway/postprocess-custom",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@lightway/core": "workspace:*"
  }
}
```

## 2. Implement The Post-Processor

Minimal implementation pattern:

```ts
import type { LightwayContext, LightwayResult, Postprocessor } from "@lightway/core";

export class CleanOutputPostprocessor implements Postprocessor {
  readonly name = "clean-output";

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    return {
      ...result,
      rawText: result.rawText.trim(),
      metadata: {
        ...result.metadata,
        postprocessedBy: this.name,
        requestId: context.requestId
      }
    };
  }
}
```

Notes:

- `name` is what definitions use in the `postprocess` array
- for structured output, keep `result.output` aligned with any changes you make
- post-processors run before context persistence

## 3. Wire It Into The Workspace

### Add The Dependency To `apps/gateway`

```json
{
  "dependencies": {
    "@lightway/postprocess-custom": "workspace:*"
  }
}
```

### Add A Root Path Alias

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/postprocess-custom": [
        "packages/postprocess-custom/src/index.ts"
      ]
    }
  }
}
```

### Register It In Bootstrap

```ts
import { CleanOutputPostprocessor } from "@lightway/postprocess-custom";

registry.registerPostprocessor(new CleanOutputPostprocessor());
```

## 4. Use It In A Definition

```json
{
  "name": "custom-chat",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  },
  "postprocess": ["clean-output", "trim-text-output"]
}
```

If the post-processor needs per-definition configuration:

```json
{
  "name": "custom-chat",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": { "type": "string" },
  "postprocess": ["clean-output"],
  "postprocessConfig": {
    "clean-output": {
      "trim": true
    }
  }
}
```

## 5. Add Tests And Package Docs

Recommended follow-up work:

- add `tests/postprocess-custom.test.ts`
- verify raw text and structured output changes
- verify metadata additions
- add a package README describing config, side effects, and assumptions

## Practical Notes

- For plain-text responses, work from `rawText`.
- For structured-output definitions, keep `result.output` consistent.
- Use the current naming convention: `postprocess-*`, not `plugin-postprocess-*`.
- Run `corepack pnpm validate` after wiring everything up.

## Integration Checklist

- package created under `packages/postprocess-*`
- `package.json` added
- `src/index.ts` exports the post-processor
- `apps/gateway/package.json` updated
- root `tsconfig.json` path alias updated
- `apps/gateway/src/app.ts` registration added
- definition `postprocess` entry added
- tests added
- `corepack pnpm validate` passes

## Reference Implementations

- Common postprocessors: [`packages/postprocess-common/src/index.ts`](../packages/postprocess-common/src/index.ts)
- Audit logging: [`packages/postprocess-audit-log/src/index.ts`](../packages/postprocess-audit-log/src/index.ts)
