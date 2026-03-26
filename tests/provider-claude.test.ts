import type { ProviderRequest, ProviderStreamEvent } from "@lightway/core";
import { ClaudeProvider } from "@lightway/provider-claude";
import { afterEach, describe, expect, it, vi } from "vitest";

function createRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    requestId: "req-claude",
    definitionName: "claude-demo",
    provider: "claude",
    model: "claude-sonnet-test",
    systemPrompt: "You are helpful.",
    input: {
      question: "Tell me about otters"
    },
    messages: [
      {
        role: "user",
        content: "Tell me about otters"
      }
    ],
    ...overrides
  };
}

function createStreamResponse(events: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      }
    })
  );
}

describe("ClaudeProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
  });

  it("reports failed status when ANTHROPIC_API_KEY is missing", () => {
    const provider = new ClaudeProvider();

    expect(provider.getStatus()).toEqual({
      status: "failed",
      issue: "ANTHROPIC_API_KEY_MISSING"
    });
  });

  it("reports ready status when ANTHROPIC_API_KEY is configured", () => {
    const provider = new ClaudeProvider({
      apiKey: "test-key"
    });

    expect(provider.getStatus()).toEqual({
      status: "ready"
    });
  });

  it("calls the Anthropic Messages API with the required headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_123",
          content: [
            {
              type: "text",
              text: "{\"answer\":\"otters\"}"
            }
          ],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 12,
            output_tokens: 8
          }
        })
      )
    );

    const provider = new ClaudeProvider({
      apiKey: "test-key",
      baseUrl: "https://claude.example.com/"
    });

    const response = await provider.generate(
      createRequest({
        structuredOutput: true,
        outputSchema: {
          type: "object",
          properties: {
            answer: {
              type: "string"
            }
          },
          required: ["answer"],
          additionalProperties: false
        },
        generationOptions: {
          temperature: 0.2
        }
      })
    );

    expect(response).toEqual({
      rawText: "{\"answer\":\"otters\"}",
      finishReason: "end_turn",
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20
      },
      metadata: {
        upstreamId: "msg_123"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://claude.example.com/v1/messages");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-test");
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.2);
    expect(String(body.system)).toContain("Return only valid JSON");
  });

  it("parses Anthropic SSE events into ProviderStreamEvent values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createStreamResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":11}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n'
      ])
    );

    const provider = new ClaudeProvider({
      apiKey: "test-key"
    });
    const events: ProviderStreamEvent[] = [];

    await provider.stream(createRequest(), async (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: "start" },
      {
        type: "usage",
        usage: {
          inputTokens: 11,
          outputTokens: undefined,
          totalTokens: undefined
        }
      },
      { type: "delta", text: "Hello" },
      { type: "delta", text: " world" },
      {
        type: "usage",
        usage: {
          inputTokens: undefined,
          outputTokens: 7,
          totalTokens: undefined
        }
      },
      { type: "end", finishReason: "end_turn" }
    ]);
  });
});
