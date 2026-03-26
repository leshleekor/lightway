# @lightway/store-in-memory

In-memory `ContextStore` implementation for Lightway.

## Exports

- `InMemoryContextStore`

## Workspace Path

- `packages/store-in-memory`

## Usage

```ts
import { InMemoryContextStore } from "@lightway/store-in-memory";

registry.registerContextStore("memory", new InMemoryContextStore());
registry.setDefaultContextStore("memory");
```

## Environment Variables

- Not required

## Notes

This store is suitable for local development and tests. It is not intended for multi-instance shared persistence.
