import AjvImport from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { JsonSchema, SchemaLike } from "./types.js";

const Ajv = AjvImport as unknown as new (options?: Record<string, unknown>) => {
  compile: (schema: object) => ValidateFunction;
  validateSchema: (schema: object) => boolean;
  errors?: ErrorObject[] | null;
};

const ajv = new Ajv({
  allErrors: true,
  strict: false
});

const validatorCache = new WeakMap<object, ValidateFunction>();

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; errors: string[] };

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isZodSchema<T>(schema: SchemaLike<T>): schema is {
  safeParse(input: unknown): { success: boolean; data?: T; error?: { issues: { message: string }[] } };
} {
  return isObject(schema) && typeof schema.safeParse === "function";
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return ["Schema validation failed"];
  }

  return errors.map((error) => {
    const path = error.instancePath || error.schemaPath || "/";
    return `${path}: ${error.message ?? "invalid value"}`;
  });
}

function getJsonSchemaValidator(schema: JsonSchema): ValidateFunction {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached;
  }

  const validator = ajv.compile(schema);
  validatorCache.set(schema, validator);
  return validator;
}

export function assertJsonSchema(schema: unknown, label: string): asserts schema is JsonSchema {
  if (!isObject(schema)) {
    throw new Error(`${label} must be a JSON object`);
  }

  const valid = ajv.validateSchema(schema);
  if (!valid) {
    const message = formatAjvErrors(ajv.errors).join(", ");
    throw new Error(`${label} is not a valid JSON schema: ${message}`);
  }
}

export function validateWithSchema<T>(
  schema: SchemaLike<T>,
  value: unknown
): ValidationResult<T> {
  if (isZodSchema(schema)) {
    const parsed = schema.safeParse(value);
    if (parsed.success) {
      return { success: true, data: parsed.data as T };
    }

    return {
      success: false,
      errors: (parsed.error?.issues ?? []).map((issue) => issue.message)
    };
  }

  const validator = getJsonSchemaValidator(schema);
  const valid = validator(value);
  if (!valid) {
    return { success: false, errors: formatAjvErrors(validator.errors) };
  }

  return { success: true, data: value as T };
}

export function schemaToPromptText(schema: SchemaLike<unknown>): string {
  if (isZodSchema(schema)) {
    return "Return JSON that satisfies the server-side validation schema.";
  }

  return JSON.stringify(schema, null, 2);
}
