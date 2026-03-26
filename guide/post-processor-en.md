# Post-Processor Guide

## Overview

A post-processor transforms the result after the provider responds and before the final API response is returned.
The execution order is:

1. Provider response
2. Structured-output validation and repair when needed
3. Post-processors
4. Context persistence
5. API response

That makes post-processors a good fit for output cleanup, redaction, and metadata enrichment.

## Interface To Implement

```ts
import type { LightwayContext, LightwayResult, Postprocessor } from "@lightway/core";

export class ExamplePostprocessor implements Postprocessor {
  readonly name = "example-postprocessor";

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    return result;
  }
}
```

## Example Implementation

This example cleans text output and adds metadata.

```ts
import type { LightwayContext, LightwayResult, Postprocessor } from "@lightway/core";

function trimDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => trimDeep(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, trimDeep(current)])
    );
  }

  return value;
}

export class CleanOutputPostprocessor implements Postprocessor {
  readonly name = "clean-output";

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    return {
      ...result,
      rawText: result.rawText.trim(),
      output: trimDeep(result.output),
      metadata: {
        ...result.metadata,
        postprocessedBy: this.name,
        requestId: context.requestId
      }
    };
  }
}
```

## Register In The Registry

```ts
import { createLightwayRegistry } from "@lightway/core";
import { CleanOutputPostprocessor } from "@lightway/plugin-postprocess-custom";

const registry = createLightwayRegistry();

registry.registerPostprocessor(new CleanOutputPostprocessor());
```

The default registration example is in [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts).

## Use It In A Definition

Add names to the definition `postprocess` array. They run in array order.

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

## Good Use Cases

- text cleanup
- post-processing structured JSON fields
- removing sensitive data
- adding usage or trace metadata
- shaping the final product-facing output

## Practical Notes

- For structured-output definitions, `result.output` may become the final API response, so keep it consistent.
- For plain-text responses, `result.output` can be undefined, so handle `rawText` as well.
- Post-processors run before context persistence, so the saved assistant message reflects the processed output.
- If a definition references an unregistered name, you get a warning at load time and a runtime error when that path executes.

## Reference Implementation

- Built-in implementation: [`packages/plugin-postprocess-common/src/index.ts`](../packages/plugin-postprocess-common/src/index.ts)
- Registration example: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
