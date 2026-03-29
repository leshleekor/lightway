# @lightway/gateway

`@lightway/gateway` is the default Fastify application package for the Lightway template.

It wires together:

- the Lightway registry
- the definition registry
- the default JSON definition loader
- the bundled providers
- the default context store
- the built-in preprocessors and postprocessors

## Exports

- `createGatewayApplication`
- `server.ts` executable entrypoint

## Run From The Repo Root

This package does not define its own local `dev` script.
Use the root workspace scripts instead:

```bash
corepack pnpm dev
corepack pnpm validate
```

## Environment Variables

Required:

- `LIGHTWAY_AUTH_TOKEN`: bearer token required for `/v1/*` routes

Optional:

- `PORT`: server port, default `3000`
- `HOST`: bind host, default `0.0.0.0`
- `LIGHTWAY_DEFINITIONS_DIR`: definition directory path, default `./definitions`
- `LIGHTWAY_MAX_REQUEST_BYTES`: request body limit, default `1048576`
- `LIGHTWAY_DEFAULT_TIMEOUT_MS`: default provider timeout in milliseconds, default `30000`

Provider-specific variables are documented in each provider package README.

## Default Bootstrap

The gateway currently:

- loads definitions from `definitions/*.json` through `@lightway/definition-loader-json`
- registers `@lightway/provider-openai`
- registers `@lightway/provider-bedrock`
- registers `@lightway/provider-claude`
- registers `@lightway/store-in-memory` as the default context store
- registers `@lightway/preprocess-common`
- registers `@lightway/preprocess-pii-masking`
- registers `@lightway/postprocess-common`
- enables execution audit logging through `@lightway/postprocess-audit-log`

If you switch to another definition source such as PostgreSQL or MongoDB, this package is the place to replace the default loader/bootstrap logic.

## Diagnostics

Useful endpoints:

- `GET /health`: process liveness
- `GET /ready`: definitions, providers, auth, and context-store readiness
- `GET /v1/definitions`: sanitized definition list
- `GET /v1/providers`: provider runtime status
- `GET /v1/capabilities`: gateway and provider capability summary

Notes:

- `/ready` only checks providers referenced by loaded definitions.
- `/v1/providers` can still show `failed` for providers that are registered but missing credentials.
- The default context store is in-memory, so conversation state disappears when the process restarts.

## When To Edit This Package

Edit `apps/gateway` when you want to:

- replace the default definition source
- change which providers or plugins are registered
- swap the default context store
- customize logging or bootstrap behavior
- expose a different application entrypoint
