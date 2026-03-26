# Store Guide

## Overview

A store is the component responsible for persisting and loading conversation context.
In this project, you implement the `ContextStore` interface and register it in the registry.

A store is used when:

- `context` is `true` in the definition or request
- `executionOptions.contextStore` is set, or a default store is configured

If no usable store exists, context-enabled execution fails.

## Interface To Implement

```ts
import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStore,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

export class ExampleStore implements ContextStoreWithTtl {
  async get(
    contextId: string,
    options?: ContextLoadOptions
  ): Promise<LightwayMessage[]> {
    return [];
  }

  async append(contextId: string, messages: LightwayMessage[]): Promise<void> {}

  async create(): Promise<string> {
    return randomUUID();
  }

  async setTtl(contextId: string, ttlSeconds: number): Promise<void> {}
}
```

`get()` and `append()` are required.
`create()` and `setTtl()` are optional.

## Method Responsibilities

- `get(contextId, options)`: load stored messages
- `append(contextId, messages)`: append user and assistant messages
- `create()`: create a new context ID yourself if you want to
- `setTtl()`: support `contextWindow.ttlSeconds`

Even without `create()`, the orchestrator can generate a UUID automatically.

## Example Implementation

This example shows the typical pattern for wrapping a database or Redis client.

```ts
import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

export interface DatabaseClient {
  loadMessages(
    contextId: string,
    limit?: number
  ): Promise<LightwayMessage[]>;
  saveMessages(contextId: string, messages: LightwayMessage[]): Promise<void>;
  updateExpiry(contextId: string, expiresAt: Date): Promise<void>;
}

export class DatabaseContextStore implements ContextStoreWithTtl {
  constructor(private readonly client: DatabaseClient) {}

  async get(
    contextId: string,
    options?: ContextLoadOptions
  ): Promise<LightwayMessage[]> {
    return await this.client.loadMessages(contextId, options?.limit);
  }

  async append(contextId: string, messages: LightwayMessage[]): Promise<void> {
    await this.client.saveMessages(contextId, messages);
  }

  async create(): Promise<string> {
    return randomUUID();
  }

  async setTtl(contextId: string, ttlSeconds: number): Promise<void> {
    await this.client.updateExpiry(
      contextId,
      new Date(Date.now() + ttlSeconds * 1_000)
    );
  }
}
```

## Register In The Registry

The store name is referenced by definitions, so choose it intentionally.

```ts
import { createLightwayRegistry } from "@lightway/core";
import { DatabaseContextStore } from "@lightway/store-database";

const registry = createLightwayRegistry();

registry.registerContextStore("database", new DatabaseContextStore(client));
registry.setDefaultContextStore("database");
```

`setDefaultContextStore()` only works after that store has been registered.

## Use It In A Definition

Select the store through `executionOptions.contextStore`.

```json
{
  "name": "custom-chat",
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
    "context": true,
    "contextStore": "database",
    "contextWindow": {
      "maxMessages": 20,
      "ttlSeconds": 86400
    }
  }
}
```

If the definition does not specify `contextStore`, the registry default store is used.

## Good Use Cases

- keeping conversations in Redis
- storing context in PostgreSQL, MySQL, or DynamoDB
- applying TTL policies per conversation
- sharing context across multiple application instances

## Practical Notes

- Respecting `options.limit` in `get()` helps both memory usage and latency.
- Persisting the `LightwayMessage` shape as-is is usually the simplest approach.
- Store load failures surface as `CONTEXT_LOAD_FAILED`; save failures surface as `CONTEXT_SAVE_FAILED`.
- If a definition references a missing store, you get a warning at load time and a runtime error when context execution tries to use it.
- If your backend does not support TTL, you can omit `setTtl()`.

## Reference Implementation

- In-memory store: [`packages/context-memory/src/index.ts`](../packages/context-memory/src/index.ts)
- Registration example: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
- Definition example: [`definitions/animal-pedia.json`](../definitions/animal-pedia.json)
