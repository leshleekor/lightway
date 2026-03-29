# Store Guide

## Overview

A store persists and loads conversation context.

In this monorepo, adding a custom store usually means:

1. create a workspace package
2. implement `ContextStore` or `ContextStoreWithTtl`
3. export it through `src/index.ts`
4. add the package to `apps/gateway`
5. add a root `tsconfig.json` path alias
6. register it in bootstrap
7. point definitions to the store name
8. add tests and run `corepack pnpm validate`

## 1. Create A Workspace Package

Recommended layout:

```text
packages/
  store-database/
    package.json
    src/
      index.ts
```

Minimal `package.json`:

```json
{
  "name": "@lightway/store-database",
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

## 2. Implement The Store

Minimal implementation pattern:

```ts
import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

export class DatabaseContextStore implements ContextStoreWithTtl {
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

Notes:

- `get()` and `append()` are required
- `create()` and `setTtl()` are optional
- if `contextWindow.ttlSeconds` matters for your backend, implement `setTtl()`

## 3. Wire It Into The Workspace

### Add The Dependency To `apps/gateway`

```json
{
  "dependencies": {
    "@lightway/store-database": "workspace:*"
  }
}
```

### Add A Root Path Alias

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/store-database": [
        "packages/store-database/src/index.ts"
      ]
    }
  }
}
```

### Register It In Bootstrap

Register the store in [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts).

```ts
import { DatabaseContextStore } from "@lightway/store-database";

registry.registerContextStore("database", new DatabaseContextStore());
registry.setDefaultContextStore("database");
```

## 4. Use It In A Definition

Select the store with `executionOptions.contextStore`.

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

## 5. Add Tests And Package Docs

Recommended follow-up work:

- add `tests/store-database.test.ts`
- verify `get()`, `append()`, and optional `create()` or `setTtl()`
- test `options.limit` handling
- add a package README that documents durability, ordering, and TTL behavior

## Practical Notes

- Preserve the `LightwayMessage` shape in storage if possible.
- If a definition references a missing store, readiness degrades or execution fails once context is needed.
- The built-in `memory` store is fine for local development only.
- Run `corepack pnpm validate` after wiring the store into the workspace.

## Integration Checklist

- package created under `packages/store-*`
- `package.json` added
- `src/index.ts` exports the store
- `apps/gateway/package.json` updated
- root `tsconfig.json` path alias updated
- `apps/gateway/src/app.ts` registration added
- default store set if needed
- definitions point to the correct store name
- tests added
- `corepack pnpm validate` passes

## Reference Implementations

- In-memory store: [`packages/store-in-memory/src/index.ts`](../packages/store-in-memory/src/index.ts)
