# @lightway/http

HTTP adapter for exposing Lightway over Fastify.

## Exports

- `createGatewayServer`
- `buildReadinessReport`

## Workspace Path

- `packages/http`

## Usage

```ts
import { createGatewayServer } from "@lightway/http";
```

## Environment Variables

- Not required by the package itself

App-level gateway environment variables such as `LIGHTWAY_AUTH_TOKEN` and `LIGHTWAY_MAX_REQUEST_BYTES` are documented in [`apps/gateway/README.md`](../../apps/gateway/README.md).

## Notes

This package handles auth, validation, readiness, provider diagnostics, JSON execution, and SSE streaming responses.
