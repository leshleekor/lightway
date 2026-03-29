# Pre-Processor Guide

## Overview

A pre-processor transforms the request context before the provider is called.
The execution order is:

1. Input validation
2. Context loading
3. Pre-processors
4. RAG
5. Provider call

That makes pre-processors a good fit for normalizing input, adjusting messages, or attaching metadata.

## Interface To Implement

```ts
import type { LightwayContext, Preprocessor } from "@lightway/core";

export class ExamplePreprocessor implements Preprocessor {
  readonly name = "example-preprocessor";

  async run(context: LightwayContext): Promise<LightwayContext> {
    return context;
  }
}
```

`name` is the identifier referenced from the definition `preprocess` array.

If your preprocessor needs per-definition settings, it can read them from
`context.definition.preprocessConfig?.[preprocessorName]`.

## Example Implementation

This example normalizes string input and keeps the latest user message in sync.

```ts
import type { LightwayContext, Preprocessor } from "@lightway/core";

function normalizeInput(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ");
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeInput(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, normalizeInput(current)])
    );
  }

  return value;
}

export class NormalizeInputPreprocessor implements Preprocessor {
  readonly name = "normalize-input";

  async run(context: LightwayContext): Promise<LightwayContext> {
    const normalizedInput = normalizeInput(context.input);
    const nextMessages = [...context.messages];

    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      const message = nextMessages[index];
      if (!message) {
        continue;
      }

      if (message.role === "user" && message.metadata?.source !== "rag") {
        nextMessages[index] = {
          ...message,
          content:
            typeof normalizedInput === "string"
              ? normalizedInput
              : JSON.stringify(normalizedInput, null, 2)
        };
        break;
      }
    }

    return {
      ...context,
      input: normalizedInput,
      messages: nextMessages,
      metadata: {
        ...context.metadata,
        normalizedBy: this.name
      }
    };
  }
}
```

## Register In The Registry

Register the pre-processor at bootstrap time.

```ts
import { createLightwayRegistry } from "@lightway/core";
import { NormalizeInputPreprocessor } from "@lightway/plugin-preprocess-custom";

const registry = createLightwayRegistry();

registry.registerPreprocessor(new NormalizeInputPreprocessor());
```

The current bootstrap example lives in [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts).

## Use It In A Definition

Add names to the definition `preprocess` array. They run in array order.

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

Definition-specific config can be supplied through `preprocessConfig`.

```json
{
  "name": "customer-support",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "customerName": { "type": "string" }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["pii-masking"],
  "preprocessConfig": {
    "pii-masking": {
      "fieldNames": {
        "customerName": "full-masking",
        "deliveryAddress": "sample-masking"
      }
    }
  }
}
```

## Good Use Cases

- input string cleanup
- sensitive data masking
- shared metadata injection
- converting input objects to an internal canonical shape
- refining a query before RAG runs

## Practical Notes

- Prefer returning a new context object instead of mutating the existing one.
- If you change `context.input`, also update `context.messages` so the provider sees the same data.
- If you need Definition-specific behavior, document the expected shape in `preprocessConfig`.
- If a pre-processor throws, the orchestrator wraps it as `PREPROCESS_FAILED`.
- If a definition references an unregistered name, you get a warning at load time and a runtime error when that path executes.

## Reference Implementation

- Built-in implementation: [`packages/preprocess-common/src/index.ts`](../packages/preprocess-common/src/index.ts)
- PII masking example: [`packages/preprocess-pii-masking/src/index.ts`](../packages/preprocess-pii-masking/src/index.ts)
- Registration example: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
