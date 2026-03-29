# Definition Guide

## Overview

This guide explains how to add or edit Lightway definitions in the current template.

The current template assumes the built-in JSON definition loader:

- files in `definitions/*.json` are loaded automatically
- files in `definitions/examples/` are reference examples only
- if you use another definition source later, keep the same definition shape but follow that source's own load/seed workflow

## Where Definition Files Live

Use the top-level `definitions/` directory for active definitions.

```text
definitions/
  animal-pedia.json
  animal-profile.json
  customer-support-pii.json
definitions/examples/
  animal-pedia-claude.json
```

Important:

- `definitions/*.json` is the active load path in this template
- `definitions/examples/*.json` is not auto-loaded
- if you want to use an example, copy it into `definitions/` first

## Required Fields

Every definition should include:

- `name`: unique definition name
- `provider`: registered provider name such as `openai`
- `model`: provider model ID
- `systemPrompt`: system instruction string
- `inputSchema`: request input schema

Minimal example:

```json
{
  "name": "animal-pedia",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are an animal encyclopedia assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  }
}
```

## Common Optional Fields

- `outputSchema`: enables structured output
- `preprocess`: preprocessor names in execution order
- `preprocessConfig`: per-preprocessor configuration
- `postprocess`: postprocessor names in execution order
- `postprocessConfig`: per-postprocessor configuration
- `executionOptions.context`: enable stored conversation context
- `executionOptions.contextStore`: choose a named store
- `executionOptions.structuredOutput`: part of the definition contract, but in the current runtime `outputSchema` is the practical source of truth
- `executionOptions.stream`: enable streaming by default
- `executionOptions.timeoutMs`: provider timeout override
- `executionOptions.temperature`: model temperature override

Structured-output note:

- if `outputSchema` exists, requests run as structured output
- in the current runtime you usually do not need to set `executionOptions.structuredOutput` separately
- sending `structuredOutput: false` for a definition with `outputSchema` causes an error

## Common Patterns

### 1. Text Response Definition

```json
{
  "name": "animal-pedia",
  "description": "Free-form animal encyclopedia answers.",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are an animal encyclopedia assistant. Answer accurately and clearly.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input"],
  "postprocess": ["trim-text-output"],
  "executionOptions": {
    "context": true,
    "contextStore": "memory",
    "stream": false,
    "timeoutMs": 30000,
    "temperature": 0.4
  }
}
```

### 2. Structured Output Definition

```json
{
  "name": "animal-profile",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Return concise factual summaries.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "animal": { "type": "string" }
    },
    "required": ["animal"],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "summary": { "type": "string" }
    },
    "required": ["name", "summary"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input"],
  "postprocess": ["trim-text-output"],
  "executionOptions": {
    "stream": false,
    "timeoutMs": 30000,
    "temperature": 0.2
  }
}
```

### 3. PII Masking Definition

```json
{
  "name": "customer-support-pii",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Respond clearly and keep masked placeholders exactly as provided.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "data": {
        "type": "object",
        "properties": {
          "customerName": { "type": "string" },
          "customerEmail": { "type": "string" }
        },
        "additionalProperties": false
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
        "customerEmail": "full-masking"
      }
    }
  }
}
```

## Fastest Way To Create A New Definition

1. Copy an existing file from `definitions/` or a reference file from `definitions/examples/`.
2. Rename the file.
3. Change `name` so it is unique.
4. Replace `model` with a model enabled in your account.
5. Confirm that `provider` matches a registered provider name.
6. Adjust `systemPrompt`, schemas, and execution options.
7. Run `corepack pnpm validate`.
8. Start or restart `corepack pnpm dev`.
9. Confirm the definition through `/ready` or `/v1/definitions`.

## Runtime Checks

Useful checks after editing definitions:

- `GET /ready`: readiness and warnings
- `GET /v1/definitions`: all loaded definitions
- `GET /v1/definitions/:name`: one sanitized definition

Example:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions/my-definition
```

## Common Errors

- Provider not registered
  The `provider` field must match a provider registered in bootstrap.
- Structured output mismatch
  If `outputSchema` exists, you cannot disable structured output at request time.
- Unknown preprocess or postprocess config key
  `preprocessConfig` and `postprocessConfig` keys must match declared plugin names.
- Missing context store
  If `context` is enabled, the selected store must exist.
- Example file copied but not loaded
  Files left in `definitions/examples/` are ignored by the default loader.

## Practical Notes

- Keep definition names stable because clients call them by `definitionName`.
- The current template defaults to the in-memory `memory` context store.
- Provider credentials are checked at runtime, not by `pnpm validate`.
- If you move to a DB-backed definition source later, keep this definition shape and update the bootstrap/source workflow instead of rewriting the gateway contract.

## Next Guides

- Provider: [provider-en.md](./provider-en.md)
- Pre-Processor: [pre-processor-en.md](./pre-processor-en.md)
- Post-Processor: [post-processor-en.md](./post-processor-en.md)
- Store: [store-en.md](./store-en.md)
