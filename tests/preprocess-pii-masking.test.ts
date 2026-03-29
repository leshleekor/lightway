import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry,
  type AIDefinition,
  type LightwayContext
} from "@lightway/core";
import { PiiMaskingPreprocessor } from "@lightway/preprocess-pii-masking";
import { InMemoryContextStore } from "@lightway/store-in-memory";
import { describe, expect, it } from "vitest";
import { InlineDefinitionSource, MockProvider } from "./helpers.js";

function createDefinition(
  overrides: Partial<AIDefinition> = {}
): AIDefinition {
  return {
    name: "customer-support",
    provider: "openai",
    model: "test-model",
    systemPrompt: "You are helpful.",
    inputSchema: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        receiverName: { type: "string" },
        customerEmail: { type: "string" },
        customerPhone: { type: "string" },
        deliveryAddress: { type: "string" }
      }
    },
    preprocess: ["pii-masking"],
    preprocessConfig: {
      "pii-masking": {
        fieldNames: {
          customerName: "full-masking",
          receiverName: "full-masking",
          customerEmail: "full-masking",
          customerPhone: "full-masking",
          deliveryAddress: "sample-masking"
        }
      }
    },
    ...overrides
  };
}

function createContext(
  overrides: Partial<LightwayContext> = {}
): LightwayContext {
  const input = overrides.input ?? {
    customerName: "Alice",
    customerEmail: "alice@example.com"
  };

  const defaultMessages: LightwayContext["messages"] = [
    {
      role: "user",
      content: JSON.stringify(input, null, 2)
    }
  ];

  return {
    requestId: "req-pii",
    definition: createDefinition(),
    input,
    contextEnabled: true,
    contextId: "ctx-pii",
    messages: defaultMessages,
    ragArtifacts: [],
    metadata: {},
    ...overrides
  };
}

