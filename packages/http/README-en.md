# @lightway/http

`@lightway/http` is the Fastify-based HTTP adapter for exposing the Lightway runtime. Compose your registry, definition registry, and orchestrator, then use this package to accept external requests.

## What it provides

- Fastify server creation
- bearer-token auth handling
- `/health` and `/ready` endpoints
- definition, provider, and capability endpoints
- JSON execution endpoint
- SSE streaming responses

## Main exports

```ts
import { buildReadinessReport, createGatewayServer } from "@lightway/http";
```

## Basic usage

```ts
import { createDefinitionRegistry, createExecuteOrchestrator, createLightwayRegistry } from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { createGatewayServer } from "@lightway/http";
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

const app = await createGatewayServer({
  registry,
  definitionRegistry,
  orchestrator,
  authToken: process.env.LIGHTWAY_AUTH_TOKEN
});

await app.listen({ port: 3000, host: "0.0.0.0" });
```

## `createGatewayServer(options)`

Options:

- `registry`: `LightwayRegistry`
- `definitionRegistry`: `DefinitionRegistry`
- `orchestrator`: `ExecuteOrchestrator`
- `authToken?`: bearer token used on `/v1/*`
- `maxRequestBytes?`: Fastify body limit. Default `1_048_576`
- `bootIssues?`: diagnostic messages collected during bootstrap
- `logger?`: enable Fastify logger

Returns:

- `Promise<FastifyInstance>`

## Exposed endpoints

- `GET /health`
  - process liveness
- `GET /ready`
  - readiness report for definitions, providers, auth, and context store
- `GET /v1/definitions`
  - list definitions
- `GET /v1/definitions/:name`
  - get one definition
- `GET /v1/providers`
  - list registered providers and runtime status
- `GET /v1/capabilities`
  - gateway and provider capability list
- `POST /v1/execute`
  - execute as JSON or SSE streaming

## Authentication

- `/v1/*` requires a bearer token.
- If `authToken` is missing or does not match, the package raises `UNAUTHORIZED`.

Example:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions
```

## Streaming

If `stream` is enabled by the request or definition, `/v1/execute` responds with SSE.

SSE events:

- `start`
- `delta`
- `usage`
- `output`
- `end`
- `error`

## `buildReadinessReport(options)`

Use this when you want readiness logic without starting the HTTP server.

```ts
const readiness = buildReadinessReport({
  registry,
  definitionRegistry,
  authToken: process.env.LIGHTWAY_AUTH_TOKEN,
  bootIssues: []
});
```

Reported checks:

- `definitions`
- `providers`
- `auth`
- `contextStore`

## Environment variables

This package does not read package-level environment variables directly. All required values are injected through `createGatewayServer()`.

At the app level, you will usually manage values such as:

- `LIGHTWAY_AUTH_TOKEN`
- `LIGHTWAY_MAX_REQUEST_BYTES`
- `LIGHTWAY_DEFAULT_TIMEOUT_MS`
- `LIGHTWAY_DEFINITIONS_DIR`

## When to use this package

- when you want a Fastify-based API server quickly
- when building or replacing the gateway app
- when you want to keep the readiness and SSE contracts consistent with the boilerplate
