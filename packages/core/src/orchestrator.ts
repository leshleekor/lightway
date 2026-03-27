import { randomUUID } from "node:crypto";
import { LightwayError, isLightwayError } from "./errors.js";
import { schemaToPromptText, validateWithSchema } from "./schema.js";
import type {
  AIDefinition,
  ContextStore,
  ContextStoreWithTtl,
  DefinitionRegistry,
  ExecutionErrorStage,
  ExecutionHook,
  ExecutionHookEvent,
  ExecuteOrchestrator,
  ExecuteRequest,
  ExecuteResponse,
  GatewayStreamEvent,
  LightwayContext,
  LightwayMessage,
  LightwayRegistry,
  LightwayResult,
  ModelProvider,
  ProviderRequest,
  ProviderResponse,
  RagArtifact,
  RagConfig,
  RagDocument,
  SchemaLike
} from "./types.js";

interface CreateExecuteOrchestratorOptions {
  registry: LightwayRegistry;
  definitionRegistry: DefinitionRegistry;
  defaultTimeoutMs?: number;
  onExecutionEnd?: ExecutionHook;
}

interface ResolvedExecutionOptions {
  context: boolean;
  stream: boolean;
  structuredOutput: boolean;
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
}

interface PreparedExecution {
  requestId: string;
  definition: AIDefinition;
  provider: ModelProvider;
  providerRequest: ProviderRequest;
  context: LightwayContext;
  contextEnabled: boolean;
  contextId?: string;
  contextStore?: ContextStore;
  effective: ResolvedExecutionOptions;
  saveUserMessage?: LightwayMessage;
  startedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serializeUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function contentToText(content: LightwayMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === "text") {
        return part.text ?? "";
      }

      if (part.type === "json") {
        return JSON.stringify(part.data, null, 2);
      }

      throw new LightwayError(
        "UNSUPPORTED_FEATURE",
        "This provider does not support image input"
      );
    })
    .join("\n");
}

function estimateTextTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function trimMessagesTailFirst(
  messages: LightwayMessage[],
  maxTokens?: number
): LightwayMessage[] {
  if (!maxTokens || messages.length === 0) {
    return messages;
  }

  const kept: LightwayMessage[] = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    const nextSize = estimateTextTokens(contentToText(message.content));

    // Always preserve the latest turn and trim only older history.
    if (kept.length > 0 && total + nextSize > maxTokens) {
      break;
    }

    kept.unshift(message);
    total += nextSize;
  }

  return kept;
}

function sortRagConfigs(rag: RagConfig[]): RagConfig[] {
  return [...rag].sort((left, right) => {
    const leftPriority = left.priority ?? 0;
    const rightPriority = right.priority ?? 0;
    return rightPriority - leftPriority;
  });
}

function dedupeDocuments(documents: RagDocument[], strategy?: RagConfig["dedupeStrategy"]) {
  if (strategy === "none") {
    return documents;
  }

  const seen = new Set<string>();
  const result: RagDocument[] = [];

  for (const document of documents) {
    const key =
      strategy === "content"
        ? document.content
        : document.id || document.content;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(document);
  }

  return result;
}

function ragDocumentsToText(config: RagConfig, documents: RagDocument[]): string {
  if (documents.length === 0) {
    return "";
  }

  const defaultText = [
    `RAG source: ${config.name}`,
    ...documents.map((document, index) => {
      const source = document.source ? ` (${document.source})` : "";
      return `${index + 1}. ${document.content}${source}`;
    })
  ].join("\n");

  if (!config.promptTemplate) {
    return defaultText;
  }

  return config.promptTemplate
    .replaceAll("{{name}}", config.name)
    .replaceAll("{{documentCount}}", String(documents.length))
    .replaceAll("{{documents}}", defaultText);
}

function findSavableUserMessage(messages: LightwayMessage[]): LightwayMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role === "user" && message.metadata?.source !== "rag") {
      return message;
    }
  }

  return undefined;
}

