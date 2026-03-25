import type {
  AIDefinition,
  SanitizedAIDefinition,
  WarningDetail
} from "./types.js";

export function sanitizeDefinition(
  definition: AIDefinition,
  warnings?: WarningDetail[]
): SanitizedAIDefinition {
  const sanitized: SanitizedAIDefinition = {
    name: definition.name,
    description: definition.description,
    provider: definition.provider,
    model: definition.model,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    preprocess: definition.preprocess,
    postprocess: definition.postprocess,
    rag: definition.rag,
    executionOptions: definition.executionOptions
  };

  if (warnings && warnings.length > 0) {
    sanitized.warnings = warnings;
  }

  return sanitized;
}
