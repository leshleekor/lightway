# @lightway/gateway

Fastify-based gateway application that wires together the Lightway registry, definition loader, providers, store, and preprocess/postprocess packages.

## Exports

- `createGatewayApplication`
- `server.ts` executable entrypoint

## Usage

```bash
corepack pnpm dev
```

## Environment Variables

Required:

- `LIGHTWAY_AUTH_TOKEN`: bearer token required for `/v1/*` routes.

Optional:

- `PORT`: server port. Default `3000`.
- `HOST`: bind host. Default `0.0.0.0`.
- `LIGHTWAY_DEFINITIONS_DIR`: definition directory path. Default `./definitions`.
- `LIGHTWAY_MAX_REQUEST_BYTES`: request body limit. Default `1048576`.
- `LIGHTWAY_DEFAULT_TIMEOUT_MS`: default provider timeout in milliseconds. Default `30000`.

Provider-specific environment variables are documented in each provider package README.

Execution audit logs are enabled by default through the core `onExecutionEnd` hook and are written to stdout as JSON records.

## Default Bootstrap

The gateway registers these packages by default:

- `@lightway/provider-openai`
- `@lightway/provider-bedrock`
- `@lightway/provider-claude`
- `@lightway/store-in-memory`
- `@lightway/preprocess-common`
- `@lightway/postprocess-common`
- `@lightway/postprocess-audit-log` via `ConsoleExecutionAuditSink`

## Example

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions
```
