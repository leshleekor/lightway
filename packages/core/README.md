# @lightway/core

Core Lightway contracts and runtime primitives.

## Exports

- registry factories
- definition registry
- execute orchestrator
- schema helpers
- shared types and error classes

## Workspace Path

- `packages/core`

## Usage

```ts
import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry
} from "@lightway/core";
```

## Environment Variables

- Not required

## Notes

This package defines the contracts that all providers, stores, preprocessors, postprocessors, and retrievers implement.
