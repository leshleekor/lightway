# Lightway

Lightway is a lightweight AI gateway boilerplate for startups, small teams, and solo builders.

It sits between your product and one or more AI providers and gives you a consistent execution path:

`Gateway Controller -> Pre-Process Layer -> RAG Layer -> Model Provider -> Post-Process Layer -> Return Result`

## What You Get

- Definition-first AI execution
- Provider-agnostic gateway structure
- Fastify-based HTTP entrypoint
- Context, structured output, and streaming support
- Package-based extension points for providers, preprocessors, postprocessors, and stores

## Default Template Behavior

The current template assumes the built-in JSON definition loader.

- Files in `definitions/*.json` are loaded automatically.
- Files in `definitions/examples/` are reference examples only. Copy them into `definitions/` if you want to use them.
- The default context store is in-memory. It is good for local development, but not for multi-instance or durable production use.
- The included example models are placeholders for a real account setup. Replace them with models enabled in your provider account.

Detailed internal product and architecture notes live in [docs/PROJECT_SPEC.md](./docs/PROJECT_SPEC.md).

## Workspace

- `apps/gateway`: runnable Fastify gateway app
- `packages/core`: contracts, registry, orchestrator, schema helpers
- `packages/http`: HTTP adapter and diagnostics endpoints
- `packages/definition-loader-json`: file-based definition loader
- `packages/provider-openai`: OpenAI provider
- `packages/provider-bedrock`: AWS Bedrock provider
- `packages/provider-claude`: Anthropic Claude provider
- `packages/store-in-memory`: in-memory context store
- `packages/preprocess-common`: built-in preprocessors
- `packages/preprocess-pii-masking`: definition-configured PII masking preprocessor
- `packages/postprocess-common`: built-in postprocessors
- `packages/postprocess-audit-log`: execution audit logging hook and sink

## Quick Start

1. Copy `.env.example` to `.env`.
2. Set `LIGHTWAY_AUTH_TOKEN`.
3. Set `OPENAI_API_KEY` for the bundled OpenAI definitions.
4. Optionally set `ANTHROPIC_API_KEY` or `AWS_REGION` if you plan to add Claude or Bedrock definitions.
5. Install dependencies with `corepack pnpm install`.
6. Run `corepack pnpm validate`.
   This runs `typecheck` and `test` as the default repository health check.
7. Start the gateway with `corepack pnpm dev`.

Default server address: `http://localhost:3000`

## First Checks

Health and readiness:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

List loaded definitions:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions
```

Check one definition:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions/animal-pedia
```

## Example Requests

Execute a text response:

```bash
curl -X POST http://localhost:3000/v1/execute \
  -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "definitionName": "animal-pedia",
    "input": { "question": "Tell me about otters" },
    "context": true
  }'
```

Execute a structured response:

```bash
curl -X POST http://localhost:3000/v1/execute \
  -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "definitionName": "animal-profile",
    "input": { "animal": "otter" }
  }'
```

Execute an SSE stream:

```bash
curl -N -X POST http://localhost:3000/v1/execute \
  -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "definitionName": "animal-pedia",
    "input": { "question": "Tell me about otters" },
    "stream": true
  }'
```

## Definition Workflow

For the current template:

1. Copy an existing file from `definitions/` or a reference example from `definitions/examples/`.
2. Change `name`, `model`, prompts, and schemas.
3. Run `corepack pnpm validate`.
4. Restart `corepack pnpm dev` if the server is already running.
5. Confirm the definition through `/ready` or `/v1/definitions`.

The Claude example is intentionally not auto-loaded:

- `definitions/examples/animal-pedia-claude.json`

## Guides

Definition guides:

- Definition: [KO](./guide/definition-ko.md) | [EN](./guide/definition-en.md)

Extension guides:

- Provider: [KO](./guide/provider-ko.md) | [EN](./guide/provider-en.md)
- Pre-Processor: [KO](./guide/pre-processor-ko.md) | [EN](./guide/pre-processor-en.md)
- Post-Processor: [KO](./guide/post-processor-ko.md) | [EN](./guide/post-processor-en.md)
- Store: [KO](./guide/store-ko.md) | [EN](./guide/store-en.md)

Package docs:

- [apps/gateway README](./apps/gateway/README.md)
- [packages/core README](./packages/core/README.md)
- [packages/http README](./packages/http/README.md)
- [packages/definition-loader-json README](./packages/definition-loader-json/README.md)
- [packages/provider-openai README](./packages/provider-openai/README.md)
- [packages/provider-bedrock README](./packages/provider-bedrock/README.md)
- [packages/provider-claude README](./packages/provider-claude/README.md)
- [packages/store-in-memory README](./packages/store-in-memory/README.md)
- [packages/preprocess-common README](./packages/preprocess-common/README.md)
- [packages/preprocess-pii-masking README](./packages/preprocess-pii-masking/README.md)
- [packages/postprocess-common README](./packages/postprocess-common/README.md)
- [packages/postprocess-audit-log README](./packages/postprocess-audit-log/README.md)
