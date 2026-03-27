# @lightway/preprocess-common

`@lightway/preprocess-common` contains built-in preprocessors that you can use immediately. It currently ships with `TrimStringInputPreprocessor`, which normalizes strings in the request input.

## Provided component

- `TrimStringInputPreprocessor`

## Main export

```ts
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";
```

## Registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";

const registry = createLightwayRegistry();
registry.registerPreprocessor(new TrimStringInputPreprocessor());
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
      "message": { "type": "string" }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input"]
}
```

## `TrimStringInputPreprocessor`

Registry name:

- `trim-string-input`

Behavior:

- recursively trims all string values in the input
- rewrites the latest user message content using the trimmed input
- does not modify RAG-injected user messages (`metadata.source === "rag"`)
- records its name in `context.metadata.preprocessedBy`

## Input transformation example

Input:

```json
{
  "message": "  hello world  ",
  "tags": ["  a  ", " b "]
}
```

After preprocessing:

```json
{
  "message": "hello world",
  "tags": ["a", "b"]
}
```

## Environment variables

This package does not use package-level environment variables.

## When to use it

- when you want consistent trimming of user input
- when you want normalized strings before prompt assembly
- when you want a simple reference implementation before writing a custom preprocessor
