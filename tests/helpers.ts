import type {
  AIDefinition,
  DefinitionSource,
  ModelProvider,
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
  ProviderRuntimeStatus,
  ProviderStreamHandler
} from "@lightway/core";

export class InlineDefinitionSource implements DefinitionSource {
  constructor(private readonly definitions: AIDefinition[]) {}

  async list(): Promise<AIDefinition[]> {
    return this.definitions;
  }

  async get(name: string): Promise<AIDefinition | undefined> {
    return this.definitions.find((definition) => definition.name === name);
  }
}

export interface MockProviderOptions {
  name?: string;
  capabilities?: ProviderCapability[];
  status?: ProviderRuntimeStatus;
  onGenerate?: (
    request: ProviderRequest,
    attempt: number
  ) => Promise<ProviderResponse> | ProviderResponse;
  onStream?: (
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ) => Promise<void> | void;
}

export class MockProvider implements ModelProvider {
  readonly name: string;
  readonly capabilities: Set<ProviderCapability>;
  readonly generateRequests: ProviderRequest[] = [];
  readonly streamRequests: ProviderRequest[] = [];
  readonly status: ProviderRuntimeStatus;
  private readonly onGenerate?: MockProviderOptions["onGenerate"];
  private readonly onStream?: MockProviderOptions["onStream"];

  constructor(options: MockProviderOptions = {}) {
    this.name = options.name ?? "mock";
    this.capabilities = new Set(
      options.capabilities ?? [
        "text-generation",
        "structured-output",
        "streaming"
      ]
    );
    this.status = options.status ?? { status: "ready" };
    this.onGenerate = options.onGenerate;
    this.onStream = options.onStream;
  }

  supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  getStatus(): ProviderRuntimeStatus {
    return this.status;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    this.generateRequests.push(request);

    if (this.onGenerate) {
      return await this.onGenerate(request, this.generateRequests.length);
    }

    return {
      rawText: "ok"
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    this.streamRequests.push(request);

    if (this.onStream) {
      await this.onStream(request, handler);
      return;
    }

    await handler({ type: "start" });
    await handler({ type: "delta", text: "ok" });
    await handler({ type: "end", finishReason: "stop" });
  }
}
