# Provider Guide

## Overview

A provider is the adapter that lets Lightway talk to an actual AI model backend.
To add a new provider, implement the `ModelProvider` interface from `@lightway/core` and register it in the application bootstrap.

Providers are used in this order:

1. A definition points to a `provider` name.
2. The registry resolves a provider with the same name.
3. The orchestrator calls `generate()` or `stream()`.

If the provider is not registered, definition loading fails.

## Interface To Implement

The core contract lives in [`packages/core/src/types.ts`](../packages/core/src/types.ts).

```ts
import type {
  ModelProvider,
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
  ProviderRuntimeStatus,
  ProviderStreamHandler
} from "@lightway/core";

export class ExampleProvider implements ModelProvider {
  readonly name = "example";

  supports(capability: ProviderCapability): boolean {
    return capability === "text-generation";
  }

  getStatus(): ProviderRuntimeStatus {
    return { status: "ready" };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    return {
      rawText: "hello"
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    await handler({ type: "start" });
    await handler({ type: "delta", text: "hello" });
    await handler({ type: "end", finishReason: "stop" });
  }
}
```

## Recommended Package Layout

The cleanest option in this monorepo is to place the provider in its own package.

```text
packages/
  provider-my-provider/
    package.json
    src/
      index.ts
```

Using a package name such as `@lightway/provider-my-provider` keeps it consistent with the existing workspace.

## Implementation Steps

### 1. Create the provider class

This is a minimal implementation pattern.

```ts
import {
  LightwayError,
  type ModelProvider,
  type ProviderCapability,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderRuntimeStatus,
  type ProviderStreamHandler
} from "@lightway/core";

export interface MyProviderOptions {
  apiKey?: string;
}

export class MyProvider implements ModelProvider {
  readonly name = "my-provider";
  private readonly apiKey?: string;

  constructor(options: MyProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.MY_PROVIDER_API_KEY;
  }

  supports(capability: ProviderCapability): boolean {
    return (
      capability === "text-generation" ||
      capability === "structured-output" ||
      capability === "streaming"
    );
  }

  getStatus(): ProviderRuntimeStatus {
    if (!this.apiKey) {
      return {
        status: "failed",
        issue: "MY_PROVIDER_API_KEY_MISSING"
      };
    }

    return {
      status: "ready"
    };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new LightwayError(
        "PROVIDER_EXECUTION_FAILED",
        "Provider API key is not configured"
      );
    }

    return {
      rawText: "sample response",
      metadata: {
        requestId: request.requestId
      }
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    await handler({ type: "start" });
    await handler({ type: "delta", text: "sample response" });
    await handler({ type: "end", finishReason: "stop" });
  }
}
```

### 2. Declare capabilities accurately

- `text-generation`: basic text generation
- `structured-output`: definitions with `outputSchema`
- `streaming`: streaming responses
- `tool-calling`: reserved for future use; no execution path yet

`supports()` should only return `true` for capabilities you really implement.

### 3. Map request fields

`ProviderRequest` includes:

- `model`: model selected by the definition
- `systemPrompt`: final system prompt after RAG merge
- `messages`: conversation after preprocessing and context loading
- `outputSchema`: schema used for structured output validation
- `generationOptions.temperature`, `generationOptions.maxTokens`
- `providerOptions`: provider-specific definition options
- `abortSignal`: timeout and cancellation signal

In practice, your provider should map these fields as directly as possible to the upstream API.

### 4. Register it in the registry

Register the provider during application bootstrap.
The current bootstrap example is in [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts).

```ts
import { createLightwayRegistry } from "@lightway/core";
import { MyProvider } from "@lightway/provider-my-provider";

const registry = createLightwayRegistry();

registry.registerProvider(new MyProvider());
```

The registry throws if another provider already uses the same `name`.

### 5. Reference it from a definition

The definition `provider` field must exactly match the provider `name`.

```json
{
  "name": "custom-chat",
  "provider": "my-provider",
  "model": "my-model-v1",
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

## Practical Notes

- `getStatus()` feeds readiness checks, so use it to expose missing credentials or broken configuration.
- If you support streaming, pass `abortSignal` to the upstream client there as well.
- If you support structured output, configure the upstream call to return JSON-only output when possible.
- Prefer always setting `ProviderResponse.rawText`; post-processing and persistence rely on it.
- Converting provider-specific failures into `LightwayError` makes diagnostics much easier.

## Reference Implementations

- OpenAI provider: [`packages/provider-openai/src/index.ts`](../packages/provider-openai/src/index.ts)
- Bedrock provider: [`packages/provider-bedrock/src/index.ts`](../packages/provider-bedrock/src/index.ts)
- Claude provider: [`packages/provider-claude/src/index.ts`](../packages/provider-claude/src/index.ts)
- Provider registration example: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
