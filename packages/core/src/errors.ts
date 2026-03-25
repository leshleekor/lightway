export const ERROR_STATUS_CODE_MAP = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  REQUEST_TOO_LARGE: 413,
  DEFINITION_NOT_FOUND: 404,
  PROVIDER_CAPABILITY_NOT_SUPPORTED: 422,
  STRUCTURED_OUTPUT_VALIDATION_FAILED: 422,
  UNSUPPORTED_FEATURE: 422,
  PROVIDER_NOT_FOUND: 500,
  CONTEXT_STORE_NOT_FOUND: 500,
  PREPROCESSOR_NOT_FOUND: 500,
  POSTPROCESSOR_NOT_FOUND: 500,
  PREPROCESS_FAILED: 500,
  POSTPROCESS_FAILED: 500,
  RAG_RETRIEVER_NOT_FOUND: 500,
  CONTEXT_LOAD_FAILED: 500,
  CONTEXT_SAVE_FAILED: 500,
  INTERNAL_ERROR: 500,
  RAG_EXECUTION_FAILED: 502,
  PROVIDER_EXECUTION_FAILED: 502,
  PROVIDER_TIMEOUT: 504
} as const;

export type LightwayErrorCode = keyof typeof ERROR_STATUS_CODE_MAP;

export class LightwayError extends Error {
  readonly code: LightwayErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: LightwayErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LightwayError";
    this.code = code;
    this.statusCode = ERROR_STATUS_CODE_MAP[code];
    this.details = details;
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function isLightwayError(error: unknown): error is LightwayError {
  return error instanceof LightwayError;
}
