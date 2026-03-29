import { ConfigurationError } from "./errors.js";
import { assertJsonSchema } from "./schema.js";
import type {
  AIDefinition,
  DefinitionRegistry,
  DefinitionSource,
  LightwayRegistry,
  RagConfig,
  WarningDetail
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validatePositiveNumber(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (value !== undefined && (typeof value !== "number" || Number.isNaN(value) || value <= 0)) {
    errors.push(`${path} must be a positive number`);
  }
}

function validateNonNegativeNumber(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (value !== undefined && (typeof value !== "number" || Number.isNaN(value) || value < 0)) {
    errors.push(`${path} must be a non-negative number`);
  }
}

function validateTemperature(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 2)
  ) {
    errors.push(`${path} must be a number between 0 and 2`);
  }
}

function validateOptionalBoolean(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (value !== undefined && typeof value !== "boolean") {
    errors.push(`${path} must be a boolean`);
  }
}

function validateRagConfig(config: RagConfig, path: string, errors: string[]): void {
  if (!isNonEmptyString(config.name)) {
    errors.push(`${path}.name must be a non-empty string`);
  }

  if (!isNonEmptyString(config.retriever)) {
    errors.push(`${path}.retriever must be a non-empty string`);
  }

  if (!["vector", "sql", "http", "custom"].includes(config.sourceType)) {
    errors.push(`${path}.sourceType must be one of vector/sql/http/custom`);
  }

  if (
    config.injectAs !== undefined &&
    config.injectAs !== "system" &&
    config.injectAs !== "user-context"
  ) {
    errors.push(`${path}.injectAs must be system or user-context`);
  }

  if (
    config.dedupeStrategy !== undefined &&
    config.dedupeStrategy !== "id" &&
    config.dedupeStrategy !== "content" &&
    config.dedupeStrategy !== "none"
  ) {
    errors.push(`${path}.dedupeStrategy must be id, content, or none`);
  }

  validateNonNegativeNumber(config.priority, `${path}.priority`, errors);
  validatePositiveNumber(config.topK, `${path}.topK`, errors);

  if (
    config.promptTemplate !== undefined &&
    typeof config.promptTemplate !== "string"
  ) {
    errors.push(`${path}.promptTemplate must be a string`);
  }
}

function validatePluginConfigMap(
  value: unknown,
  path: string,
  declaredNames: string[] | undefined,
  declaredPath: "preprocess" | "postprocess",
  errors: string[]
): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const declared = new Set(declaredNames ?? []);

  for (const [key, entry] of Object.entries(value)) {
    if (!declared.has(key)) {
      errors.push(
        `${path}.${key} references a plugin that is not declared in ${declaredPath}`
      );
    }

    if (!isPlainObject(entry)) {
      errors.push(`${path}.${key} must be an object`);
    }
  }
}