function buildAssistantMessage(result: LightwayResult): LightwayMessage {
  const text =
    result.rawText ||
    (result.output !== undefined ? JSON.stringify(result.output, null, 2) : "");

  return {
    role: "assistant",
    content: text,
    timestamp: new Date().toISOString()
  };
}

function mergeUsage(
  current: LightwayResult["usage"],
  incoming: NonNullable<LightwayResult["usage"]>
): NonNullable<LightwayResult["usage"]> {
  const inputTokens = incoming.inputTokens ?? current?.inputTokens;
  const outputTokens = incoming.outputTokens ?? current?.outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      incoming.totalTokens ??
      (inputTokens !== undefined && outputTokens !== undefined
        ? inputTokens + outputTokens
        : current?.totalTokens)
  };
}

function parseStructuredOutput(
  response: ProviderResponse,
  outputSchema: SchemaLike<unknown>
) {
  const candidate =
    response.output !== undefined ? response.output : tryParseJson(response.rawText);

  if (candidate === undefined) {
    return {
      success: false as const,
      errors: ["Provider response was not valid JSON"]
    };
  }

  const validation = validateWithSchema(outputSchema, candidate);
  if (!validation.success) {
    return {
      success: false as const,
      errors: validation.errors
    };
  }

  return {
    success: true as const,
    output: validation.data
  };
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function buildRepairMessage(
  errors: string[],
  outputSchema: SchemaLike<unknown>
): LightwayMessage {
  return {
    role: "user",
    content: [
      "Your previous response did not satisfy the required output schema.",
      `Errors: ${errors.join("; ")}`,
      "Return only corrected JSON.",
      "Schema:",
      schemaToPromptText(outputSchema)
    ].join("\n"),
    metadata: {
      source: "structured-output-repair"
    },
    timestamp: new Date().toISOString()
  };
}

async function withProviderTimeout<T>(
  timeoutMs: number,
  executor: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(
        new LightwayError("PROVIDER_TIMEOUT", "Provider request timed out", {
          timeoutMs
        })
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([executor(controller.signal), timeoutPromise]);
  } catch (error) {
    if (error instanceof LightwayError) {
      throw error;
    }

    if ((error as { name?: string }).name === "AbortError") {
      throw new LightwayError("PROVIDER_TIMEOUT", "Provider request timed out", {
        timeoutMs
      });
    }

    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeProviderError(error: unknown): never {
  if (isLightwayError(error)) {
    throw error;
  }

  if ((error as { name?: string }).name === "AbortError") {
    throw new LightwayError("PROVIDER_TIMEOUT", "Provider request timed out");
  }

  throw new LightwayError("PROVIDER_EXECUTION_FAILED", "Upstream provider request failed", {
    cause: error instanceof Error ? error.message : "unknown"
  });
}

function toLightwayError(error: unknown): LightwayError {
  if (isLightwayError(error)) {
    return error;
  }

  return new LightwayError("INTERNAL_ERROR", "Unexpected execution failure", {
    cause: error instanceof Error ? error.message : "unknown"
  });
}

function isExecutionAuditSinkFailure(error: unknown): boolean {
  return isLightwayError(error) && error.code === "EXECUTION_AUDIT_SINK_FAILED";
}

function mapErrorStage(error: LightwayError): ExecutionErrorStage {
  switch (error.code) {
    case "PROVIDER_EXECUTION_FAILED":
    case "PROVIDER_TIMEOUT":
    case "PROVIDER_CAPABILITY_NOT_SUPPORTED":
    case "PROVIDER_NOT_FOUND":
      return "provider";
    case "PREPROCESS_FAILED":
    case "PREPROCESSOR_NOT_FOUND":
      return "preprocess";
    case "POSTPROCESS_FAILED":
    case "POSTPROCESSOR_NOT_FOUND":
    case "EXECUTION_AUDIT_SINK_FAILED":
      return "postprocess";
    case "STRUCTURED_OUTPUT_VALIDATION_FAILED":
      return "structured-output";
    case "CONTEXT_LOAD_FAILED":
    case "CONTEXT_SAVE_FAILED":
    case "CONTEXT_STORE_NOT_FOUND":
      return "context";
    case "RAG_EXECUTION_FAILED":
    case "RAG_RETRIEVER_NOT_FOUND":
      return "rag";
    case "INVALID_INPUT":
    case "DEFINITION_NOT_FOUND":
      return "input-validation";
    default:
      return "internal";
  }
}

function buildFailureExecutionEvent(
  request: ExecuteRequest,
  requestId: string,
  startedAt: number,
  error: LightwayError,
  prepared?: PreparedExecution,
  result?: LightwayResult
): ExecutionHookEvent {
  return {
    requestId,
    definitionName: prepared?.definition.name ?? request.definitionName,
    provider: prepared?.provider.name,
    model: prepared?.definition.model,
    contextId: prepared?.contextId ?? request.contextId,
    status: "failed",
    latencyMs: Date.now() - startedAt,
    finishReason: result?.finishReason,
    usage: result?.usage,
    rawText: result?.rawText,
    output: result?.output,
    error: {
      code: error.code,
      message: error.message,
      stage: mapErrorStage(error),
      details: error.details
    },
    metadata: result?.metadata
  };
}

function buildSuccessExecutionEvent(
  prepared: PreparedExecution,
  result: LightwayResult
): ExecutionHookEvent {
  return {
    requestId: prepared.requestId,
    definitionName: prepared.definition.name,
    provider: prepared.provider.name,
    model: prepared.definition.model,
    contextId: prepared.contextId,
    status: "succeeded",
    latencyMs: Date.now() - prepared.startedAt,
    finishReason: result.finishReason,
    usage: result.usage,
    rawText: result.rawText,
    output: result.output,
    metadata: result.metadata
  };
}

function resolveExecutionOptions(
  request: ExecuteRequest,
  definition: AIDefinition,
  defaultTimeoutMs: number
): ResolvedExecutionOptions {
  if (request.toolCalling && request.toolCalling.length > 0) {
    throw new LightwayError(
      "UNSUPPORTED_FEATURE",
      "toolCalling is reserved for a future phase"
    );
  }

  const hasOutputSchema = definition.outputSchema !== undefined;
  if (hasOutputSchema && request.structuredOutput === false) {
    throw new LightwayError(
      "UNSUPPORTED_FEATURE",
      "structuredOutput cannot be disabled when outputSchema is defined"
    );
  }

  if (!hasOutputSchema && request.structuredOutput === true) {
    throw new LightwayError(
      "UNSUPPORTED_FEATURE",
      "structuredOutput requires outputSchema in the definition"
    );
  }

  if (
    request.temperature !== undefined &&
    (Number.isNaN(request.temperature) ||
      request.temperature < 0 ||
      request.temperature > 2)
  ) {
    throw new LightwayError(
      "INVALID_INPUT",
      "temperature must be between 0 and 2",
      { field: "temperature" }
    );
  }

  return {
    context: request.context ?? definition.executionOptions?.context ?? false,
    stream: request.stream ?? definition.executionOptions?.stream ?? false,
    structuredOutput: hasOutputSchema,
    timeoutMs:
      request.timeoutMs ??
      definition.executionOptions?.timeoutMs ??
      defaultTimeoutMs,
    temperature:
      request.temperature ?? definition.executionOptions?.temperature,
    maxTokens: request.maxTokens ?? definition.executionOptions?.maxTokens
  };
}

async function resolveContextStore(
  registry: LightwayRegistry,
  definition: AIDefinition,
  contextEnabled: boolean
): Promise<ContextStore | undefined> {
  if (!contextEnabled) {
    return undefined;
  }

  const storeName =
    definition.executionOptions?.contextStore ?? registry.getDefaultContextStoreName();

  if (!storeName) {
    throw new LightwayError(
      "CONTEXT_STORE_NOT_FOUND",
      "No context store is configured for this execution"
    );
  }

  const store = registry.getContextStore(storeName);
  if (!store) {
    throw new LightwayError(
      "CONTEXT_STORE_NOT_FOUND",
      "Configured context store is not registered",
      { target: storeName }
    );
  }

  return store;
}

async function runPreprocessors(
  registry: LightwayRegistry,
  definition: AIDefinition,
  context: LightwayContext
): Promise<LightwayContext> {
  let currentContext = context;

  for (const name of definition.preprocess ?? []) {
    const preprocessor = registry.getPreprocessor(name);
    if (!preprocessor) {
      throw new LightwayError(
        "PREPROCESSOR_NOT_FOUND",
        "Referenced preprocessor is not registered",
        { target: name }
      );
    }

    try {
      currentContext = await preprocessor.run(currentContext);
    } catch (error) {
      if (isLightwayError(error)) {
        throw error;
      }

      throw new LightwayError("PREPROCESS_FAILED", "Preprocess step failed", {
        target: name,
        cause: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return currentContext;
}

async function runRagRetrievers(
  registry: LightwayRegistry,
  definition: AIDefinition,
  context: LightwayContext
): Promise<RagArtifact[]> {
  const artifacts: RagArtifact[] = [];

  for (const config of sortRagConfigs(definition.rag ?? [])) {
    const retriever = registry.getRagRetriever(config.retriever);
    if (!retriever) {
      throw new LightwayError(
        "RAG_RETRIEVER_NOT_FOUND",
        "Referenced RAG retriever is not registered",
        { target: config.retriever }
      );
    }

    try {
      const artifact = await retriever.run(context, config);
      artifacts.push({
        ...artifact,
        documents: dedupeDocuments(
          artifact.documents,
          config.dedupeStrategy
        )
      });
    } catch (error) {
      if (isLightwayError(error)) {
        throw error;
      }

      throw new LightwayError("RAG_EXECUTION_FAILED", "RAG execution failed", {
        target: config.retriever,
        cause: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return artifacts;
}

function mergeRagIntoRequest(
  definition: AIDefinition,
  context: LightwayContext
): Pick<ProviderRequest, "messages" | "systemPrompt"> {
  let systemPrompt = definition.systemPrompt;
  const messages = [...context.messages];

  const systemBlocks: string[] = [];
  const userBlocks: string[] = [];

  for (const config of sortRagConfigs(definition.rag ?? [])) {
    const artifact = context.ragArtifacts.find((item) => item.name === config.name);
    if (!artifact) {
      continue;
    }

    const text = ragDocumentsToText(config, artifact.documents);
    if (!text) {
      continue;
    }

    if ((config.injectAs ?? "system") === "user-context") {
      userBlocks.push(text);
    } else {
      systemBlocks.push(text);
    }
  }

  if (systemBlocks.length > 0) {
    systemPrompt = `${systemPrompt}\n\n${systemBlocks.join("\n\n")}`;
  }

  if (userBlocks.length > 0) {
    const ragMessage: LightwayMessage = {
      role: "user",
      content: userBlocks.join("\n\n"),
      metadata: {
        source: "rag",
        injectAs: "user-context"
      },
      timestamp: new Date().toISOString()
    };

    const insertIndex = Math.max(messages.length - 1, 0);
    messages.splice(insertIndex, 0, ragMessage);
  }

  return {
    messages: trimMessagesTailFirst(
      messages,
      definition.executionOptions?.contextWindow?.maxTokens
    ),
    systemPrompt
  };
}

async function applyContextTtl(
  definition: AIDefinition,
  contextId: string,
  store: ContextStore
): Promise<void> {
  const ttlSeconds = definition.executionOptions?.contextWindow?.ttlSeconds;
  if (!ttlSeconds) {
    return;
  }

  const ttlAwareStore = store as ContextStoreWithTtl;
  if (typeof ttlAwareStore.setTtl === "function") {
    await ttlAwareStore.setTtl(contextId, ttlSeconds);
  }
}

async function saveContextMessages(
  store: ContextStore,
  contextId: string,
  userMessage: LightwayMessage | undefined,
  result: LightwayResult
): Promise<void> {
  if (!userMessage) {
    return;
  }

  try {
    await store.append(contextId, [userMessage, buildAssistantMessage(result)]);
  } catch (error) {
    throw new LightwayError("CONTEXT_SAVE_FAILED", "Failed to save context", {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function runPostprocessors(
  registry: LightwayRegistry,
  definition: AIDefinition,
  result: LightwayResult,
  context: LightwayContext
): Promise<LightwayResult> {
  let currentResult = result;

  for (const name of definition.postprocess ?? []) {
    const postprocessor = registry.getPostprocessor(name);
    if (!postprocessor) {
      throw new LightwayError(
        "POSTPROCESSOR_NOT_FOUND",
        "Referenced postprocessor is not registered",
        { target: name }
      );
    }

    try {
      currentResult = await postprocessor.run(currentResult, context);
    } catch (error) {
      if (isLightwayError(error)) {
        throw error;
      }

      throw new LightwayError("POSTPROCESS_FAILED", "Postprocess step failed", {
        target: name,
        cause: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return currentResult;
}

async function generateWithStructuredOutput(
  provider: ModelProvider,
  request: ProviderRequest,
  timeoutMs: number
): Promise<ProviderResponse> {
  try {
    return await withProviderTimeout(timeoutMs, (signal) =>
      provider.generate({ ...request, abortSignal: signal })
    );
  } catch (error) {
    normalizeProviderError(error);
  }
}

async function resolveStructuredResponse(
  provider: ModelProvider,
  request: ProviderRequest,
  timeoutMs: number,
  outputSchema: SchemaLike<unknown>
): Promise<ProviderResponse & { output: unknown }> {
  const firstResponse = await generateWithStructuredOutput(provider, request, timeoutMs);
  const firstValidation = parseStructuredOutput(firstResponse, outputSchema);
  if (firstValidation.success) {
    return { ...firstResponse, output: firstValidation.output };
  }

  const retryRequest: ProviderRequest = {
    ...request,
    messages: [
      ...request.messages,
      {
        role: "assistant",
        content: firstResponse.rawText,
        timestamp: new Date().toISOString()
      },
      buildRepairMessage(firstValidation.errors, outputSchema)
    ]
  };

  const secondResponse = await generateWithStructuredOutput(
    provider,
    retryRequest,
    timeoutMs
  );
  const secondValidation = parseStructuredOutput(secondResponse, outputSchema);
  if (!secondValidation.success) {
    throw new LightwayError(
      "STRUCTURED_OUTPUT_VALIDATION_FAILED",
      "Provider response did not match the required output schema",
      {
        errors: secondValidation.errors
      }
    );
  }

  return { ...secondResponse, output: secondValidation.output };
}

async function prepareExecution(
  registry: LightwayRegistry,
  definitionRegistry: DefinitionRegistry,
  request: ExecuteRequest,
  requestId: string,
  defaultTimeoutMs: number,
  startedAt: number
): Promise<PreparedExecution> {
  const definition = definitionRegistry.get(request.definitionName);
  if (!definition) {
    throw new LightwayError("DEFINITION_NOT_FOUND", "Definition not found", {
      definitionName: request.definitionName
    });
  }

  const inputValidation = validateWithSchema(definition.inputSchema, request.input);
  if (!inputValidation.success) {
    throw new LightwayError("INVALID_INPUT", inputValidation.errors.join("; "), {
      field: "input"
    });
  }

  const provider = registry.getProvider(definition.provider);
  if (!provider) {
    throw new LightwayError(
      "PROVIDER_NOT_FOUND",
      "Provider is not registered",
      { provider: definition.provider }
    );
  }

  const effective = resolveExecutionOptions(request, definition, defaultTimeoutMs);
  if (!provider.supports("text-generation")) {
    throw new LightwayError(
      "PROVIDER_CAPABILITY_NOT_SUPPORTED",
      "Provider does not support text generation",
      { provider: provider.name }
    );
  }

  if (effective.structuredOutput && !provider.supports("structured-output")) {
    throw new LightwayError(
      "PROVIDER_CAPABILITY_NOT_SUPPORTED",
      "Provider does not support structured output",
      { provider: provider.name }
    );
  }

  const contextStore = await resolveContextStore(
    registry,
    definition,
    effective.context
  );

  let contextId = request.contextId;
  if (effective.context && !contextId) {
    contextId =
      (await contextStore?.create?.()) ??
      randomUUID();
  }

  if (contextStore && contextId) {
    await applyContextTtl(definition, contextId, contextStore);
  }

  let history: LightwayMessage[] = [];
  if (effective.context && contextStore && contextId) {
    try {
      history = await contextStore.get(contextId, {
        limit: definition.executionOptions?.contextWindow?.maxMessages ?? 20
      });
    } catch (error) {
      throw new LightwayError("CONTEXT_LOAD_FAILED", "Failed to load context", {
        cause: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  const userMessage: LightwayMessage = {
    role: "user",
    content: serializeUnknown(inputValidation.data),
    timestamp: new Date().toISOString()
  };

  let context: LightwayContext = {
    requestId,
    definition,
    input: inputValidation.data,
    contextEnabled: effective.context,
    contextId,
    messages: [...history, userMessage],
    ragArtifacts: [],
    metadata: {
      ...(request.metadata ?? {}),
      lightwayRequestId: requestId,
      lightwayStartedAt: startedAt
    }
  };

  context = await runPreprocessors(registry, definition, context);
  const ragArtifacts = await runRagRetrievers(registry, definition, context);
  context = {
    ...context,
    ragArtifacts
  };

  const merged = mergeRagIntoRequest(definition, context);
  const providerRequest: ProviderRequest = {
    requestId,
    definitionName: definition.name,
    provider: definition.provider,
    model: definition.model,
    systemPrompt: merged.systemPrompt,
    input: inputValidation.data,
    messages: merged.messages,
    ragArtifacts,
    outputSchema: definition.outputSchema,
    structuredOutput: effective.structuredOutput,
    stream: effective.stream,
    timeoutMs: effective.timeoutMs,
    generationOptions: {
      temperature: effective.temperature,
      maxTokens: effective.maxTokens
    },
    providerOptions: definition.providerOptions,
    metadata: {
      ...(request.metadata ?? {}),
      requestId
    }
  };

  return {
    requestId,
    definition,
    provider,
    providerRequest,
    context,
    contextEnabled: effective.context,
    contextId,
    contextStore,
    effective,
    saveUserMessage: findSavableUserMessage(merged.messages),
    startedAt
  };
}

class ExecuteOrchestratorImpl implements ExecuteOrchestrator {
  private readonly registry: LightwayRegistry;
  private readonly definitionRegistry: DefinitionRegistry;
  private readonly defaultTimeoutMs: number;
  private readonly onExecutionEnd?: ExecutionHook;

  constructor(options: CreateExecuteOrchestratorOptions) {
    this.registry = options.registry;
    this.definitionRegistry = options.definitionRegistry;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.onExecutionEnd = options.onExecutionEnd;
  }

  async execute(
    request: ExecuteRequest,
    options?: { requestId?: string }
  ): Promise<ExecuteResponse> {
    const requestId = options?.requestId ?? randomUUID();
    const startedAt = Date.now();
    let prepared: PreparedExecution | undefined;
    let result: LightwayResult | undefined;

    try {
      prepared = await prepareExecution(
        this.registry,
        this.definitionRegistry,
        request,
        requestId,
        this.defaultTimeoutMs,
        startedAt
      );
      const preparedExecution = prepared;

      if (preparedExecution.effective.stream) {
        throw new LightwayError(
          "UNSUPPORTED_FEATURE",
          "Use the streaming API path for stream=true requests"
        );
      }

      let response: ProviderResponse & { output?: unknown };

      if (
        preparedExecution.effective.structuredOutput &&
        preparedExecution.definition.outputSchema
      ) {
        response = await resolveStructuredResponse(
          preparedExecution.provider,
          preparedExecution.providerRequest,
          preparedExecution.effective.timeoutMs,
          preparedExecution.definition.outputSchema
        );
      } else {
        try {
          response = await withProviderTimeout(preparedExecution.effective.timeoutMs, (signal) =>
            preparedExecution.provider.generate({
              ...preparedExecution.providerRequest,
              abortSignal: signal
            })
          );
        } catch (error) {
          normalizeProviderError(error);
        }
      }

      result = {
        rawText: response.rawText,
        output: response.output,
        provider: preparedExecution.provider.name,
        model: preparedExecution.definition.model,
        finishReason: response.finishReason,
        usage: response.usage,
        metadata: response.metadata
      };

      result = await runPostprocessors(
        this.registry,
        preparedExecution.definition,
        result,
        preparedExecution.context
      );

      if (
        preparedExecution.contextEnabled &&
        preparedExecution.contextStore &&
        preparedExecution.contextId
      ) {
        await saveContextMessages(
          preparedExecution.contextStore,
          preparedExecution.contextId,
          preparedExecution.saveUserMessage,
          result
        );
      }

      await this.onExecutionEnd?.(buildSuccessExecutionEvent(preparedExecution, result));

      return {
        requestId: preparedExecution.requestId,
        definitionName: preparedExecution.definition.name,
        contextId: preparedExecution.contextId,
        provider: preparedExecution.provider.name,
        model: preparedExecution.definition.model,
        output:
          preparedExecution.effective.structuredOutput
            ? result.output
            : (result.output ?? result.rawText),
        usage: result.usage,
        latencyMs: Date.now() - preparedExecution.startedAt
      };
    } catch (error) {
      const lightwayError = toLightwayError(error);

      if (!isExecutionAuditSinkFailure(lightwayError)) {
        try {
          await this.onExecutionEnd?.(
            buildFailureExecutionEvent(
              request,
              requestId,
              startedAt,
              lightwayError,
              prepared,
              result
            )
          );
        } catch {
          // Preserve the original execution failure when failure audit logging also fails.
        }
      }

      throw lightwayError;
    }
  }

  async stream(
    request: ExecuteRequest,
    options: {
      requestId?: string;
      onEvent: (event: GatewayStreamEvent) => Promise<void> | void;
    }
  ): Promise<void> {
    const requestId = options.requestId ?? randomUUID();
    const startedAt = Date.now();
    let prepared: PreparedExecution | undefined;
    let result: LightwayResult | undefined;

    try {
      prepared = await prepareExecution(
        this.registry,
        this.definitionRegistry,
        request,
        requestId,
        this.defaultTimeoutMs,
        startedAt
      );
      const preparedExecution = prepared;

      await options.onEvent({
        type: "start",
        data: {
          requestId: preparedExecution.requestId,
          definitionName: preparedExecution.definition.name,
          contextId: preparedExecution.contextId,
          provider: preparedExecution.provider.name,
          model: preparedExecution.definition.model
        }
      });

      if (
        preparedExecution.effective.structuredOutput &&
        preparedExecution.definition.outputSchema
      ) {
        const response = await resolveStructuredResponse(
          preparedExecution.provider,
          preparedExecution.providerRequest,
          preparedExecution.effective.timeoutMs,
          preparedExecution.definition.outputSchema
        );

        result = {
          rawText: response.rawText,
          output: response.output,
          provider: preparedExecution.provider.name,
          model: preparedExecution.definition.model,
          finishReason: response.finishReason,
          usage: response.usage,
          metadata: response.metadata
        };

        result = await runPostprocessors(
          this.registry,
          preparedExecution.definition,
          result,
          preparedExecution.context
        );

        if (result.usage) {
          await options.onEvent({
            type: "usage",
            data: result.usage
          });
        }

        if (
          preparedExecution.contextEnabled &&
          preparedExecution.contextStore &&
          preparedExecution.contextId
        ) {
          await saveContextMessages(
            preparedExecution.contextStore,
            preparedExecution.contextId,
            preparedExecution.saveUserMessage,
            result
          );
        }

        await this.onExecutionEnd?.(buildSuccessExecutionEvent(preparedExecution, result));

        await options.onEvent({
          type: "output",
          data: {
            output: result.output
          }
        });

        await options.onEvent({
          type: "end",
          data: {
            finishReason: result.finishReason,
            latencyMs: Date.now() - preparedExecution.startedAt,
            contextId: preparedExecution.contextId
          }
        });
        return;
      }

      if (
        !preparedExecution.provider.stream ||
        !preparedExecution.provider.supports("streaming")
      ) {
        throw new LightwayError(
          "PROVIDER_CAPABILITY_NOT_SUPPORTED",
          "Provider does not support streaming",
          { provider: preparedExecution.provider.name }
        );
      }

      let rawText = "";
      let usage: LightwayResult["usage"];
      let finishReason: string | undefined;
      let metadata: Record<string, unknown> | undefined;
      let streamFailure: LightwayError | undefined;
      let streamResult: LightwayResult = {
        rawText,
        provider: preparedExecution.provider.name,
        model: preparedExecution.definition.model
      };
      result = streamResult;

      try {
        await withProviderTimeout(preparedExecution.effective.timeoutMs, (signal) =>
          preparedExecution.provider.stream!(
            {
              ...preparedExecution.providerRequest,
              abortSignal: signal
            },
            async (event) => {
              if (event.type === "delta") {
                rawText += event.text;
                streamResult = {
                  ...streamResult,
                  rawText
                };
                result = streamResult;
                await options.onEvent({
                  type: "delta",
                  data: {
                    text: event.text
                  }
                });
                return;
              }

              if (event.type === "usage") {
                usage = mergeUsage(usage, event.usage);
                streamResult = {
                  ...streamResult,
                  usage
                };
                result = streamResult;
                await options.onEvent({
                  type: "usage",
                  data: usage
                });
                return;
              }

              if (event.type === "end") {
                finishReason = event.finishReason;
                metadata = {
                  ...(metadata ?? {}),
                  ...(event.metadata ?? {})
                };
                streamResult = {
                  ...streamResult,
                  finishReason,
                  metadata
                };
                result = streamResult;
                return;
              }

              if (event.type === "start") {
                metadata = {
                  ...(metadata ?? {}),
                  ...(event.metadata ?? {})
                };
                streamResult = {
                  ...streamResult,
                  metadata
                };
                result = streamResult;
                return;
              }

              if (event.type === "error") {
                streamFailure = new LightwayError(
                  "PROVIDER_EXECUTION_FAILED",
                  event.error.message,
                  {
                    code: event.error.code
                  }
                );
                throw streamFailure;
              }
            }
          )
        );
      } catch (error) {
        normalizeProviderError(error);
      }

      if (streamFailure) {
        throw streamFailure;
      }

      streamResult = {
        ...streamResult,
        rawText,
        finishReason,
        usage,
        metadata
      };
      result = streamResult;

      result = await runPostprocessors(
        this.registry,
        preparedExecution.definition,
        result,
        preparedExecution.context
      );

      if (
        preparedExecution.contextEnabled &&
        preparedExecution.contextStore &&
        preparedExecution.contextId
      ) {
        await saveContextMessages(
          preparedExecution.contextStore,
          preparedExecution.contextId,
          preparedExecution.saveUserMessage,
          result
        );
      }

      await this.onExecutionEnd?.(buildSuccessExecutionEvent(preparedExecution, result));

      if (result.output !== undefined || result.rawText !== rawText) {
        await options.onEvent({
          type: "output",
          data: {
            output: result.output ?? result.rawText
          }
        });
      }

      await options.onEvent({
        type: "end",
        data: {
          finishReason: result.finishReason,
          latencyMs: Date.now() - preparedExecution.startedAt,
          contextId: preparedExecution.contextId
        }
      });
    } catch (error) {
      const lightwayError = toLightwayError(error);

      if (!isExecutionAuditSinkFailure(lightwayError)) {
        try {
          await this.onExecutionEnd?.(
            buildFailureExecutionEvent(
              request,
              requestId,
              startedAt,
              lightwayError,
              prepared,
              result
            )
          );
        } catch {
          // Preserve the original stream failure when failure audit logging also fails.
        }
      }

      await options.onEvent({
        type: "error",
        data: {
          code: lightwayError.code,
          message: lightwayError.message,
          details: lightwayError.details
        }
      });
    }
  }
}

export function createExecuteOrchestrator(
  options: CreateExecuteOrchestratorOptions
): ExecuteOrchestrator {
  return new ExecuteOrchestratorImpl(options);
}
