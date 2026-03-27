# @lightway/postprocess-audit-log

`@lightway/postprocess-audit-log` provides execution audit logging for Lightway.

## Purpose

- Record successful and failed executions in a shared audit format
- Send audit records to stdout or custom sinks
- Reuse the same sink contract for hook-based logging and standalone postprocessing

## Exports

- `createExecutionAuditHook`
- `ExecutionAuditLogPostprocessor`
- `ConsoleExecutionAuditSink`
- `CompositeExecutionAuditSink`
- `ExecutionAuditSink`
- `ExecutionAuditLogRecord`
- `ExecutionAuditRuntimeOptions`

## Hook Usage

```ts
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

## Standalone Postprocessor Usage

```ts
import { ExecutionAuditLogPostprocessor } from "@lightway/postprocess-audit-log";
import { ConsoleExecutionAuditSink } from "@lightway/postprocess-audit-log";

registry.registerPostprocessor(
  new ExecutionAuditLogPostprocessor(
    new ConsoleExecutionAuditSink(),
    {
      captureResponseBody: "full"
    }
  )
);
```

## Environment Variables

None. Configure the package through constructor and hook options.

## Notes

- `failOpen: true` keeps requests successful even if sink writes fail.
- Default sink failure handling writes a structured JSON error log to stdout.
- `ExecutionAuditLogPostprocessor` is a success-only standalone path. Prefer the core `onExecutionEnd` hook for full success/failure coverage.