describe("PiiMaskingPreprocessor", () => {
  it("masks configured fields, rewrites the latest user message, and records field summary", async () => {
    const preprocessor = new PiiMaskingPreprocessor();

    const context = createContext({
      input: {
        customerName: "Alice Kim",
        customerEmail: "alice@example.com",
        deliveryAddress: "서울시 강남구 테헤란로 123",
        note: "reach me at alice@example.com"
      }
    });

    const result = await preprocessor.run(context);

    expect(result.input).toEqual({
      customerName: "[customerName]",
      customerEmail: "[customerEmail]",
      deliveryAddress: "서** 강** 테*** ***",
      note: "reach me at alice@example.com"
    });
    expect(result.messages.at(-1)?.content).toBe(
      JSON.stringify(result.input, null, 2)
    );
    expect(result.metadata).toMatchObject({
      piiMaskedBy: "pii-masking",
      piiMaskingSummary: {
        fields: {
          customerName: 1,
          receiverName: 0,
          customerEmail: 1,
          customerPhone: 0,
          deliveryAddress: 1
        }
      }
    });
  });

  it("uses exact field names only and leaves unmatched keys and free text alone", async () => {
    const preprocessor = new PiiMaskingPreprocessor();

    const context = createContext({
      input: {
        customer_name: "Alice",
        CustomerPhone: "010-1234-5678",
        note: "Contact alice@example.com"
      }
    });

    const result = await preprocessor.run(context);

    expect(result.input).toEqual({
      customer_name: "Alice",
      CustomerPhone: "010-1234-5678",
      note: "Contact alice@example.com"
    });
    expect(result.metadata).toMatchObject({
      piiMaskingSummary: {
        fields: {
          customerName: 0,
          receiverName: 0,
          customerEmail: 0,
          customerPhone: 0,
          deliveryAddress: 0
        }
      }
    });
  });

  it("applies different field names and masking modes per definition", async () => {
    const preprocessor = new PiiMaskingPreprocessor();
    const input = {
      customerName: "Alice",
      receiverName: "Alice Kim"
    };

    const customerDefinitionResult = await preprocessor.run(
      createContext({
        input,
        definition: createDefinition({
          preprocessConfig: {
            "pii-masking": {
              fieldNames: {
                customerName: "full-masking"
              }
            }
          }
        })
      })
    );

    const receiverDefinitionResult = await preprocessor.run(
      createContext({
        input,
        definition: createDefinition({
          preprocessConfig: {
            "pii-masking": {
              fieldNames: {
                receiverName: "sample-masking"
              }
            }
          }
        })
      })
    );

    expect(customerDefinitionResult.input).toEqual({
      customerName: "[customerName]",
      receiverName: "Alice Kim"
    });
    expect(receiverDefinitionResult.input).toEqual({
      customerName: "Alice",
      receiverName: "Al*** K**"
    });
  });

  it("masks structured assistant and tool history while skipping system and rag messages", async () => {
    const preprocessor = new PiiMaskingPreprocessor();

    const context = createContext({
      input: {
        customerName: "Alice",
        deliveryAddress: "서울시 강남구"
      },
      messages: [
        {
          role: "system",
          content: JSON.stringify({
            customerName: "System"
          })
        },
        {
          role: "assistant",
          content: JSON.stringify({
            customerName: "Bob",
            deliveryAddress: "서울시 강남구"
          })
        },
        {
          role: "tool",
          content: [
            {
              type: "json",
              data: {
                receiverName: "Charlie",
                customerPhone: "010-1234-5678"
              }
            },
            {
              type: "text",
              text: JSON.stringify({
                deliveryAddress: "서울시 강남구 테헤란로 123"
              })
            },
            {
              type: "text",
              text: "Call me at 010-1234-5678"
            }
          ]
        },
        {
          role: "assistant",
          content: JSON.stringify({
            customerName: "Rag"
          }),
          metadata: {
            source: "rag"
          }
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "original content"
            }
          ]
        }
      ]
    });

    const result = await preprocessor.run(context);

    expect(result.messages[0]?.content).toBe(
      JSON.stringify({
        customerName: "System"
      })
    );
    expect(result.messages[1]?.content).toBe(
      JSON.stringify(
        {
          customerName: "[customerName]",
          deliveryAddress: "서** 강**"
        },
        null,
        2
      )
    );
    expect(result.messages[2]?.content).toEqual([
      {
        type: "json",
        data: {
          receiverName: "[receiverName]",
          customerPhone: "[customerPhone]"
        }
      },
      {
        type: "text",
        text: JSON.stringify(
          {
            deliveryAddress: "서** 강** 테*** ***"
          },
          null,
          2
        )
      },
      {
        type: "text",
        text: "Call me at 010-1234-5678"
      }
    ]);
    expect(result.messages[3]?.content).toBe(
      JSON.stringify({
        customerName: "Rag"
      })
    );
    expect(typeof result.messages[4]?.content).toBe("string");
    expect(result.messages[4]?.content).toBe(
      JSON.stringify(
        {
          customerName: "[customerName]",
          deliveryAddress: "서** 강**"
        },
        null,
        2
      )
    );
    expect(result.metadata).toMatchObject({
      piiMaskingSummary: {
        fields: {
          customerName: 2,
          receiverName: 1,
          customerEmail: 0,
          customerPhone: 1,
          deliveryAddress: 3
        }
      }
    });
  });

  it("keeps free-text strings unchanged when JSON parsing fails", async () => {
    const preprocessor = new PiiMaskingPreprocessor();

    const context = createContext({
      input: "Contact me at 010-1234-5678",
      messages: [
        {
          role: "assistant",
          content: "{not-json alice@example.com"
        },
        {
          role: "tool",
          content: [
            {
              type: "text",
              text: "plain text customerName Alice"
            }
          ]
        },
        {
          role: "user",
          content: "Contact me at 010-1234-5678"
        }
      ]
    });

    const result = await preprocessor.run(context);

    expect(result.input).toBe("Contact me at 010-1234-5678");
    expect(result.messages[0]?.content).toBe("{not-json alice@example.com");
    expect(result.messages[1]?.content).toEqual([
      {
        type: "text",
        text: "plain text customerName Alice"
      }
    ]);
    expect(result.messages[2]?.content).toBe("Contact me at 010-1234-5678");
    expect(result.metadata).toMatchObject({
      piiMaskingSummary: {
        fields: {
          customerName: 0,
          receiverName: 0,
          customerEmail: 0,
          customerPhone: 0,
          deliveryAddress: 0
        }
      }
    });
  });

  it("handles root arrays and leaves non-string matched scalars unchanged without counting them", async () => {
    const preprocessor = new PiiMaskingPreprocessor();

    const context = createContext({
      input: [
        {
          customerName: "Alice",
          customerEmail: 99
        },
        {
          customerName: null,
          customerPhone: false,
          deliveryAddress: {
            line1: "서울시 강남구",
            code: 123
          }
        }
      ]
    });

    const result = await preprocessor.run(context);

    expect(result.input).toEqual([
      {
        customerName: "[customerName]",
        customerEmail: 99
      },
      {
        customerName: null,
        customerPhone: false,
        deliveryAddress: {
          line1: "서** 강**",
          code: 123
        }
      }
    ]);
    expect(result.messages.at(-1)?.content).toBe(
      JSON.stringify(result.input, null, 2)
    );
    expect(result.metadata).toMatchObject({
      piiMaskingSummary: {
        fields: {
          customerName: 1,
          receiverName: 0,
          customerEmail: 0,
          customerPhone: 0,
          deliveryAddress: 1
        }
      }
    });
  });

  it("throws when config is missing", async () => {
    const preprocessor = new PiiMaskingPreprocessor();
    const context = createContext({
      definition: createDefinition({
        preprocessConfig: undefined
      })
    });

    await expect(preprocessor.run(context)).rejects.toMatchObject({
      code: "PREPROCESS_FAILED"
    });
  });

  it("throws on invalid field configuration", async () => {
    const preprocessor = new PiiMaskingPreprocessor();

    await expect(
      preprocessor.run(
        createContext({
          definition: createDefinition({
            preprocessConfig: {
              "pii-masking": {
                fieldNames: {
                  deliveryAddress: "redact"
                }
              }
            }
          })
        })
      )
    ).rejects.toMatchObject({
      code: "PREPROCESS_FAILED"
    });

    await expect(
      preprocessor.run(
        createContext({
          definition: createDefinition({
            preprocessConfig: {
              "pii-masking": {
                fieldNames: {}
              }
            }
          })
        })
      )
    ).rejects.toMatchObject({
      code: "PREPROCESS_FAILED"
    });
  });
});

