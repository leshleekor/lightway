import {
  LightwayError,
  type LightwayContentPart,
  type LightwayContext,
  type LightwayMessage,
  type Preprocessor
} from "@lightway/core";

export type PiiMaskingMode = "full-masking" | "sample-masking";

export interface PiiMaskingDefinitionConfig {
  fieldNames: Record<string, PiiMaskingMode>;
}

export interface PiiMaskingSummary {
  fields: Record<string, number>;
}

interface NormalizedPiiMaskingConfig {
  fieldNames: Record<string, PiiMaskingMode>;
}

interface MaskingState {
  readonly config: NormalizedPiiMaskingConfig;
  readonly summary: PiiMaskingSummary;
}

interface MaskResult {
  value: unknown;
  masked: boolean;
}

const MASKING_MODES: PiiMaskingMode[] = ["full-masking", "sample-masking"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaskingMode(value: unknown): value is PiiMaskingMode {
  return value === "full-masking" || value === "sample-masking";
}

function serializeForMessage(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function parseStructuredJson(value: string): Record<string, unknown> | unknown[] | undefined {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) || isPlainObject(parsed)) {
      return parsed;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function getFieldToken(fieldName: string): string {
  return `[${fieldName}]`;
}

function createSummary(fieldNames: Record<string, PiiMaskingMode>): PiiMaskingSummary {
  return {
    fields: Object.fromEntries(
      Object.keys(fieldNames).map((fieldName) => [fieldName, 0])
    )
  };
}

function maskStringLeaf(
  value: string,
  fieldName: string,
  mode: PiiMaskingMode
): MaskResult {
  const token = getFieldToken(fieldName);
  if (value === token) {
    return {
      value,
      masked: false
    };
  }

  if (mode === "full-masking") {
    return {
      value: token,
      masked: true
    };
  }

  const maskedValue = sampleMaskString(value);
  return {
    value: maskedValue,
    masked: maskedValue !== value
  };
}

function maskMatchedFieldValue(
  value: unknown,
  fieldName: string,
  mode: PiiMaskingMode
): MaskResult {
  if (typeof value === "string") {
    return maskStringLeaf(value, fieldName, mode);
  }

  if (Array.isArray(value)) {
    let masked = false;
    const next = value.map((item) => {
      const result = maskMatchedFieldValue(item, fieldName, mode);
      masked ||= result.masked;
      return result.value;
    });

    return {
      value: next,
      masked
    };
  }

  if (isPlainObject(value)) {
    let masked = false;
    const next = Object.fromEntries(
      Object.entries(value).map(([key, current]) => {
        const result = maskMatchedFieldValue(current, fieldName, mode);
        masked ||= result.masked;
        return [key, result.value];
      })
    );

    return {
      value: next,
      masked
    };
  }

  return {
    value,
    masked: false
  };
}

function maskStructuredValue(value: unknown, state: MaskingState): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskStructuredValue(item, state));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => {
        const mode = state.config.fieldNames[key];
        if (mode) {
          const result = maskMatchedFieldValue(current, key, mode);
          if (result.masked) {
            state.summary.fields[key] = (state.summary.fields[key] ?? 0) + 1;
          }

          return [key, result.value];
        }

        return [key, maskStructuredValue(current, state)];
      })
    );
  }

  return value;
}

function maskMessageString(value: string, state: MaskingState): string {
  const structured = parseStructuredJson(value);
  if (structured === undefined) {
    return value;
  }

  return JSON.stringify(maskStructuredValue(structured, state), null, 2);
}

function maskContentPart(
  part: LightwayContentPart,
  state: MaskingState
): LightwayContentPart {
  if (part.type === "json") {
    return {
      ...part,
      data: maskStructuredValue(part.data, state)
    };
  }

  if (part.type === "text") {
    return {
      ...part,
      text:
        part.text === undefined ? part.text : maskMessageString(part.text, state)
    };
  }

  return part;
}

function maskMessageContent(
  content: LightwayMessage["content"],
  state: MaskingState
): LightwayMessage["content"] {
  if (typeof content === "string") {
    return maskMessageString(content, state);
  }

  return content.map((part) => maskContentPart(part, state));
}

function shouldSkipMessage(message: LightwayMessage): boolean {
  return message.role === "system" || message.metadata?.source === "rag";
}

