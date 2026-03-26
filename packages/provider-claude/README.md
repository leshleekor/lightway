# @lightway/provider-claude

Anthropic Claude Messages API provider for Lightway.

## Exports

- `ClaudeProvider`
- `ClaudeProviderOptions`

## Workspace Path

- `packages/provider-claude`

## Usage

```ts
import { ClaudeProvider } from "@lightway/provider-claude";

registry.registerProvider(new ClaudeProvider());
```

## Environment Variables

Required:

- `ANTHROPIC_API_KEY`: Anthropic API key.

Optional:

- `ANTHROPIC_BASE_URL`: API base URL. Default `https://api.anthropic.com`.

Fixed Internal Header:

- `anthropic-version`: fixed to `2023-06-01` in the current implementation.

## Definition Example

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
  }
}
```

## Notes

- The initial implementation uses raw `fetch` and direct SSE parsing.
- Structured output is supported through Lightway core validation and repair flow rather than a Claude-native schema mode.