describe("pii-masking orchestrator integration", () => {
  it("keeps stored history unchanged while masking provider-bound history per definition", async () => {
    const provider = new MockProvider({
      name: "openai",
      onGenerate: async (request) => {
        expect(request.messages[0]?.content).toBe(
          JSON.stringify(
            {
              customerName: "[customerName]",
              deliveryAddress: "서** 강**"
            },
            null,
            2
          )
        );
        expect(request.messages.at(-1)?.content).toBe(
          JSON.stringify(
            {
              message: "hello",
              customerEmail: "[customerEmail]"
            },
            null,
            2
          )
        );

        return {
          rawText: "ok"
        };
      }
    });

    const registry = createLightwayRegistry();
    const store = new InMemoryContextStore();
    registry.registerProvider(provider);
    registry.registerPreprocessor(new PiiMaskingPreprocessor());
    registry.registerContextStore("memory", store);
    registry.setDefaultContextStore("memory");

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        createDefinition({
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" },
              customerEmail: { type: "string" }
            },
            required: ["message"],
            additionalProperties: false
          },
          preprocessConfig: {
            "pii-masking": {
              fieldNames: {
                customerName: "full-masking",
                customerEmail: "full-masking",
                deliveryAddress: "sample-masking"
              }
            }
          },
          executionOptions: {
            context: true,
            contextStore: "memory"
          }
        })
      ]),
      registry
    );

    await store.append("ctx-existing", [
      {
        role: "assistant",
        content: JSON.stringify({
          customerName: "Alice",
          deliveryAddress: "서울시 강남구"
        })
      }
    ]);

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    await orchestrator.execute(
      {
        definitionName: "customer-support",
        context: true,
        contextId: "ctx-existing",
        input: {
          message: "hello",
          customerEmail: "person@example.com"
        }
      },
      {
        requestId: "req-pii-orchestrator"
      }
    );

    const storedMessages = await store.get("ctx-existing");
    expect(storedMessages[0]?.content).toBe(
      JSON.stringify({
        customerName: "Alice",
        deliveryAddress: "서울시 강남구"
      })
    );
  });
});
