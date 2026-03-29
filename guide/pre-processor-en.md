# Pre-Processor Guide

## Overview

A pre-processor transforms the request context before the provider is called.

To add one cleanly in this monorepo, you usually need to:

1. create a workspace package
2. implement the `Preprocessor` contract
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
  preprocess-custom/
    package.json
    src/
      index.ts
```

Minimal `package.json`:

```json
{
  "name": "@lightway/preprocess-custom",
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

## 2. Implement The Preprocessor

Minimal implementation pattern:

```ts
import type { LightwayContext, Preprocessor } from "@lightway/core";

export class NormalizeInputPreprocessor implements Preprocessor {
  readonly name = "normalize-input";

  async run(context: LightwayContext): Promise<LightwayContext> {
    const normalizedInput =
      typeof context.input === "string" ? context.input.trim() : context.input;

    return {
      ...context,
      input: normalizedInput
    };
  }
}
```

Notes:

- `name` is what definitions use in the `preprocess` array
- if you change `context.input`, you often also need to update `context.messages`
- per-definition config is available in `context.definition.preprocessConfig`

## 3. Wire It Into The Workspace

### Add The Dependency To `apps/gateway`

```json
{
  "dependencies": {
    "@lightway/preprocess-custom": "workspace:*"
  }
}
```

### Add A Root Path Alias

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/preprocess-custom": [
        "packages/preprocess-custom/src/index.ts"
      ]
    }
  }
}
```

### Register It In Bootstrap

Register it in [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts).

```ts
import { NormalizeInputPreprocessor } from "@lightway/preprocess-custom";

registry.registerPreprocessor(new NormalizeInputPreprocessor());
```

## 4. Use It In A Definition

Add the preprocessor name to the definition `preprocess` array.

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
  "preprocess": ["normalize-input", "trim-string-input"]
}
```

If the preprocessor needs definition-specific settings:

```json
{
  "name": "customer-support",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["normalize-input"],
  "preprocessConfig": {
    "normalize-input": {
      "trim": true
    }
  }
}
```

## 5. Add Tests And Package Docs

Recommended follow-up work:

- add `tests/preprocess-custom.test.ts`
- verify how `context.input`, `context.messages`, and `context.metadata` change
- test definition-specific config paths if you use `preprocessConfig`
- add a short package README describing expected config

## Practical Notes

- Prefer returning a new context object instead of mutating the existing one.
- If a definition references an unregistered preprocessor, load-time warnings appear and runtime execution fails when that path is used.
- Use the current naming convention: `preprocess-*`, not `plugin-preprocess-*`.
- Run `corepack pnpm validate` after registration.

## Integration Checklist

- package created under `packages/preprocess-*`
- `package.json` added
- `src/index.ts` exports the preprocessor
- `apps/gateway/package.json` updated
- root `tsconfig.json` path alias updated
- `apps/gateway/src/app.ts` registration added
- definition `preprocess` entry added
- tests added
- `corepack pnpm validate` passes

## Reference Implementations

- Common preprocessors: [`packages/preprocess-common/src/index.ts`](../packages/preprocess-common/src/index.ts)
- PII masking: [`packages/preprocess-pii-masking/src/index.ts`](../packages/preprocess-pii-masking/src/index.ts)
