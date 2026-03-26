# @lightway/provider-openai

OpenAI chat-completions provider for Lightway.

## Exports

- `OpenAIProvider`
- `OpenAIProviderOptions`

## Workspace Path

- `packages/provider-openai`

## Usage

```ts
import { OpenAIProvider } from "@lightway/provider-openai";

registry.registerProvider(new OpenAIProvider());
```

## Environment Variables

Required:

- `OPENAI_API_KEY`: OpenAI API key.

Optional:

- `OPENAI_BASE_URL`: API base URL. Default `https://api.openai.com`.
- `OPENAI_ORGANIZATION`: OpenAI organization header.
- `OPENAI_PROJECT`: OpenAI project header.

## Definition Example

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
  }
}
```
