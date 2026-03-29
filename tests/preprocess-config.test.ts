import { createDefinitionRegistry, createLightwayRegistry } from "@lightway/core";
import { describe, expect, it } from "vitest";
import { InlineDefinitionSource, MockProvider } from "./helpers.js";

describe("definition plugin config validation", () => {
  it("accepts preprocessConfig and postprocessConfig when keys match declared plugins", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const definitionRegistry = createDefinitionRegistry();
    await expect(
      definitionRegistry.load(
        new InlineDefinitionSource([
          {
            name: "customer-support",
            provider: "openai",
            model: "test-model",
            systemPrompt: "You are helpful.",
            inputSchema: { type: "string" },
            preprocess: ["pii-masking"],
            preprocessConfig: {
              "pii-masking": {
                fieldNames: {
                  customerName: "full-masking"
                }
              }
            },
            postprocess: ["execution-audit-log"],
            postprocessConfig: {
              "execution-audit-log": {
                captureResponseBody: "none"
              }
            }
          }
        ]),
        registry
      )
    ).resolves.toBeUndefined();
  });

  it("rejects preprocessConfig keys that are not declared in preprocess", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const definitionRegistry = createDefinitionRegistry();
    await expect(
      definitionRegistry.load(
        new InlineDefinitionSource([
          {
            name: "customer-support",
            provider: "openai",
            model: "test-model",
            systemPrompt: "You are helpful.",
            inputSchema: { type: "string" },
            preprocess: ["trim-string-input"],
            preprocessConfig: {
              "pii-masking": {
                fieldNames: {
                  customerName: "full-masking"
                }
              }
            }
          }
        ]),
        registry
      )
    ).rejects.toThrow(/preprocessConfig\.pii-masking references a plugin/);
  });

  it("rejects postprocessConfig keys that are not declared in postprocess", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const definitionRegistry = createDefinitionRegistry();
    await expect(
      definitionRegistry.load(
        new InlineDefinitionSource([
          {
            name: "customer-support",
            provider: "openai",
            model: "test-model",
            systemPrompt: "You are helpful.",
            inputSchema: { type: "string" },
            postprocess: ["trim-text-output"],
            postprocessConfig: {
              "execution-audit-log": {
                captureResponseBody: "none"
              }
            }
          }
        ]),
        registry
      )
    ).rejects.toThrow(/postprocessConfig\.execution-audit-log references a plugin/);
  });
});
