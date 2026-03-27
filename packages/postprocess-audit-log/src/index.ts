import process from "node:process";
import {
  LightwayError,
  type ExecutionErrorStage,
  type ExecutionHook,
  type ExecutionHookEvent,
  type ExecutionStatus,
  type LightwayContext,
  type LightwayResult,
  type Postprocessor
} from "@lightway/core";

export interface ExecutionAuditLogRecord {
  timestamp: string;
  latencyMs: number;
  status: ExecutionStatus;
  requestId: string;
  definitionName: string;
  provider?: string;
  model?: string;
  contextId?: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  rawText?: string;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    stage?: ExecutionErrorStage;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

export interface ExecutionAuditSink {
  write(record: ExecutionAuditLogRecord): Promise<void> | void;
}

export interface ExecutionAuditRuntimeOptions {
  captureResponseBody?: "none" | "full";
  failOpen?: boolean;
  onSinkError?: (
    error: unknown,
    record: ExecutionAuditLogRecord
  ) => Promise<void> | void;
}

export type ExecutionAuditHookOptions = ExecutionAuditRuntimeOptions;
export type ExecutionAuditLogPostprocessorOptions = ExecutionAuditRuntimeOptions;

interface ConsoleExecutionAuditSinkOptions {
  stream?: Pick<NodeJS.WritableStream, "write">;
}

function toAuditRecord(
  event: ExecutionHookEvent,
  options: ExecutionAuditRuntimeOptions = {}
): ExecutionAuditLogRecord {
  const captureResponseBody = options.captureResponseBody ?? "full";
  const record: ExecutionAuditLogRecord = {
    timestamp: new Date().toISOString(),
    latencyMs: event.latencyMs,
    status: event.status,
    requestId: event.requestId,
    definitionName: event.definitionName,
    provider: event.provider,
    model: event.model,
    contextId: event.contextId,
    finishReason: event.finishReason,
    usage: event.usage,
    metadata: event.metadata,
    error: event.error
      ? {
          code: event.error.code,
          message: event.error.message,
          stage: event.error.stage,
          details: event.error.details
        }
      : undefined
  };

  if (captureResponseBody === "full") {
    if (event.rawText !== undefined) {
      record.rawText = event.rawText;
    }

    if (event.output !== undefined) {
      record.output = event.output;
    }
  }

  return record;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeSinkError(
  error: unknown,
  record: ExecutionAuditLogRecord
): LightwayError {
  const details: Record<string, unknown> = {
    requestId: record.requestId,
    definitionName: record.definitionName,
    contextId: record.contextId,
    cause: extractErrorMessage(error)
  };

  if (error instanceof AggregateError) {
    details.causes = error.errors.map((cause) => extractErrorMessage(cause));
  }

  return new LightwayError(
    "EXECUTION_AUDIT_SINK_FAILED",
    "Execution audit sink failed",
    details
  );
}

function writeFallbackSinkLog(
  error: unknown,
  record: ExecutionAuditLogRecord,
  onSinkErrorFailure?: unknown
): void {
  const payload: Record<string, unknown> = {
    level: "error",
    event: "execution_audit_sink_failed",
    requestId: record.requestId,
    definitionName: record.definitionName,
    contextId: record.contextId,
    message: "failed to write execution audit record",
    cause: extractErrorMessage(error)
  };

  if (onSinkErrorFailure) {
    payload.onSinkErrorFailure = extractErrorMessage(onSinkErrorFailure);
  }

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function writeRecord(
  sink: ExecutionAuditSink,
  record: ExecutionAuditLogRecord,
  options: ExecutionAuditRuntimeOptions = {}
): Promise<void> {
  const failOpen = options.failOpen ?? true;

  try {
    await sink.write(record);
  } catch (error) {
    let onSinkErrorFailure: unknown;

    if (options.onSinkError) {
      try {
        await options.onSinkError(error, record);
      } catch (callbackError) {
        onSinkErrorFailure = callbackError;
      }
    } else {
      writeFallbackSinkLog(error, record);
    }

    if (options.onSinkError && onSinkErrorFailure) {
      writeFallbackSinkLog(error, record, onSinkErrorFailure);
    }

    if (!failOpen) {
      throw normalizeSinkError(error, record);
    }

    if (options.onSinkError && !onSinkErrorFailure) {
      return;
    }
  }
}

function getContextStartedAt(context: LightwayContext): number | undefined {
  const startedAt = context.metadata.lightwayStartedAt;
  return typeof startedAt === "number" ? startedAt : undefined;
}

function buildSuccessEvent(
  result: LightwayResult,
  context: LightwayContext
): ExecutionHookEvent {
  const startedAt = getContextStartedAt(context);

  return {
    requestId: context.requestId,
    definitionName: context.definition.name,
    provider: result.provider,
    model: result.model,
    contextId: context.contextId,
    status: "succeeded",
    latencyMs: startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : 0,
    finishReason: result.finishReason,
    usage: result.usage,
    rawText: result.rawText,
    output: result.output,
    metadata: result.metadata
  };
}

export class ConsoleExecutionAuditSink implements ExecutionAuditSink {
  private readonly stream: Pick<NodeJS.WritableStream, "write">;

  constructor(options: ConsoleExecutionAuditSinkOptions = {}) {
    this.stream = options.stream ?? process.stdout;
  }

  write(record: ExecutionAuditLogRecord): void {
    this.stream.write(`${JSON.stringify(record)}\n`);
  }
}

export class CompositeExecutionAuditSink implements ExecutionAuditSink {
  constructor(private readonly sinks: ExecutionAuditSink[]) {}

  async write(record: ExecutionAuditLogRecord): Promise<void> {
    const results = await Promise.allSettled(
      this.sinks.map((sink) => sink.write(record))
    );
    const failures = results
      .filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      )
      .map((result) => result.reason);

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "one or more execution audit sinks failed"
      );
    }
  }
}

export function createExecutionAuditHook(
  sink: ExecutionAuditSink,
  options: ExecutionAuditHookOptions = {}
): ExecutionHook {
  return async (event) => {
    const record = toAuditRecord(event, options);
    await writeRecord(sink, record, options);
  };
}

export class ExecutionAuditLogPostprocessor implements Postprocessor {
  readonly name = "execution-audit-log";
  private readonly hook: ExecutionHook;

  constructor(
    sink: ExecutionAuditSink,
    private readonly options: ExecutionAuditLogPostprocessorOptions = {}
  ) {
    this.hook = createExecutionAuditHook(sink, options);
  }

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    await this.hook(buildSuccessEvent(result, context));
    return result;
  }
}
