import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry,
  type ExecutionHookEvent
} from "@lightway/core";
import { InMemoryContextStore } from "@lightway/store-in-memory";
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";
import { describe, expect, it } from "vitest";
import { InlineDefinitionSource, MockProvider } from "./helpers.js";

describe("execute orchestrator", () => {
  it("executes text generation with preprocess, postprocess, and context save", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async (request) => {
        expect(String(request.messages.at(-1)?.content)).toContain("\"question\": \"otter facts\"");
        return {
          rawText: "  Otters are playful semiaquatic mammals.  ",
          usage: {
            inputTokens: 10,
            outputTokens: 8,
            totalTokens: 18
          }
        };
      }
    });

    const registry = createLightwayRegistry();
    const contextStore = new InMemoryContextStore();
    registry.registerProvider(provider);
    registry.registerContextStore("memory", contextStore);
    registry.setDefaultContextStore("memory");
    registry.registerPreprocessor(new TrimStringInputPreprocessor());
    registry.registerPostprocessor(new TrimTextOutputPostprocessor());

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-pedia",
          provider: "openai",
          model: "test-model",
          systemPrompt: "You are helpful.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string" }
            },
            required: ["question"],
            additionalProperties: false
          },
          preprocess: ["trim-string-input"],
          postprocess: ["trim-text-output"],
          executionOptions: {
            context: true,
            contextStore: "memory"
          }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const response = await orchestrator.execute(
      {
        definitionName: "animal-pedia",
        input: {
          question: "  otter facts  "
        }
      },
      {
        requestId: "req-1"
      }
    );

    expect(response.output).toBe("Otters are playful semiaquatic mammals.");
    expect(response.contextId).toBeDefined();

    const storedMessages = await contextStore.get(response.contextId!, {
      limit: 10
    });
    expect(storedMessages).toHaveLength(2);
    expect(String(storedMessages[0]?.content)).toContain("\"question\": \"otter facts\"");
    expect(storedMessages[1]?.content).toBe("Otters are playful semiaquatic mammals.");
  });

  it("awaits onExecutionEnd and emits a success execution event", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async () => ({
        rawText: "audit me",
        finishReason: "stop",
        usage: {
          inputTokens: 3,
          outputTokens: 2,
          totalTokens: 5
        },
        metadata: {
          upstreamRequestId: "up_123"
        }
      })
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "audit-demo",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Return text.",
          inputSchema: { type: "string" }
        }
      ]),
      registry
    );

    const events: ExecutionHookEvent[] = [];
    let hookResolved = false;

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry,
      onExecutionEnd: async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        hookResolved = true;
        events.push(event);
      }
    });

    const response = await orchestrator.execute(
      {
        definitionName: "audit-demo",
        input: "hello"
      },
      {
        requestId: "req-audit-success"
      }
    );

    expect(hookResolved).toBe(true);
    expect(response.output).toBe("audit me");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: "req-audit-success",
      definitionName: "audit-demo",
      provider: "openai",
      model: "test-model",
      status: "succeeded",
      rawText: "audit me",
      finishReason: "stop",
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5
      },
      metadata: {
        upstreamRequestId: "up_123"
      }
    });
    expect(events[0]?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("emits a failed execution event for invalid input", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-pedia",
          provider: "openai",
          model: "test-model",
          systemPrompt: "You are helpful.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string" }
            },
            required: ["question"],
            additionalProperties: false
          }
        }
      ]),
      registry
    );

    const events: ExecutionHookEvent[] = [];
    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry,
      onExecutionEnd: async (event) => {
        events.push(event);
      }
    });

    await expect(
      orchestrator.execute(
        {
          definitionName: "animal-pedia",
          input: {}
        },
        {
          requestId: "req-invalid-input-audit"
        }
      )
    ).rejects.toMatchObject({
      code: "INVALID_INPUT"
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: "req-invalid-input-audit",
      definitionName: "animal-pedia",
      status: "failed",
      error: {
        code: "INVALID_INPUT",
        stage: "input-validation"
      }
    });
  });

  it("retries once when structured output validation fails", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async (_request, attempt) => {
        if (attempt === 1) {
          return {
            rawText: "{\"name\":\"otter\",\"summary\":123}"
          };
        }

        return {
          rawText: JSON.stringify({
            name: "otter",
            summary: "A semiaquatic mammal.",
            habitats: ["river", "coast"],
            traits: ["playful", "social"]
          })
        };
      }
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-profile",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Return JSON only.",
          inputSchema: {
            type: "object",
            properties: {
              animal: { type: "string" }
            },
            required: ["animal"],
            additionalProperties: false
          },
          outputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              summary: { type: "string" },
              habitats: {
                type: "array",
                items: { type: "string" }
              },
              traits: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["name", "summary", "habitats", "traits"],
            additionalProperties: false
          }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const response = await orchestrator.execute(
      {
        definitionName: "animal-profile",
        input: {
          animal: "otter"
        }
      },
      {
        requestId: "req-2"
      }
    );

    expect(response.output).toEqual({
      name: "otter",
      summary: "A semiaquatic mammal.",
      habitats: ["river", "coast"],
      traits: ["playful", "social"]
    });
    expect(provider.generateRequests).toHaveLength(2);
    expect(provider.generateRequests[1]?.messages.at(-2)?.role).toBe("assistant");
    expect(String(provider.generateRequests[1]?.messages.at(-1)?.content)).toContain(
      "Return only corrected JSON."
    );
  });

  it("returns STRUCTURED_OUTPUT_VALIDATION_FAILED after the retry also fails", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async () => ({
        rawText: "{\"name\":\"otter\"}"
      })
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-profile",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Return JSON only.",
          inputSchema: { type: "string" },
          outputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              summary: { type: "string" }
            },
            required: ["name", "summary"],
            additionalProperties: false
          }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    await expect(
      orchestrator.execute(
        {
          definitionName: "animal-profile",
          input: "otter"
        },
        {
          requestId: "req-structured-fail"
        }
      )
    ).rejects.toMatchObject({
      code: "STRUCTURED_OUTPUT_VALIDATION_FAILED"
    });
  });

  it("emits an error event when the provider stream fails", async () => {
    const provider = new MockProvider({
      name: "openai",
      onStream: async (_request, handler) => {
        await handler({ type: "delta", text: "partial" });
        await handler({
          type: "error",
          error: {
            code: "upstream_error",
            message: "stream exploded"
          }
        });
      }
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "stream-demo",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Stream plain text.",
          inputSchema: { type: "string" },
          executionOptions: {
            stream: true
          }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const events: string[] = [];

    await orchestrator.stream(
      {
        definitionName: "stream-demo",
        input: "hello"
      },
      {
        requestId: "req-stream-error",
        onEvent: async (event) => {
          events.push(event.type);
        }
      }
    );

    expect(events).toEqual(["start", "delta", "error"]);
  });

  it("emits a failed execution event with partial rawText for streaming errors", async () => {
    const provider = new MockProvider({
      name: "openai",
      onStream: async (_request, handler) => {
        await handler({ type: "delta", text: "partial" });
        await handler({
          type: "error",
          error: {
            code: "upstream_error",
            message: "stream exploded"
          }
        });
      }
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "stream-demo",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Stream plain text.",
          inputSchema: { type: "string" },
          executionOptions: {
            stream: true
          }
        }
      ]),
      registry
    );

    const events: ExecutionHookEvent[] = [];
    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry,
      onExecutionEnd: async (event) => {
        events.push(event);
      }
    });

    await orchestrator.stream(
      {
        definitionName: "stream-demo",
        input: "hello"
      },
      {
        requestId: "req-stream-audit-fail",
        onEvent: async () => {}
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: "req-stream-audit-fail",
      definitionName: "stream-demo",
      provider: "openai",
      model: "test-model",
      status: "failed",
      rawText: "partial",
      error: {
        code: "PROVIDER_EXECUTION_FAILED",
        stage: "provider"
      }
    });
    expect(events[0]?.output).toBeUndefined();
  });

  it("returns PROVIDER_TIMEOUT when the provider exceeds timeoutMs", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          rawText: "late"
        };
      }
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "timeout-demo",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Be quick.",
          inputSchema: { type: "string" }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    await expect(
      orchestrator.execute(
        {
          definitionName: "timeout-demo",
          input: "hello",
          timeoutMs: 5
        },
        {
          requestId: "req-timeout"
        }
      )
    ).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT"
    });
  });

  it("runs rag retrievers and applies prompt templates", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async (request) => {
        expect(request.systemPrompt).toContain("Knowledge block");
        expect(request.systemPrompt).toContain("sea otters use tools");
        expect(request.systemPrompt).toContain("documents=1");
        return {
          rawText: "RAG answer"
        };
      }
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);
    registry.registerRagRetriever({
      name: "knowledge-base",
      async run() {
        return {
          name: "knowledge",
          documents: [
            {
              id: "doc-1",
              content: "sea otters use tools"
            }
          ]
        };
      }
    });

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "rag-demo",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Use knowledge when available.",
          inputSchema: { type: "string" },
          rag: [
            {
              name: "knowledge",
              retriever: "knowledge-base",
              sourceType: "custom",
              promptTemplate: "Knowledge block\n{{documents}}\ndocuments={{documentCount}}"
            }
          ]
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const response = await orchestrator.execute(
      {
        definitionName: "rag-demo",
        input: "otter"
      },
      {
        requestId: "req-rag"
      }
    );

    expect(response.output).toBe("RAG answer");
  });

  it("streams deltas and completes context save after stream end", async () => {
    const provider = new MockProvider({
      name: "openai",
      onStream: async (_request, handler) => {
        await handler({ type: "delta", text: "Hello" });
        await handler({ type: "delta", text: " world" });
        await handler({
          type: "usage",
          usage: {
            inputTokens: 5,
            outputTokens: 2,
            totalTokens: 7
          }
        });
        await handler({ type: "end", finishReason: "stop" });
      }
    });

    const registry = createLightwayRegistry();
    const contextStore = new InMemoryContextStore();
    registry.registerProvider(provider);
    registry.registerContextStore("memory", contextStore);
    registry.setDefaultContextStore("memory");

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "stream-demo",
          provider: "openai",
          model: "test-model",
          systemPrompt: "Stream plain text.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string" }
            },
            required: ["question"],
            additionalProperties: false
          },
          executionOptions: {
            context: true,
            contextStore: "memory",
            stream: true
          }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const events: string[] = [];
    let contextId: string | undefined;

    await orchestrator.stream(
      {
        definitionName: "stream-demo",
        input: {
          question: "Say hello"
        }
      },
      {
        requestId: "req-3",
        onEvent: async (event) => {
          events.push(event.type);
          if (event.type === "start") {
            contextId = event.data.contextId;
          }
        }
      }
    );

    expect(events).toEqual(["start", "delta", "delta", "usage", "end"]);
    expect(contextId).toBeDefined();
    const storedMessages = await contextStore.get(contextId!, { limit: 10 });
    expect(storedMessages[1]?.content).toBe("Hello world");
  });

  it("merges streaming usage events instead of overwriting earlier token counts", async () => {
    const provider = new MockProvider({
      name: "claude",
      onStream: async (_request, handler) => {
        await handler({
          type: "usage",
          usage: {
            inputTokens: 11
          }
        });
        await handler({ type: "delta", text: "Hello" });
        await handler({
          type: "usage",
          usage: {
            outputTokens: 7
          }
        });
        await handler({ type: "end", finishReason: "stop" });
      }
    });

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "claude-stream-demo",
          provider: "claude",
          model: "test-model",
          systemPrompt: "Stream plain text.",
          inputSchema: { type: "string" },
          executionOptions: {
            stream: true
          }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const events: Array<{ type: string; data?: Record<string, unknown> }> = [];

    await orchestrator.stream(
      {
        definitionName: "claude-stream-demo",
        input: "hello"
      },
      {
        requestId: "req-stream-usage-merge",
        onEvent: async (event) => {
          events.push({
            type: event.type,
            data: "data" in event ? event.data : undefined
          });
        }
      }
    );

    const usageEvents = events.filter((event) => event.type === "usage");

    expect(usageEvents).toEqual([
      {
        type: "usage",
        data: {
          inputTokens: 11,
          outputTokens: undefined,
          totalTokens: undefined
        }
      },
      {
        type: "usage",
        data: {
          inputTokens: 11,
          outputTokens: 7,
          totalTokens: 18
        }
      }
    ]);
  });
});
