# @lightway/provider-openai

`@lightway/provider-openai` wraps the OpenAI Chat Completions API behind the Lightway `ModelProvider` contract. It is the default OpenAI provider for the boilerplate.

## What it provides

- text generation
- structured output execution
- SSE streaming support
- provider readiness checks through `getStatus`

## Main export

```ts
import { OpenAIProvider } from "@lightway/provider-openai";
```

## Registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());
```

## `OpenAIProvider`

Constructor:

```ts
new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
  organization: process.env.OPENAI_ORGANIZATION,
  project: process.env.OPENAI_PROJECT
});
```

Options:

- `apiKey?`
- `baseUrl?`
- `organization?`
- `project?`

Supported capabilities:

- `text-generation`
- `structured-output`
- `streaming`

Main methods:

- `supports(capability)`
- `getStatus()`
- `generate(request)`
- `stream(request, handler)`

## Environment variables

Required:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_BASE_URL`
  - default: `https://api.openai.com`
- `OPENAI_ORGANIZATION`
- `OPENAI_PROJECT`

`getStatus()` behavior:

- without an API key: `{ status: "failed", issue: "OPENAI_API_KEY_MISSING" }`
- with an API key: `{ status: "ready" }`

## Definition example

```json
{
  "name": "animal-pedia",
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
  "executionOptions": {
    "structuredOutput": false,
    "stream": true
  }
}
```

Structured output example:

```json
{
  "name": "animal-profile",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Return valid JSON only.",
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
      "habitat": { "type": "string" }
    },
    "required": ["name", "habitat"],
    "additionalProperties": false
  },
  "executionOptions": {
    "structuredOutput": true
  }
}
```

## Direct usage example

```ts
const provider = new OpenAIProvider();

const result = await provider.generate({
  requestId: "req-1",
  definitionName: "animal-pedia",
  provider: "openai",
  model: "gpt-5.4-mini-2026-03-17",
  systemPrompt: "You are a helpful assistant.",
  input: { question: "Tell me about otters" },
  messages: [
    {
      role: "user",
      content: "{\"question\":\"Tell me about otters\"}"
    }
  ]
});
```

## Implementation notes

- `image-url` input is not supported by the current implementation.
- Structured output relies on both the OpenAI response and Lightway core schema validation.
- In streaming mode the provider emits `start`, `delta`, `usage`, and `end` events.
