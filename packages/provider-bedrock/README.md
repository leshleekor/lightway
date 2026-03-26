# @lightway/provider-bedrock

AWS Bedrock Converse provider for Lightway.

## Exports

- `BedrockProvider`
- `BedrockProviderOptions`

## Workspace Path

- `packages/provider-bedrock`

## Usage

```ts
import { BedrockProvider } from "@lightway/provider-bedrock";

registry.registerProvider(new BedrockProvider());
```

## Environment Variables

Required:

- `AWS_REGION`: AWS region for Bedrock Runtime.

Credentials:

- This package follows the AWS SDK default credential chain.
- Supported sources include `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, shared config/profile, ECS/EKS task roles, and EC2 instance roles.

## Definition Example

```json
{
  "name": "animal-pedia-bedrock",
  "provider": "bedrock",
  "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "string"
  }
}
```

## Notes

Structured output is not exposed as a provider capability in the current Bedrock implementation.
