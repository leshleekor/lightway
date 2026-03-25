import { LightwayError, type JsonSchema, type ModelProvider, type ProviderCapability, type ProviderRequest, type ProviderResponse, type ProviderRuntimeStatus, type ProviderStreamHandler } from "@lightway/core";

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
}

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: ChatCompletionUsage;
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !("safeParse" in value);
}

function sanitizeSchemaName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "lightway_output";
}

function toOpenAIContent(
  content: ProviderRequest["messages"][number]["content"]
): string | Array<Record<string, unknown>> {
  if (typeof content === "string") {
    return content;
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
      "OpenAI provider does not support image-url input in this implementation"
    );
  });
}

function responseContentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function buildUsage(usage?: ChatCompletionUsage): ProviderResponse["usage"] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens
  };
}

function parseSsePayload(chunk: string): string[] {
  return chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
}

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly organization?: string;
  private readonly project?: string;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com").replace(/\/$/, "");
    this.organization = options.organization ?? process.env.OPENAI_ORGANIZATION;
    this.project = options.project ?? process.env.OPENAI_PROJECT;
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
        issue: "OPENAI_API_KEY_MISSING"
      };
    }

    return {
      status: "ready"
    };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.callApi<ChatCompletionResponse>(request, false);
    const choice = response.choices?.[0];
    const rawText = responseContentToText(choice?.message?.content);

    return {
      rawText,
      finishReason: choice?.finish_reason ?? undefined,
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
      throw new Error("OpenAI response body is empty");
    }

    await handler({ type: "start" });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        for (const payloadText of parseSsePayload(chunk)) {
          if (payloadText === "[DONE]") {
            continue;
          }

          const payload = JSON.parse(payloadText) as {
            choices?: Array<{
              delta?: {
                content?: string | Array<{ type?: string; text?: string }>;
              };
              finish_reason?: string | null;
            }>;
            usage?: ChatCompletionUsage;
          };

          const choice = payload.choices?.[0];
          const deltaText = responseContentToText(choice?.delta?.content);
          if (deltaText) {
            await handler({
              type: "delta",
              text: deltaText
            });
          }

          if (payload.usage) {
            await handler({
              type: "usage",
              usage: buildUsage(payload.usage) ?? {}
            });
          }

          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }
      }
    }

    await handler({
      type: "end",
      finishReason
    });
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
        "OpenAI API key is not configured"
      );
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        {
          role: "system",
          content: request.systemPrompt
        },
        ...request.messages.map((message) => ({
          role: message.role,
          content: toOpenAIContent(message.content)
        }))
      ],
      stream,
      temperature: request.generationOptions?.temperature,
      max_tokens: request.generationOptions?.maxTokens
    };

    if (stream) {
      body.stream_options = {
        include_usage: true
      };
    }

    if (
      request.structuredOutput &&
      request.outputSchema &&
      isJsonSchema(request.outputSchema)
    ) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: sanitizeSchemaName(request.definitionName),
          schema: request.outputSchema,
          strict: true
        }
      };
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`
    };

    if (this.organization) {
      headers["OpenAI-Organization"] = this.organization;
    }

    if (this.project) {
      headers["OpenAI-Project"] = this.project;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: request.abortSignal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
    }

    return response;
  }
}
