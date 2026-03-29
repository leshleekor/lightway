# @lightway/preprocess-pii-masking

`@lightway/preprocess-pii-masking` masks definition-configured PII fields in request input and provider-bound message history before the upstream model call.

## Provided component

- `PiiMaskingPreprocessor`

## Main export

```ts
import { PiiMaskingPreprocessor } from "@lightway/preprocess-pii-masking";
```

## Registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { PiiMaskingPreprocessor } from "@lightway/preprocess-pii-masking";

const registry = createLightwayRegistry();
registry.registerPreprocessor(new PiiMaskingPreprocessor());
```

Use it from a definition:

```json
{
  "name": "customer-support",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful support assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "customer": {
        "type": "object",
        "properties": {
          "customerName": { "type": "string" },
          "customerEmail": { "type": "string" },
          "customerPhone": { "type": "string" },
          "deliveryAddress": { "type": "string" }
        }
      }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input", "pii-masking"],
  "preprocessConfig": {
    "pii-masking": {
      "fieldNames": {
        "customerName": "full-masking",
        "customerEmail": "full-masking",
        "customerPhone": "full-masking",
        "deliveryAddress": "sample-masking"
      }
    }
  }
}
```

## `PiiMaskingPreprocessor`

Registry name:

- `pii-masking`

Behavior:

- recursively masks only the fields whose exact names are configured in `preprocessConfig["pii-masking"].fieldNames`
- rewrites the latest user message using the masked input
- masks `user`, `assistant`, and `tool` history messages at execution time
- does not modify `system` messages or `metadata.source === "rag"` messages
- uses `[fieldName]` tokens for `full-masking`
- uses partial `*` masking for `sample-masking`
- records per-field masking counts in `context.metadata.piiMaskingSummary.fields`

Limitations:

- free-text detection is not used in v1
- target fields must be provided as exact field names in `preprocessConfig["pii-masking"].fieldNames`
- field names are matched by exact string equality only
- if `pii-masking` is declared in `preprocess`, its definition config is required

## Environment variables

This package does not use package-level environment variables.
