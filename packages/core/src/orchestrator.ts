import { randomUUID } from "node:crypto";
import { LightwayError, isLightwayError } from "./errors.js";
import { schemaToPromptText, validateWithSchema } from "./schema.js";
import type {
  AIDefinition,
  ContextStore,
  ContextStoreWithTtl,
  DefinitionRegistry,
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
  defaultTimeoutMs: number
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
      ...(request.metadata ?? {})
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
    startedAt: Date.now()
  };
}

class ExecuteOrchestratorImpl implements ExecuteOrchestrator {
  private readonly registry: LightwayRegistry;
  private readonly definitionRegistry: DefinitionRegistry;
  private readonly defaultTimeoutMs: number;

  constructor(options: CreateExecuteOrchestratorOptions) {
    this.registry = options.registry;
    this.definitionRegistry = options.definitionRegistry;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
  }

  async execute(
    request: ExecuteRequest,
    options?: { requestId?: string }
  ): Promise<ExecuteResponse> {
    const prepared = await prepareExecution(
      this.registry,
      this.definitionRegistry,
      request,
      options?.requestId ?? randomUUID(),
      this.defaultTimeoutMs
    );

    if (prepared.effective.stream) {
      throw new LightwayError(
        "UNSUPPORTED_FEATURE",
        "Use the streaming API path for stream=true requests"
      );
    }

    let response: ProviderResponse & { output?: unknown };

    if (prepared.effective.structuredOutput && prepared.definition.outputSchema) {
      response = await resolveStructuredResponse(
        prepared.provider,
        prepared.providerRequest,
        prepared.effective.timeoutMs,
        prepared.definition.outputSchema
      );
    } else {
      try {
        response = await withProviderTimeout(prepared.effective.timeoutMs, (signal) =>
          prepared.provider.generate({
            ...prepared.providerRequest,
            abortSignal: signal
          })
        );
      } catch (error) {
        normalizeProviderError(error);
      }
    }

    let result: LightwayResult = {
      rawText: response.rawText,
      output: response.output,
      provider: prepared.provider.name,
      model: prepared.definition.model,
      finishReason: response.finishReason,
      usage: response.usage,
      metadata: response.metadata
    };

    result = await runPostprocessors(
      this.registry,
      prepared.definition,
      result,
      prepared.context
    );

    if (prepared.contextEnabled && prepared.contextStore && prepared.contextId) {
      await saveContextMessages(
        prepared.contextStore,
        prepared.contextId,
        prepared.saveUserMessage,
        result
      );
    }

    return {
      requestId: prepared.requestId,
      definitionName: prepared.definition.name,
      contextId: prepared.contextId,
      provider: prepared.provider.name,
      model: prepared.definition.model,
      output:
        prepared.effective.structuredOutput
          ? result.output
          : (result.output ?? result.rawText),
      usage: result.usage,
      latencyMs: Date.now() - prepared.startedAt
    };
  }

  async stream(
    request: ExecuteRequest,
    options: {
      requestId?: string;
      onEvent: (event: GatewayStreamEvent) => Promise<void> | void;
    }
  ): Promise<void> {
    try {
      const prepared = await prepareExecution(
        this.registry,
        this.definitionRegistry,
        request,
        options.requestId ?? randomUUID(),
        this.defaultTimeoutMs
      );

      await options.onEvent({
        type: "start",
        data: {
          requestId: prepared.requestId,
          definitionName: prepared.definition.name,
          contextId: prepared.contextId,
          provider: prepared.provider.name,
          model: prepared.definition.model
        }
      });

      if (prepared.effective.structuredOutput && prepared.definition.outputSchema) {
        const response = await resolveStructuredResponse(
          prepared.provider,
          prepared.providerRequest,
          prepared.effective.timeoutMs,
          prepared.definition.outputSchema
        );

        let result: LightwayResult = {
          rawText: response.rawText,
          output: response.output,
          provider: prepared.provider.name,
          model: prepared.definition.model,
          finishReason: response.finishReason,
          usage: response.usage,
          metadata: response.metadata
        };

        result = await runPostprocessors(
          this.registry,
          prepared.definition,
          result,
          prepared.context
        );

        if (result.usage) {
          await options.onEvent({
            type: "usage",
            data: result.usage
          });
        }

        if (prepared.contextEnabled && prepared.contextStore && prepared.contextId) {
          await saveContextMessages(
            prepared.contextStore,
            prepared.contextId,
            prepared.saveUserMessage,
            result
          );
        }

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
            latencyMs: Date.now() - prepared.startedAt,
            contextId: prepared.contextId
          }
        });
        return;
      }

      if (!prepared.provider.stream || !prepared.provider.supports("streaming")) {
        throw new LightwayError(
          "PROVIDER_CAPABILITY_NOT_SUPPORTED",
          "Provider does not support streaming",
          { provider: prepared.provider.name }
        );
      }

      let rawText = "";
      let usage: LightwayResult["usage"];
      let finishReason: string | undefined;

      try {
        await withProviderTimeout(prepared.effective.timeoutMs, (signal) =>
          prepared.provider.stream!(
            {
              ...prepared.providerRequest,
              abortSignal: signal
            },
            async (event) => {
              if (event.type === "delta") {
                rawText += event.text;
                await options.onEvent({
                  type: "delta",
                  data: {
                    text: event.text
                  }
                });
                return;
              }

              if (event.type === "usage") {
                usage = event.usage;
                await options.onEvent({
                  type: "usage",
                  data: event.usage
                });
                return;
              }

              if (event.type === "end") {
                finishReason = event.finishReason;
                return;
              }

              if (event.type === "error") {
                throw new LightwayError(
                  "PROVIDER_EXECUTION_FAILED",
                  event.error.message,
                  {
                    code: event.error.code
                  }
                );
              }
            }
          )
        );
      } catch (error) {
        normalizeProviderError(error);
      }

      let result: LightwayResult = {
        rawText,
        provider: prepared.provider.name,
        model: prepared.definition.model,
        finishReason,
        usage
      };

      result = await runPostprocessors(
        this.registry,
        prepared.definition,
        result,
        prepared.context
      );

      if (prepared.contextEnabled && prepared.contextStore && prepared.contextId) {
        await saveContextMessages(
          prepared.contextStore,
          prepared.contextId,
          prepared.saveUserMessage,
          result
        );
      }

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
          latencyMs: Date.now() - prepared.startedAt,
          contextId: prepared.contextId
        }
      });
    } catch (error) {
      const lightwayError = isLightwayError(error)
        ? error
        : new LightwayError("INTERNAL_ERROR", "Unexpected execution failure", {
            cause: error instanceof Error ? error.message : "unknown"
          });

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
