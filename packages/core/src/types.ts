import type { ZodType } from "zod";

export interface JsonSchema {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  description?: string;
  format?: string;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  [key: string]: unknown;
}

export type SchemaLike<T = unknown> = ZodType<T> | JsonSchema;

export interface ExecuteRequest {
  definitionName: string;
  input: unknown;
  context?: boolean;
  contextId?: string;
  structuredOutput?: boolean;
  stream?: boolean;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  toolCalling?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ExecuteResponse<T = unknown> {
  requestId: string;
  definitionName: string;
  contextId?: string;
  provider: string;
  model: string;
  output: T;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
}

export interface AIDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description?: string;
  provider: string;
  model: string;
  systemPrompt: string;
  inputSchema: SchemaLike<TInput>;
  outputSchema?: SchemaLike<TOutput>;
  preprocess?: string[];
  postprocess?: string[];
  rag?: RagConfig[];
  providerOptions?: Record<string, unknown>;
  executionOptions?: {
    context?: boolean;
    contextStore?: string;
    contextWindow?: {
      maxMessages?: number;
      maxTokens?: number;
      ttlSeconds?: number;
    };
    structuredOutput?: boolean;
    stream?: boolean;
    timeoutMs?: number;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LightwayContext {
  requestId: string;
  definition: AIDefinition;
  input: unknown;
  contextEnabled: boolean;
  contextId?: string;
  messages: LightwayMessage[];
  ragArtifacts: RagArtifact[];
  metadata: Record<string, unknown>;
}

export interface LightwayMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LightwayContentPart[];
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface LightwayContentPart {
  type: "text" | "image-url" | "json";
  text?: string;
  url?: string;
  data?: unknown;
  mimeType?: string;
}

export interface LightwayResult<T = unknown> {
  rawText: string;
  output?: T;
  provider: string;
  model: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface Preprocessor {
  name: string;
  run(context: LightwayContext): Promise<LightwayContext>;
}

export interface Postprocessor {
  name: string;
  run(result: LightwayResult, context: LightwayContext): Promise<LightwayResult>;
}

export type ProviderCapability =
  | "text-generation"
  | "structured-output"
  | "streaming"
  | "tool-calling";

export interface ProviderRequest {
  requestId: string;
  definitionName: string;
  provider: string;
  model: string;
  systemPrompt: string;
  input: unknown;
  messages: LightwayMessage[];
  ragArtifacts?: RagArtifact[];
  outputSchema?: SchemaLike<unknown>;
  structuredOutput?: boolean;
  stream?: boolean;
  timeoutMs?: number;
  tools?: string[];
  generationOptions?: {
    temperature?: number;
    maxTokens?: number;
  };
  providerOptions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface ProviderResponse {
  rawText: string;
  output?: unknown;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

export type ProviderStreamEvent =
  | { type: "start"; metadata?: Record<string, unknown> }
  | { type: "delta"; text: string }
  | {
      type: "usage";
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
    }
  | { type: "end"; finishReason?: string; metadata?: Record<string, unknown> }
  | { type: "error"; error: { code: string; message: string } };

export type ProviderStreamHandler = (
  event: ProviderStreamEvent
) => Promise<void> | void;

export interface ProviderRuntimeStatus {
  status: "ready" | "failed";
  issue?: string;
}

export interface ModelProvider {
  name: string;
  supports(capability: ProviderCapability): boolean;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  stream?(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void>;
  getStatus?(): ProviderRuntimeStatus;
}

export interface ContextLoadOptions {
  limit?: number;
}

export interface ContextStore {
  get(
    contextId: string,
    options?: ContextLoadOptions
  ): Promise<LightwayMessage[]>;
  append(contextId: string, messages: LightwayMessage[]): Promise<void>;
  create?(): Promise<string>;
}

export interface ContextStoreWithTtl extends ContextStore {
  setTtl?(contextId: string, ttlSeconds: number): Promise<void> | void;
}

export interface RagConfig {
  name: string;
  retriever: string;
  sourceType: "vector" | "sql" | "http" | "custom";
  priority?: number;
  topK?: number;
  filters?: Record<string, unknown>;
  promptTemplate?: string;
  injectAs?: "system" | "user-context";
  dedupeStrategy?: "id" | "content" | "none";
}

export interface RagArtifact {
  name: string;
  documents: RagDocument[];
  metadata?: Record<string, unknown>;
}

export interface RagDocument {
  id: string;
  content: string;
  score?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RagRetriever {
  name: string;
  run(context: LightwayContext, config: RagConfig): Promise<RagArtifact>;
}

export interface WarningDetail {
  code: string;
  message: string;
  target?: string;
}

export interface DefinitionWarningSummary {
  definitionName: string;
  warnings: WarningDetail[];
}

export interface DefinitionSource {
  list(): Promise<AIDefinition[]>;
  get(name: string): Promise<AIDefinition | undefined>;
}

export interface DefinitionRegistry {
  load(source: DefinitionSource, registry: LightwayRegistry): Promise<void>;
  get(name: string): AIDefinition | undefined;
  getWarnings(name: string): WarningDetail[];
  list(): AIDefinition[];
  listWarnings(): DefinitionWarningSummary[];
}

export interface SanitizedAIDefinition {
  name: string;
  description?: string;
  provider: string;
  model: string;
  inputSchema: SchemaLike;
  outputSchema?: SchemaLike;
  preprocess?: string[];
  postprocess?: string[];
  rag?: RagConfig[];
  executionOptions?: AIDefinition["executionOptions"];
  warnings?: WarningDetail[];
}

export interface LightwayRegistry {
  registerProvider(provider: ModelProvider): void;
  registerPreprocessor(preprocessor: Preprocessor): void;
  registerPostprocessor(postprocessor: Postprocessor): void;
  registerRagRetriever(retriever: RagRetriever): void;
  registerContextStore(name: string, store: ContextStore): void;
  setDefaultContextStore(name: string): void;
  getProvider(name: string): ModelProvider | undefined;
  getPreprocessor(name: string): Preprocessor | undefined;
  getPostprocessor(name: string): Postprocessor | undefined;
  getRagRetriever(name: string): RagRetriever | undefined;
  getContextStore(name: string): ContextStore | undefined;
  getDefaultContextStore(): ContextStore | undefined;
  getDefaultContextStoreName(): string | undefined;
  listProviders(): ModelProvider[];
  listPreprocessors(): Preprocessor[];
  listPostprocessors(): Postprocessor[];
  listRagRetrievers(): RagRetriever[];
  listContextStores(): Array<{ name: string; store: ContextStore }>;
}

export type ReadinessCheckState = "ok" | "degraded" | "disabled" | "failed";

export interface ReadinessReport {
  status: "ready" | "not_ready";
  checks: {
    definitions: ReadinessCheckState;
    providers: ReadinessCheckState;
    auth: ReadinessCheckState;
    contextStore: ReadinessCheckState;
  };
  warnings: {
    system: WarningDetail[];
    definitions: DefinitionWarningSummary[];
  };
  issues: string[];
}

export type GatewayStreamEvent =
  | {
      type: "start";
      data: {
        requestId: string;
        definitionName: string;
        contextId?: string;
        provider: string;
        model: string;
      };
    }
  | { type: "delta"; data: { text: string } }
  | {
      type: "usage";
      data: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
    }
  | { type: "output"; data: { output: unknown } }
  | {
      type: "end";
      data: {
        finishReason?: string;
        latencyMs: number;
        contextId?: string;
      };
    }
  | {
      type: "error";
      data: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };

export interface ExecuteOrchestrator {
  execute(
    request: ExecuteRequest,
    options?: { requestId?: string }
  ): Promise<ExecuteResponse>;
  stream(
    request: ExecuteRequest,
    options: {
      requestId?: string;
      onEvent: (event: GatewayStreamEvent) => Promise<void> | void;
    }
  ): Promise<void>;
}
