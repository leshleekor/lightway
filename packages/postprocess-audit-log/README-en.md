# @lightway/postprocess-audit-log

`@lightway/postprocess-audit-log` converts execution results into structured audit log records and writes them to sinks. For full success and failure coverage, the recommended path is to use it with the `onExecutionEnd` hook from `@lightway/core`.

## What it provides

- shared audit log record mapping for successful and failed executions
- a stdout JSON sink
- a composite sink for fan-out to multiple sinks
- both hook-based logging and a standalone postprocessor path

## Main exports

```ts
import {
  CompositeExecutionAuditSink,
  ConsoleExecutionAuditSink,
  ExecutionAuditLogPostprocessor,
  createExecutionAuditHook
} from "@lightway/postprocess-audit-log";
```

Key types:

- `ExecutionAuditSink`
- `ExecutionAuditLogRecord`
- `ExecutionAuditRuntimeOptions`

## Recommended usage: hook-based logging

```ts
import { createExecuteOrchestrator } from "@lightway/core";
import {
  ConsoleExecutionAuditSink,
  createExecutionAuditHook
} from "@lightway/postprocess-audit-log";

const auditHook = createExecutionAuditHook(
  new ConsoleExecutionAuditSink(),
  {
    captureResponseBody: "full",
    failOpen: true
  }
);

const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry,
  onExecutionEnd: auditHook
});
```

Benefits of this path:

- captures both success and failure
- includes `contextId`, `usage`, `finishReason`, and `latencyMs`
- records streaming executions from the final accumulated state

## Standalone postprocessor

If hooks are not available in your environment, you can use the success-only standalone path.

```ts
import {
  ConsoleExecutionAuditSink,
  ExecutionAuditLogPostprocessor
} from "@lightway/postprocess-audit-log";

registry.registerPostprocessor(
  new ExecutionAuditLogPostprocessor(
    new ConsoleExecutionAuditSink(),
    {
      captureResponseBody: "full"
    }
  )
);
```

Notes:

- This path records successful results only.
- It runs before context persistence, so it is not perfectly synchronized with context-save failures.
- Avoid using the hook and the standalone postprocessor together, or successful logs may be duplicated.

## `ExecutionAuditSink`

Implement this contract to create a custom destination.

```ts
interface ExecutionAuditSink {
  write(record: ExecutionAuditLogRecord): Promise<void> | void;
}
```

This is the extension point for DB sinks, queue sinks, or file sinks.

Example:

```ts
class MyDatabaseSink {
  async write(record) {
    await db.insert("execution_audit_logs", record);
  }
}
```

## Built-in sinks

### `ConsoleExecutionAuditSink`

Writes one structured JSON line to stdout.

```ts
const sink = new ConsoleExecutionAuditSink();
```

Option:

- `stream?`
  - defaults to `process.stdout`
  - useful for tests or custom logging streams

### `CompositeExecutionAuditSink`

Fans out to multiple sinks.

```ts
const sink = new CompositeExecutionAuditSink([
  new ConsoleExecutionAuditSink(),
  new MyDatabaseSink()
]);
```

Behavior:

- all sinks are attempted
- if one or more sinks fail, it throws `AggregateError`
- the upper `failOpen` policy decides whether that error is ignored or propagated

## `createExecutionAuditHook(sink, options?)`

Creates an `ExecutionHook`.

Options:

- `captureResponseBody?: "none" | "full"`
  - default `full`
- `failOpen?: boolean`
  - default `true`
  - when `true`, sink failures do not break the original request flow
- `onSinkError?: (error, record) => Promise<void> | void`
  - optional side effect when a sink write fails

Failure policy:

- `failOpen: true`
  - the original request continues
  - sink failures are written to stdout through the fallback log
- `failOpen: false`
  - errors are propagated as `EXECUTION_AUDIT_SINK_FAILED`

## Audit record shape

Main fields in `ExecutionAuditLogRecord`:

- `timestamp`
- `latencyMs`
- `status`
- `requestId`
- `definitionName`
- `provider`
- `model`
- `contextId`
- `finishReason`
- `usage`
- `rawText`
- `output`
- `error`
- `metadata`

Example:

```json
{
  "timestamp": "2026-03-28T10:00:00.000Z",
  "latencyMs": 842,
  "status": "succeeded",
  "requestId": "req-123",
  "definitionName": "animal-pedia",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "contextId": "ctx-1",
  "finishReason": "stop",
  "usage": {
    "inputTokens": 120,
    "outputTokens": 58,
    "totalTokens": 178
  },
  "rawText": "Otters are aquatic mammals...",
  "metadata": {
    "upstreamId": "chatcmpl_123"
  }
}
```

## Environment variables

This package does not use package-level environment variables. Sink wiring, fail-open or fail-closed behavior, and response-body capture are all configured in code.

## Recommended extension strategy

- Use `CompositeExecutionAuditSink` when you need both `stdout + DB`.
- Implement PostgreSQL, MongoDB, or DynamoDB sinks as separate packages or app-level modules.
- If `contextId` lookup matters, add a DB index for it.
