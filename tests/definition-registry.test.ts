import { createDefinitionRegistry, createLightwayRegistry } from "@lightway/core";
import { describe, expect, it } from "vitest";
import { InlineDefinitionSource, MockProvider } from "./helpers.js";

describe("definition registry", () => {
  it("keeps advisory warnings without failing load", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const source = new InlineDefinitionSource([
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
        preprocess: ["missing-preprocess"],
        rag: [
          {
            name: "missing-rag",
            retriever: "missing-retriever",
            sourceType: "custom"
          }
        ],
        executionOptions: {
          contextStore: "missing-store"
        }
      }
    ]);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(source, registry);

    const warnings = definitionRegistry.getWarnings("animal-pedia");
    expect(warnings.map((warning) => warning.code)).toEqual([
      "CONTEXT_STORE_NOT_FOUND",
      "PREPROCESSOR_NOT_FOUND",
      "RAG_RETRIEVER_NOT_FOUND"
    ]);
  });

  it("fails on duplicate names", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const source = new InlineDefinitionSource([
      {
        name: "same-name",
        provider: "openai",
        model: "m1",
        systemPrompt: "one",
        inputSchema: { type: "string" }
      },
      {
        name: "same-name",
        provider: "openai",
        model: "m2",
        systemPrompt: "two",
        inputSchema: { type: "string" }
      }
    ]);

    const definitionRegistry = createDefinitionRegistry();
    await expect(definitionRegistry.load(source, registry)).rejects.toThrow(
      /DEFINITION_DUPLICATED/
    );
  });

  it("allows temperature 0 and rag priority 0", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const source = new InlineDefinitionSource([
      {
        name: "animal-profile",
        provider: "openai",
        model: "test-model",
        systemPrompt: "You are helpful.",
        inputSchema: { type: "string" },
        rag: [
          {
            name: "knowledge",
            retriever: "missing-retriever",
            sourceType: "custom",
            priority: 0
          }
        ],
        executionOptions: {
          temperature: 0
        }
      }
    ]);

    const definitionRegistry = createDefinitionRegistry();
    await expect(definitionRegistry.load(source, registry)).resolves.toBeUndefined();
  });

  it("rejects duplicate provider registration", () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    expect(() =>
      registry.registerProvider(new MockProvider({ name: "openai" }))
    ).toThrow(/Duplicate provider registration/);
  });
});
