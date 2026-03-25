import type { LightwayContext, LightwayResult, Postprocessor } from "@lightway/core";

function trimDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => trimDeep(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, trimDeep(current)])
    );
  }

  return value;
}

export class TrimTextOutputPostprocessor implements Postprocessor {
  readonly name = "trim-text-output";

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    return {
      ...result,
      rawText: result.rawText.trim(),
      output: trimDeep(result.output),
      metadata: {
        ...result.metadata,
        postprocessedBy: this.name,
        requestId: context.requestId
      }
    };
  }
}
