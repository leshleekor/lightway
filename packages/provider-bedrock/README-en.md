# @lightway/provider-bedrock

`@lightway/provider-bedrock` integrates the AWS Bedrock Converse API behind the Lightway `ModelProvider` contract. Register it in the provider registry, then reference `bedrock` from your definitions.

## What it provides

- text generation
- streaming support
- provider readiness checks through `getStatus`

## Main export

```ts
import { BedrockProvider } from "@lightway/provider-bedrock";
```

## Registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { BedrockProvider } from "@lightway/provider-bedrock";

const registry = createLightwayRegistry();
registry.registerProvider(new BedrockProvider());
```

## `BedrockProvider`

Constructor:

```ts
new BedrockProvider({
  region: process.env.AWS_REGION
});
```

Option:

- `region?`

Supported capabilities:

- `text-generation`
- `streaming`

Unsupported capability:

- `structured-output`

Main methods:

- `supports(capability)`
- `getStatus()`
- `generate(request)`
- `stream(request, handler)`

## Environment variables

Required:

- `AWS_REGION`

Credentials:

- This package uses the AWS SDK default credential chain.
- Supported sources include:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
  - shared config/profile
  - ECS/EKS task roles
  - EC2 instance roles

`getStatus()` behavior:

- without a region: `{ status: "failed", issue: "AWS_REGION_MISSING" }`
- with a region: `{ status: "ready" }`

## Definition example

```json
{
  "name": "animal-pedia-bedrock",
  "provider": "bedrock",
  "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
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

## Direct usage example

```ts
const provider = new BedrockProvider({
  region: "us-west-2"
});

const result = await provider.generate({
  requestId: "req-1",
  definitionName: "animal-pedia-bedrock",
  provider: "bedrock",
  model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
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

- Internally this package uses `BedrockRuntimeClient` with `ConverseCommand` and `ConverseStreamCommand`.
- `image-url` input is not supported in the current implementation.
- JSON content parts are serialized into text before sending.
- Structured output is not exposed as a provider capability in the current Bedrock implementation.
