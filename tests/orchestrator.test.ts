import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry
} from "@lightway/core";
import { InMemoryContextStore } from "@lightway/context-memory";
import { TrimTextOutputPostprocessor } from "@lightway/plugin-postprocess-common";
import { TrimStringInputPreprocessor } from "@lightway/plugin-preprocess-common";
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
});
