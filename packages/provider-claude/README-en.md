# @lightway/provider-claude

`@lightway/provider-claude` integrates the Anthropic Claude Messages API behind the Lightway `ModelProvider` contract. Register it once, then reference `claude` from your definitions.

## What it provides

- text generation
- structured output execution
- SSE streaming support
- provider readiness checks through `getStatus`

## Main export

```ts
import { ClaudeProvider } from "@lightway/provider-claude";
```

## Registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { ClaudeProvider } from "@lightway/provider-claude";

const registry = createLightwayRegistry();
registry.registerProvider(new ClaudeProvider());
```

## `ClaudeProvider`

Constructor:

```ts
new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL
});
```

Options:

- `apiKey?`
- `baseUrl?`

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

- `ANTHROPIC_API_KEY`

Optional:

- `ANTHROPIC_BASE_URL`
  - default: `https://api.anthropic.com`

Fixed internal header:

- `anthropic-version`
  - the current implementation pins this to `2023-06-01`

`getStatus()` behavior:

- without an API key: `{ status: "failed", issue: "ANTHROPIC_API_KEY_MISSING" }`
- with an API key: `{ status: "ready" }`

## Definition example

```json
{
  "name": "animal-pedia-claude",
  "provider": "claude",
  "model": "claude-3-5-sonnet-latest",
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
    "stream": true
  }
}
```

Structured output example:

```json
{
  "name": "animal-profile-claude",
  "provider": "claude",
  "model": "claude-3-5-sonnet-latest",
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
const provider = new ClaudeProvider();

const result = await provider.generate({
  requestId: "req-1",
  definitionName: "animal-pedia-claude",
  provider: "claude",
  model: "claude-3-5-sonnet-latest",
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

- The current implementation uses raw `fetch` and direct SSE parsing instead of the official SDK.
- `image-url` input is not supported.
- Structured output relies on Lightway core schema validation and repair, not a Claude-native schema mode.
- During streaming, Anthropic SSE events such as `content_block_delta`, `message_delta`, and `message_stop` are normalized into `ProviderStreamEvent`.
