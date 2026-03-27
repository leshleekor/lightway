# @lightway/store-in-memory

`@lightway/store-in-memory` is an in-memory implementation of the Lightway `ContextStore` contract. It is suitable for local development, tests, and single-process demos.

## What it provides

- in-memory conversation storage
- new `contextId` creation
- message append/get operations
- TTL support with periodic cleanup

## Main export

```ts
import { InMemoryContextStore } from "@lightway/store-in-memory";
```

## Basic registration

```ts
import { createLightwayRegistry } from "@lightway/core";
import { InMemoryContextStore } from "@lightway/store-in-memory";

const registry = createLightwayRegistry();

registry.registerContextStore("memory", new InMemoryContextStore());
registry.setDefaultContextStore("memory");
```

To bind a definition to a specific store:

```json
{
  "name": "chat-with-memory",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": { "type": "string" },
  "executionOptions": {
    "context": true,
    "contextStore": "memory"
  }
}
```

## `InMemoryContextStore`

Constructor:

```ts
new InMemoryContextStore(cleanupIntervalMs);
```

Option:

- `cleanupIntervalMs`
  - cleanup interval for expired contexts
  - default `60_000`

Methods:

- `create()`
  - creates a new `contextId` and initializes an empty conversation
- `get(contextId, options?)`
  - reads stored messages
  - if `options.limit` is provided, only the latest N messages are returned
- `append(contextId, messages)`
  - appends messages to the existing conversation
- `setTtl(contextId, ttlSeconds)`
  - sets the expiration time for the conversation

## Direct usage example

```ts
const store = new InMemoryContextStore();

const contextId = await store.create();
await store.append(contextId, [
  {
    role: "user",
    content: "hello",
    timestamp: new Date().toISOString()
  }
]);

const messages = await store.get(contextId);
```

## Behavior notes

- Data is stored only in process memory.
- All data is lost when the process restarts.
- It is not a shared store for multiple instances.
- Expired items are removed on read or during scheduled cleanup.

## Environment variables

This package does not use package-level environment variables.

## When to use this package

- local development
- tests
- single-instance demos

For production-grade shared persistence, create or adopt a dedicated `store-*` package.
