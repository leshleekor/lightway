# @lightway/core

`@lightway/core` contains the central contracts and composition APIs for the Lightway boilerplate. Providers, preprocessors, postprocessors, stores, RAG retrievers, definition loaders, and HTTP adapters all build on the types and runtime rules defined here.

## What this package provides

- Registry composition APIs
- Definition registry and validation
- Execute orchestrator
- Shared types and error classes
- Schema validation and prompt-text helpers
- Execution end hook contract (`onExecutionEnd`)

## Main exports

```ts
import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry,
  LightwayError
} from "@lightway/core";
```

Frequently used types:

- `AIDefinition`
- `LightwayContext`
- `LightwayResult`
- `ModelProvider`
- `Preprocessor`
- `Postprocessor`
- `ContextStore`
- `RagRetriever`
- `ExecutionHook`
- `GatewayStreamEvent`

## Basic composition example

```ts
import { createDefinitionRegistry, createExecuteOrchestrator, createLightwayRegistry } from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());

const definitionRegistry = createDefinitionRegistry();
await definitionRegistry.load(
  new JsonDefinitionSource({ directory: "./definitions" }),
  registry
);

const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry
});
```

## Registry API

The registry created by `createLightwayRegistry()` stores and resolves runtime components.

- `registerProvider(provider)`
- `registerPreprocessor(preprocessor)`
- `registerPostprocessor(postprocessor)`
- `registerRagRetriever(retriever)`
- `registerContextStore(name, store)`
- `setDefaultContextStore(name)`
- `getProvider(name)` / `getPreprocessor(name)` / `getPostprocessor(name)` / `getContextStore(name)`
- `listProviders()` / `listPreprocessors()` / `listPostprocessors()` / `listContextStores()`

Important behavior:

- Duplicate registrations throw `ConfigurationError`.
- A default context store must be registered before calling `setDefaultContextStore()`.

## Definition registry

`createDefinitionRegistry()` validates and stores definitions loaded from a `DefinitionSource`.

Main methods:

- `load(source, registry)`
- `get(name)`
- `list()`
- `getWarnings(name)`
- `listWarnings()`

Validation examples:

- required `name`, `provider`, `model`, `systemPrompt`
- `inputSchema` and `outputSchema` validity
- `preprocess`, `postprocess`, `rag`, and `executionOptions` structure
- referenced provider existence

Notes:

- If a referenced provider is not registered, `load()` fails.
- Missing preprocessors, postprocessors, stores, and retrievers are recorded as warnings.

## Execute orchestrator

`createExecuteOrchestrator()` resolves a definition and runs the full execution pipeline.

```ts
const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry,
  defaultTimeoutMs: 30_000,
  onExecutionEnd: async (event) => {
    console.log(event.status, event.definitionName, event.requestId);
  }
});
```

Options:

- `registry`: runtime component registry
- `definitionRegistry`: loaded definition registry
- `defaultTimeoutMs`: fallback timeout when the request and definition do not provide one
- `onExecutionEnd`: hook invoked at the end of successful and failed executions

Main methods:

- `execute(request, { requestId? })`
- `stream(request, { requestId?, onEvent })`

## Custom component contracts

Provider:

```ts
interface ModelProvider {
  name: string;
  supports(capability: ProviderCapability): boolean;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  stream?(request: ProviderRequest, handler: ProviderStreamHandler): Promise<void>;
  getStatus?(): ProviderRuntimeStatus;
}
```

Preprocessor:

```ts
interface Preprocessor {
  name: string;
  run(context: LightwayContext): Promise<LightwayContext>;
}
```

Postprocessor:

```ts
interface Postprocessor {
  name: string;
  run(result: LightwayResult, context: LightwayContext): Promise<LightwayResult>;
}
```

Store:

```ts
interface ContextStore {
  get(contextId: string, options?: { limit?: number }): Promise<LightwayMessage[]>;
  append(contextId: string, messages: LightwayMessage[]): Promise<void>;
  create?(): Promise<string>;
}
```

## Execution hook

Audit logging, metrics, and external tracing integrations should use `ExecutionHook`.

```ts
type ExecutionHook = (event: ExecutionHookEvent) => Promise<void> | void;
```

`ExecutionHookEvent` includes:

- `requestId`
- `definitionName`
- `provider`, `model`
- `contextId`
- `status`
- `latencyMs`
- `finishReason`
- `usage`
- `rawText`, `output`
- `error`
- `metadata`

## Environment variables

This package does not require package-level environment variables.

## When to depend on this package directly

- when creating a new provider, store, or processor
- when writing your own bootstrap code
- when reusing execution hooks, readiness, or schema validation rules
- when exposing Lightway through a non-HTTP entry point such as a CLI, worker, or queue consumer
