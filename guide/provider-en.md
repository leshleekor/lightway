# Provider Guide

## Overview

A provider is the adapter that lets Lightway call an AI model backend.

To add one in this monorepo, you need to do more than implement `ModelProvider`:

1. create a workspace package
2. implement the provider class
3. expose it through the package entrypoint
4. add the package to `apps/gateway`
5. add a root `tsconfig.json` path alias
6. register it in bootstrap
7. add at least one test
8. run `corepack pnpm validate`

## 1. Create A Workspace Package

Recommended layout:

```text
packages/
  provider-my-provider/
    package.json
    src/
      index.ts
```

`pnpm-workspace.yaml` already includes `packages/*`, so no extra workspace config is needed.

Minimal `package.json`:

```json
{
  "name": "@lightway/provider-my-provider",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@lightway/core": "workspace:*"
  }
}
```

## 2. Implement The Provider

The contract lives in [`packages/core/src/types.ts`](../packages/core/src/types.ts).

Minimal implementation pattern:

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

export class MyProvider implements ModelProvider {
  readonly name = "my-provider";

  supports(capability: ProviderCapability): boolean {
    return capability === "text-generation";
  }

  getStatus(): ProviderRuntimeStatus {
    return { status: "ready" };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.model) {
      throw new LightwayError("PROVIDER_EXECUTION_FAILED", "Model is missing");
    }

    return {
      rawText: "sample response"
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

Capability notes:

- `text-generation`: plain text generation
- `structured-output`: definitions with `outputSchema`
- `streaming`: streaming responses
- `tool-calling`: reserved for a future phase

## 3. Wire It Into The Workspace

### Add The Dependency To `apps/gateway`

If `apps/gateway/src/app.ts` imports your provider package, add it to [`apps/gateway/package.json`](../apps/gateway/package.json).

```json
{
  "dependencies": {
    "@lightway/provider-my-provider": "workspace:*"
  }
}
```

### Add A Root Path Alias

Add the package alias to [`tsconfig.json`](../tsconfig.json) so the app and tests can import it consistently.

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/provider-my-provider": [
        "packages/provider-my-provider/src/index.ts"
      ]
    }
  }
}
```

### Register It In Bootstrap

Register the provider in [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts).

```ts
import { MyProvider } from "@lightway/provider-my-provider";

registry.registerProvider(new MyProvider());
```

## 4. Use It From A Definition

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

## 5. Add Tests And Package Docs

Recommended follow-up work:

- add `tests/provider-my-provider.test.ts`
- cover `getStatus()`, `generate()`, and `stream()` behavior
- verify capability reporting if you support structured output or streaming
- add a package README so future maintainers know required env vars and upstream API behavior

## Practical Notes

- Map `ProviderRequest` fields to the upstream API as directly as possible.
- Pass `abortSignal` to upstream requests when supported.
- Prefer always setting `ProviderResponse.rawText`.
- Convert provider-specific failures into `LightwayError` when you can.
- Run `corepack pnpm validate` after wiring the package into the workspace.

## Integration Checklist

- package directory created under `packages/`
- `package.json` added with `@lightway/core` as `workspace:*`
- `src/index.ts` exports the provider class
- `apps/gateway/package.json` updated
- root `tsconfig.json` path alias updated
- `apps/gateway/src/app.ts` registration added
- definition uses the correct `provider` name
- tests added
- `corepack pnpm validate` passes

## Reference Implementations

- OpenAI provider: [`packages/provider-openai/src/index.ts`](../packages/provider-openai/src/index.ts)
- Bedrock provider: [`packages/provider-bedrock/src/index.ts`](../packages/provider-bedrock/src/index.ts)
- Claude provider: [`packages/provider-claude/src/index.ts`](../packages/provider-claude/src/index.ts)