function validateDefinitionStructure(definition: AIDefinition): void {
  const errors: string[] = [];

  if (!isNonEmptyString(definition.name)) {
    errors.push("name must be a non-empty string");
  }

  if (!isNonEmptyString(definition.provider)) {
    errors.push("provider must be a non-empty string");
  }

  if (!isNonEmptyString(definition.model)) {
    errors.push("model must be a non-empty string");
  }

  if (!isNonEmptyString(definition.systemPrompt)) {
    errors.push("systemPrompt must be a non-empty string");
  }

  if (definition.inputSchema === undefined) {
    errors.push("inputSchema is required");
  } else if (isRecord(definition.inputSchema) && typeof definition.inputSchema.safeParse !== "function") {
    try {
      assertJsonSchema(definition.inputSchema, "inputSchema");
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  if (
    definition.outputSchema !== undefined &&
    isRecord(definition.outputSchema) &&
    typeof definition.outputSchema.safeParse !== "function"
  ) {
    try {
      assertJsonSchema(definition.outputSchema, "outputSchema");
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  if (
    definition.preprocess !== undefined &&
    !isStringArray(definition.preprocess)
  ) {
    errors.push("preprocess must be an array of strings");
  }

  if (definition.preprocessConfig !== undefined) {
    validatePluginConfigMap(
      definition.preprocessConfig,
      "preprocessConfig",
      definition.preprocess,
      "preprocess",
      errors
    );
  }

  if (
    definition.postprocess !== undefined &&
    !isStringArray(definition.postprocess)
  ) {
    errors.push("postprocess must be an array of strings");
  }

  if (definition.postprocessConfig !== undefined) {
    validatePluginConfigMap(
      definition.postprocessConfig,
      "postprocessConfig",
      definition.postprocess,
      "postprocess",
      errors
    );
  }

  if (definition.rag !== undefined) {
    if (!Array.isArray(definition.rag)) {
      errors.push("rag must be an array");
    } else {
      definition.rag.forEach((config, index) => {
        if (!isRecord(config)) {
          errors.push(`rag[${index}] must be an object`);
          return;
        }

        validateRagConfig(config as RagConfig, `rag[${index}]`, errors);
      });
    }
  }

  if (definition.executionOptions !== undefined) {
    if (!isRecord(definition.executionOptions)) {
      errors.push("executionOptions must be an object");
    } else {
      validateOptionalBoolean(
        definition.executionOptions.context,
        "executionOptions.context",
        errors
      );
      validateOptionalBoolean(
        definition.executionOptions.structuredOutput,
        "executionOptions.structuredOutput",
        errors
      );
      validateOptionalBoolean(
        definition.executionOptions.stream,
        "executionOptions.stream",
        errors
      );

      if (
        definition.executionOptions.contextStore !== undefined &&
        !isNonEmptyString(definition.executionOptions.contextStore)
      ) {
        errors.push("executionOptions.contextStore must be a non-empty string");
      }

      validatePositiveNumber(
        definition.executionOptions.timeoutMs,
        "executionOptions.timeoutMs",
        errors
      );
      validateTemperature(
        definition.executionOptions.temperature,
        "executionOptions.temperature",
        errors
      );
      validatePositiveNumber(
        definition.executionOptions.maxTokens,
        "executionOptions.maxTokens",
        errors
      );

      if (definition.executionOptions.contextWindow !== undefined) {
        if (!isRecord(definition.executionOptions.contextWindow)) {
          errors.push("executionOptions.contextWindow must be an object");
        } else {
          validatePositiveNumber(
            definition.executionOptions.contextWindow.maxMessages,
            "executionOptions.contextWindow.maxMessages",
            errors
          );
          validatePositiveNumber(
            definition.executionOptions.contextWindow.maxTokens,
            "executionOptions.contextWindow.maxTokens",
            errors
          );
          validatePositiveNumber(
            definition.executionOptions.contextWindow.ttlSeconds,
            "executionOptions.contextWindow.ttlSeconds",
            errors
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigurationError(
      `Definition "${definition.name || "<unknown>"}" is invalid: ${errors.join("; ")}`
    );
  }
}

function collectWarnings(
  definition: AIDefinition,
  registry: LightwayRegistry
): WarningDetail[] {
  const warnings: WarningDetail[] = [];

  if (definition.executionOptions?.contextStore) {
    const target = definition.executionOptions.contextStore;
    if (!registry.getContextStore(target)) {
      warnings.push({
        code: "CONTEXT_STORE_NOT_FOUND",
        message: "Referenced context store is not registered",
        target
      });
    }
  }

  for (const name of definition.preprocess ?? []) {
    if (!registry.getPreprocessor(name)) {
      warnings.push({
        code: "PREPROCESSOR_NOT_FOUND",
        message: "Referenced preprocessor is not registered",
        target: name
      });
    }
  }

  for (const name of definition.postprocess ?? []) {
    if (!registry.getPostprocessor(name)) {
      warnings.push({
        code: "POSTPROCESSOR_NOT_FOUND",
        message: "Referenced postprocessor is not registered",
        target: name
      });
    }
  }

  for (const config of definition.rag ?? []) {
    if (!registry.getRagRetriever(config.retriever)) {
      warnings.push({
        code: "RAG_RETRIEVER_NOT_FOUND",
        message: "Referenced RAG retriever is not registered",
        target: config.retriever
      });
    }
  }

  return warnings;
}

class DefinitionRegistryImpl implements DefinitionRegistry {
  private readonly definitions = new Map<string, AIDefinition>();
  private readonly warnings = new Map<string, WarningDetail[]>();

  async load(source: DefinitionSource, registry: LightwayRegistry): Promise<void> {
    const definitions = await source.list();
    const nextDefinitions = new Map<string, AIDefinition>();
    const nextWarnings = new Map<string, WarningDetail[]>();

    for (const definition of definitions) {
      validateDefinitionStructure(definition);

      if (nextDefinitions.has(definition.name)) {
        throw new ConfigurationError(
          `DEFINITION_DUPLICATED: duplicate definition name "${definition.name}"`
        );
      }

      if (!registry.getProvider(definition.provider)) {
        throw new ConfigurationError(
          `Provider "${definition.provider}" referenced by definition "${definition.name}" is not registered`
        );
      }

      nextDefinitions.set(definition.name, definition);
      nextWarnings.set(definition.name, collectWarnings(definition, registry));
    }

    this.definitions.clear();
    this.warnings.clear();

    for (const [name, definition] of nextDefinitions.entries()) {
      this.definitions.set(name, definition);
      this.warnings.set(name, nextWarnings.get(name) ?? []);
    }
  }

  get(name: string): AIDefinition | undefined {
    return this.definitions.get(name);
  }

  getWarnings(name: string): WarningDetail[] {
    return this.warnings.get(name) ?? [];
  }

  list(): AIDefinition[] {
    return [...this.definitions.values()];
  }

  listWarnings() {
    return [...this.definitions.keys()].map((definitionName) => ({
      definitionName,
      warnings: this.getWarnings(definitionName)
    }));
  }
}

export function createDefinitionRegistry(): DefinitionRegistry {
  return new DefinitionRegistryImpl();
}
