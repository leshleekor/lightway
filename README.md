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
