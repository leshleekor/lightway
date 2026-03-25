import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  LightwayError,
  type ModelProvider,
  type ProviderCapability,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderRuntimeStatus,
  type ProviderStreamHandler
} from "@lightway/core";

export interface BedrockProviderOptions {
  region?: string;
}

function toBedrockContent(
  content: ProviderRequest["messages"][number]["content"]
): Array<{ text: string }> {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  return content.map((part) => {
    if (part.type === "text") {
      return { text: part.text ?? "" };
    }

    if (part.type === "json") {
      return { text: JSON.stringify(part.data, null, 2) };
    }

    throw new LightwayError(
      "UNSUPPORTED_FEATURE",
      "Bedrock provider does not support image-url input in this implementation"
    );
  });
}

export class BedrockProvider implements ModelProvider {
  readonly name = "bedrock";
  private readonly client: BedrockRuntimeClient;
  private readonly region?: string;

  constructor(options: BedrockProviderOptions = {}) {
    this.region = options.region ?? process.env.AWS_REGION;
    this.client = new BedrockRuntimeClient({
      region: this.region
    });
  }

  supports(capability: ProviderCapability): boolean {
    return (
      capability === "text-generation" || capability === "streaming"
    );
  }

  getStatus(): ProviderRuntimeStatus {
    if (!this.region) {
      return {
        status: "failed",
        issue: "AWS_REGION_MISSING"
      };
    }

    return {
      status: "ready"
    };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.client.send(
      new ConverseCommand({
        modelId: request.model,
        system: [{ text: request.systemPrompt }],
        messages: request.messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: toBedrockContent(message.content)
        })),
        inferenceConfig: {
          temperature: request.generationOptions?.temperature,
          maxTokens: request.generationOptions?.maxTokens
        }
      }),
      request.abortSignal ? { abortSignal: request.abortSignal } : undefined
    );

    const rawText =
      response.output?.message?.content
        ?.map((content) => content.text ?? "")
        .join("") ?? "";

    return {
      rawText,
      finishReason: response.stopReason,
      usage: response.usage
        ? {
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            totalTokens: response.usage.totalTokens
          }
        : undefined,
      metadata: {
        requestId: response.$metadata.requestId
      }
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    const response = await this.client.send(
      new ConverseStreamCommand({
        modelId: request.model,
        system: [{ text: request.systemPrompt }],
        messages: request.messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: toBedrockContent(message.content)
        })),
        inferenceConfig: {
          temperature: request.generationOptions?.temperature,
          maxTokens: request.generationOptions?.maxTokens
        }
      }),
      request.abortSignal ? { abortSignal: request.abortSignal } : undefined
    );

    await handler({ type: "start" });

    let finishReason: string | undefined;

    for await (const event of response.stream ?? []) {
      if (event.contentBlockDelta?.delta?.text) {
        await handler({
          type: "delta",
          text: event.contentBlockDelta.delta.text
        });
      }

      if (event.metadata?.usage) {
        await handler({
          type: "usage",
          usage: {
            inputTokens: event.metadata.usage.inputTokens,
            outputTokens: event.metadata.usage.outputTokens,
            totalTokens: event.metadata.usage.totalTokens
          }
        });
      }

      if (event.messageStop?.stopReason) {
        finishReason = event.messageStop.stopReason;
      }
    }

    await handler({
      type: "end",
      finishReason
    });
  }
}
