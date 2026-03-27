import type { ExecutionHookEvent, LightwayContext, LightwayResult } from "@lightway/core";
import {
  CompositeExecutionAuditSink,
  ConsoleExecutionAuditSink,
  ExecutionAuditLogPostprocessor,
  createExecutionAuditHook,
  type ExecutionAuditLogRecord,
  type ExecutionAuditSink
} from "@lightway/postprocess-audit-log";
import { afterEach, describe, expect, it, vi } from "vitest";

class CaptureSink implements ExecutionAuditSink {
  readonly records: ExecutionAuditLogRecord[] = [];

  async write(record: ExecutionAuditLogRecord): Promise<void> {
    this.records.push(record);
  }
}

class ThrowingSink implements ExecutionAuditSink {
  readonly calls: ExecutionAuditLogRecord[] = [];

  async write(record: ExecutionAuditLogRecord): Promise<void> {
    this.calls.push(record);
    throw new Error("sink exploded");
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postprocess audit log", () => {
  it("maps execution hook events to audit records", async () => {
    const sink = new CaptureSink();
    const hook = createExecutionAuditHook(sink);

    const event: ExecutionHookEvent = {
      requestId: "req-1",
      definitionName: "animal-pedia",
      provider: "openai",
      model: "gpt-test",
      contextId: "ctx-1",
      status: "succeeded",
      latencyMs: 42,
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      },
      rawText: "hello",
      output: {
        answer: "hello"
      },
      metadata: {
        upstreamRequestId: "up_1"
      }
    };

    await hook(event);

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      requestId: "req-1",
      definitionName: "animal-pedia",
      provider: "openai",
      model: "gpt-test",
      contextId: "ctx-1",
      status: "succeeded",
      latencyMs: 42,
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      },
      rawText: "hello",
      output: {
        answer: "hello"
      },
      metadata: {
        upstreamRequestId: "up_1"
      }
    });
    expect(sink.records[0]?.timestamp).toBeTruthy();
  });

  it("omits response body fields when captureResponseBody is none", async () => {
    const sink = new CaptureSink();
    const hook = createExecutionAuditHook(sink, {
      captureResponseBody: "none"
    });

    await hook({
      requestId: "req-2",
      definitionName: "animal-pedia",
      status: "failed",
      latencyMs: 5,
      rawText: "partial",
      output: {
        answer: "partial"
      },
      error: {
        code: "PROVIDER_EXECUTION_FAILED",
        message: "upstream failed",
        stage: "provider"
      }
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.rawText).toBeUndefined();
    expect(sink.records[0]?.output).toBeUndefined();
  });

  it("swallows sink failures in fail-open mode and writes a stdout fallback log", async () => {
    const sink = new ThrowingSink();
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const hook = createExecutionAuditHook(sink, {
      failOpen: true
    });

    await expect(
      hook({
        requestId: "req-3",
        definitionName: "animal-pedia",
        status: "succeeded",
        latencyMs: 1
      })
    ).resolves.toBeUndefined();

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"execution_audit_sink_failed"')
    );
  });

  it("propagates a normalized LightwayError in fail-closed mode", async () => {
    const sink = new ThrowingSink();
    const hook = createExecutionAuditHook(sink, {
      failOpen: false
    });

    await expect(
      hook({
        requestId: "req-4",
        definitionName: "animal-pedia",
        status: "succeeded",
        latencyMs: 1
      })
    ).rejects.toMatchObject({
      code: "EXECUTION_AUDIT_SINK_FAILED"
    });
  });

  it("tries every child sink before failing composite writes", async () => {
    const throwingSink = new ThrowingSink();
    const captureSink = new CaptureSink();
    const composite = new CompositeExecutionAuditSink([
      throwingSink,
      captureSink
    ]);

    await expect(
      composite.write({
        timestamp: new Date().toISOString(),
        latencyMs: 1,
        status: "succeeded",
        requestId: "req-5",
        definitionName: "animal-pedia"
      })
    ).rejects.toBeInstanceOf(AggregateError);

    expect(throwingSink.calls).toHaveLength(1);
    expect(captureSink.records).toHaveLength(1);
  });

  it("writes standalone postprocessor records without changing the result", async () => {
    const sink = new CaptureSink();
    const postprocessor = new ExecutionAuditLogPostprocessor(sink, {
      captureResponseBody: "full"
    });

    const result: LightwayResult = {
      rawText: "hello",
      output: {
        answer: "hello"
      },
      provider: "openai",
      model: "gpt-test",
      finishReason: "stop",
      usage: {
        inputTokens: 5,
        outputTokens: 4,
        totalTokens: 9
      }
    };

    const context: LightwayContext = {
      requestId: "req-6",
      definition: {
        name: "animal-pedia",
        provider: "openai",
        model: "gpt-test",
        systemPrompt: "You are helpful.",
        inputSchema: {
          type: "string"
        }
      },
      input: "hello",
      contextEnabled: true,
      contextId: "ctx-6",
      messages: [],
      ragArtifacts: [],
      metadata: {
        lightwayStartedAt: Date.now() - 20
      }
    };

    const returned = await postprocessor.run(result, context);

    expect(returned).toBe(result);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      requestId: "req-6",
      definitionName: "animal-pedia",
      provider: "openai",
      model: "gpt-test",
      contextId: "ctx-6",
      status: "succeeded",
      rawText: "hello",
      output: {
        answer: "hello"
      },
      finishReason: "stop"
    });
    expect(sink.records[0]?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("writes console sink records as JSON lines", async () => {
    const stream = {
      lines: [] as string[],
      write(value: string) {
        this.lines.push(value);
        return true;
      }
    };
    const sink = new ConsoleExecutionAuditSink({ stream });

    await sink.write({
      timestamp: new Date().toISOString(),
      latencyMs: 2,
      status: "succeeded",
      requestId: "req-7",
      definitionName: "animal-pedia"
    });

    expect(stream.lines).toHaveLength(1);
    expect(stream.lines[0]).toContain('"requestId":"req-7"');
  });
});
