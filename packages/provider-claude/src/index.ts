import {
  LightwayError,
  schemaToPromptText,
  type JsonSchema,
  type ModelProvider,
  type ProviderCapability,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderRuntimeStatus,
  type ProviderStreamHandler
} from "@lightway/core";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MAX_TOKENS = 1024;

export interface ClaudeProviderOptions {
  apiKey?: string;
  baseUrl?: string;
}

interface ClaudeMessageResponse {
  id?: string;
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface ClaudeStreamEnvelope {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string | null;
  };
  error?: {
    type?: string;
    message?: string;
  };
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !("safeParse" in value);
}

function buildUsage(
  usage?: ClaudeMessageResponse["usage"]
): ProviderResponse["usage"] | undefined {
  if (!usage) {
    return undefined;
  }

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens !== undefined && outputTokens !== undefined
        ? inputTokens + outputTokens
        : undefined
  };
}

function toClaudeContent(
  content: ProviderRequest["messages"][number]["content"]
): Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return [
      {
        type: "text",
        text: content
      }
    ];
  }

  return content.map((part) => {
    if (part.type === "text") {
      return {
        type: "text",
        text: part.text ?? ""
      };
    }

    if (part.type === "json") {
      return {
        type: "text",
        text: JSON.stringify(part.data, null, 2)
      };
    }

    throw new LightwayError(
      "UNSUPPORTED_FEATURE",
      "Claude provider does not support image-url input in this implementation"
    );
  });
}

function responseContentToText(content: ClaudeMessageResponse["content"]): string {
  if (!content) {
    return "";
  }

  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

function parseSseChunk(chunk: string): { event?: string; data: string } | undefined {
  const lines = chunk.trim().split(/\r?\n/);
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  return {
    event,
    data: dataLines.join("\n")
  };
}

function buildSystemPrompt(request: ProviderRequest): string {
  if (!request.structuredOutput || !request.outputSchema) {
    return request.systemPrompt;
  }

  const schemaText = isJsonSchema(request.outputSchema)
    ? schemaToPromptText(request.outputSchema)
    : "Return JSON that satisfies the server-side validation schema.";

  return [
    request.systemPrompt,
    "Return only valid JSON that matches the required schema.",
    "Schema:",
    schemaText
  ].join("\n\n");
}

export class ClaudeProvider implements ModelProvider {
  readonly name = "claude";
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(options: ClaudeProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseUrl = (options.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      ""
    );
  }

  supports(capability: ProviderCapability): boolean {
    return (
      capability === "text-generation" ||
      capability === "structured-output" ||
      capability === "streaming"
    );
  }

  getStatus(): ProviderRuntimeStatus {
    if (!this.apiKey) {
      return {
        status: "failed",
        issue: "ANTHROPIC_API_KEY_MISSING"
      };
    }

    return {
      status: "ready"
    };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.callApi<ClaudeMessageResponse>(request, false);

    return {
      rawText: responseContentToText(response.content),
      finishReason: response.stop_reason ?? undefined,
      usage: buildUsage(response.usage),
      metadata: {
        upstreamId: response.id
      }
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    const response = await this.callRaw(request, true);
    if (!response.body) {
      throw new Error("Claude response body is empty");
    }

    await handler({ type: "start" });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason: string | undefined;
    let ended = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const rawChunk of chunks) {
        const entry = parseSseChunk(rawChunk);
        if (!entry || entry.data === "[DONE]") {
          continue;
        }

        const payload = JSON.parse(entry.data) as ClaudeStreamEnvelope;
        const eventType = entry.event ?? payload.type;

        if (
          eventType === "content_block_delta" &&
          payload.delta?.type === "text_delta" &&
          payload.delta.text
        ) {
          await handler({
            type: "delta",
            text: payload.delta.text
          });
        }

        const usage = payload.message?.usage ?? payload.usage;
        if (usage) {
          await handler({
            type: "usage",
            usage: buildUsage(usage) ?? {}
          });
        }

        const candidateStopReason = payload.delta?.stop_reason;
        if (candidateStopReason) {
          finishReason = candidateStopReason;
        }

        if (eventType === "error") {
          await handler({
            type: "error",
            error: {
              code: payload.error?.type ?? "anthropic_stream_error",
              message: payload.error?.message ?? "Anthropic stream failed"
            }
          });
          return;
        }

        if (eventType === "message_stop") {
          ended = true;
          await handler({
            type: "end",
            finishReason
          });
        }
      }
    }

    if (!ended) {
      await handler({
        type: "end",
        finishReason
      });
    }
  }

  private async callApi<T>(request: ProviderRequest, stream: boolean): Promise<T> {
    const response = await this.callRaw(request, stream);
    return (await response.json()) as T;
  }

  private async callRaw(
    request: ProviderRequest,
    stream: boolean
  ): Promise<Response> {
    if (!this.apiKey) {
      throw new LightwayError(
        "PROVIDER_EXECUTION_FAILED",
        "Anthropic API key is not configured"
      );
    }

    const body: Record<string, unknown> = {
      model: request.model,
      system: buildSystemPrompt(request),
      messages: request.messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: toClaudeContent(message.content)
      })),
      max_tokens: request.generationOptions?.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream
    };

    if (request.generationOptions?.temperature !== undefined) {
      body.temperature = request.generationOptions.temperature;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(body),
      signal: request.abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic request failed with ${response.status}: ${errorText}`);
    }

    return response;
  }
}
