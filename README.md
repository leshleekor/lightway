# Lightway

Lightway is a light-weight AI gateway boilerplate for startups and small-to-medium services.

It sits between an existing product and one or more AI providers, and standardizes the full execution flow:

`Gateway Controller -> Pre-Process Layer -> RAG Layer -> Model Provider -> Post-Process Layer -> Return Result`

## Core Idea

- AI Definition-first execution
- Provider-agnostic integration
- Boilerplate + package-based extension model
- Easy customization for teams that want to add their own code
- Open-source friendly architecture

## Planned Capabilities

- AI execution over HTTP
- Definition-based use case management
- Provider abstraction for OpenAI, Bedrock, Anthropic, and others
- Context/session support
- Structured output support
- Streaming support
- Extensible preprocessors, RAG modules, and postprocessors

## Document

The initial product and architecture spec is here:

- [docs/PROJECT_SPEC.md](./docs/PROJECT_SPEC.md)

## Suggested Direction

Lightway should start as a TypeScript monorepo boilerplate with a small core and independently installable packages for providers and plugins.

## Implemented Workspace

The repository now contains a runnable pnpm workspace with:

- `apps/gateway`: Fastify gateway server
- `packages/core`: domain contracts, registries, orchestrator
- `packages/http`: HTTP adapter and diagnostics endpoints
- `packages/definition-loader-json`: file-based definition source
- `packages/provider-openai`: OpenAI chat-completions adapter
- `packages/provider-bedrock`: AWS Bedrock Converse adapter
- `packages/provider-claude`: Anthropic Claude Messages API adapter
- `packages/store-in-memory`: in-memory context store
- `packages/preprocess-common`: common preprocessors
- `packages/preprocess-pii-masking`: definition-configured PII masking preprocessor
- `packages/postprocess-common`: common postprocessors
- `packages/postprocess-audit-log`: execution audit log hook, sink, and standalone postprocessor
- `definitions/`: runnable example definitions

Claude definition example for manual adoption:

- `definitions/examples/animal-pedia-claude.json`

## Package Docs

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

## Custom Component Guide

You can extend Lightway by adding your own provider, pre-processor, post-processor, and store implementation.
Each guide is available in Korean and English.

- Provider: [KO](./guide/provider-ko.md) | [EN](./guide/provider-en.md)
- Pre-Processor: [KO](./guide/pre-processor-ko.md) | [EN](./guide/pre-processor-en.md)
- Post-Processor: [KO](./guide/post-processor-ko.md) | [EN](./guide/post-processor-en.md)
- Store: [KO](./guide/store-ko.md) | [EN](./guide/store-en.md)

## Quick Start

1. Copy `.env.example` to `.env`.
2. Set `LIGHTWAY_AUTH_TOKEN`.
3. Set `OPENAI_API_KEY` to use the included OpenAI definitions.
4. Set `ANTHROPIC_API_KEY` if you want to register and execute Claude-backed definitions.
5. Install dependencies with `corepack pnpm install`.
6. Start the gateway with `corepack pnpm dev`.

Default server address: `http://localhost:3000`

## Example Requests

Health and readiness:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

List definitions:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions
```

Execute text response:

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

Execute structured response:

```bash
curl -X POST http://localhost:3000/v1/execute \
  -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "definitionName": "animal-profile",
    "input": { "animal": "otter" }
  }'
```

Execute SSE stream:

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