function normalizeConfig(
  context: LightwayContext,
  preprocessorName: string
): NormalizedPiiMaskingConfig {
  const rawConfig = context.definition.preprocessConfig?.[preprocessorName];

  if (rawConfig === undefined) {
    throw new LightwayError(
      "PREPROCESS_FAILED",
      "pii-masking definition config is required"
    );
  }

  if (!isPlainObject(rawConfig)) {
    throw new LightwayError(
      "PREPROCESS_FAILED",
      "pii-masking definition config must be an object"
    );
  }

  if (!isPlainObject(rawConfig.fieldNames)) {
    throw new LightwayError(
      "PREPROCESS_FAILED",
      "pii-masking config fieldNames must be a non-empty object"
    );
  }

  const fieldNames = Object.entries(rawConfig.fieldNames);
  if (fieldNames.length === 0) {
    throw new LightwayError(
      "PREPROCESS_FAILED",
      "pii-masking config fieldNames must be a non-empty object"
    );
  }

  const normalizedFieldNames: Record<string, PiiMaskingMode> = {};
  for (const [fieldName, mode] of fieldNames) {
    if (fieldName.trim().length === 0) {
      throw new LightwayError(
        "PREPROCESS_FAILED",
        "pii-masking config fieldNames must not contain empty keys"
      );
    }

    if (!isMaskingMode(mode)) {
      throw new LightwayError(
        "PREPROCESS_FAILED",
        `pii-masking config fieldNames.${fieldName} must be one of: ${MASKING_MODES.join(", ")}`
      );
    }

    normalizedFieldNames[fieldName] = mode;
  }

  return {
    fieldNames: normalizedFieldNames
  };
}

export class PiiMaskingPreprocessor implements Preprocessor {
  readonly name = "pii-masking";

  async run(context: LightwayContext): Promise<LightwayContext> {
    const config = normalizeConfig(context, this.name);
    const state: MaskingState = {
      config,
      summary: createSummary(config.fieldNames)
    };

    const maskedInput = maskStructuredValue(context.input, state);
    const rewriteTargetIndex = findLatestNonRagUserMessageIndex(context.messages);
    const nextMessages = context.messages.map((message, index) => {
      if (index === rewriteTargetIndex) {
        return {
          ...message,
          content: serializeForMessage(maskedInput)
        };
      }

      if (shouldSkipMessage(message)) {
        return message;
      }

      return {
        ...message,
        content: maskMessageContent(message.content, state)
      };
    });

    return {
      ...context,
      input: maskedInput,
      messages: nextMessages,
      metadata: {
        ...context.metadata,
        piiMaskedBy: this.name,
        piiMaskingSummary: state.summary
      }
    };
  }
}

function findLatestNonRagUserMessageIndex(messages: LightwayMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role === "user" && message.metadata?.source !== "rag") {
      return index;
    }
  }

  return -1;
}

function sampleMaskString(value: string): string {
  const runs = splitRuns(value);
  return runs
    .map((run) => {
      if (run.type === "separator") {
        return run.value;
      }

      if (/^\p{Decimal_Number}+$/u.test(run.value)) {
        return "*".repeat(Array.from(run.value).length);
      }

      return maskCharacterRun(run.value);
    })
    .join("");
}

function splitRuns(value: string): Array<{ type: "separator" | "character"; value: string }> {
  const runs: Array<{ type: "separator" | "character"; value: string }> = [];

  for (const char of Array.from(value)) {
    const nextType = isSeparatorCharacter(char) ? "separator" : "character";
    const lastRun = runs.at(-1);
    if (lastRun && lastRun.type === nextType) {
      lastRun.value += char;
      continue;
    }

    runs.push({
      type: nextType,
      value: char
    });
  }

  return runs;
}

function isSeparatorCharacter(char: string): boolean {
  return !/[\p{Letter}\p{Number}]/u.test(char);
}

function maskCharacterRun(run: string): string {
  const codePoints = Array.from(run);
  const length = codePoints.length;
  if (length === 0) {
    return run;
  }

  if (length <= 2) {
    return "*".repeat(length);
  }

  if (length <= 4) {
    return `${codePoints[0] ?? ""}${"*".repeat(length - 1)}`;
  }

  return `${codePoints.slice(0, 2).join("")}${"*".repeat(length - 2)}`;
}
