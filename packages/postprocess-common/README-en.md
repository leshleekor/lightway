# @lightway/postprocess-common

`@lightway/postprocess-common` contains built-in postprocessors that you can use immediately. It currently includes `TrimTextOutputPostprocessor`, which normalizes strings in the response.

## Provided component

- `TrimTextOutputPostprocessor`

## Main export

```ts
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";
```

## Registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";

const registry = createLightwayRegistry();
registry.registerPostprocessor(new TrimTextOutputPostprocessor());
```

Use it from a definition:

```json
{
  "name": "animal-profile",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Return concise animal information.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "animal": { "type": "string" }
    },
    "required": ["animal"],
    "additionalProperties": false
  },
  "postprocess": ["trim-text-output"]
}
```

## `TrimTextOutputPostprocessor`

Registry name:

- `trim-text-output`

Behavior:

- applies `result.rawText.trim()`
- recursively trims strings inside `result.output`
- records its name in `result.metadata.postprocessedBy`
- records the current request ID in `result.metadata.requestId`

## Output transformation example

Before:

```json
{
  "rawText": "  hello world  ",
  "output": {
    "title": "  Otter  ",
    "tags": ["  playful  ", " aquatic "]
  }
}
```

After postprocessing:

```json
{
  "rawText": "hello world",
  "output": {
    "title": "Otter",
    "tags": ["playful", "aquatic"]
  }
}
```

## Environment variables

This package does not use package-level environment variables.

## When to use it

- when you want to trim leading and trailing whitespace from model output
- when you want structured output strings to be normalized
- when you want a simple reference implementation before writing a custom postprocessor
