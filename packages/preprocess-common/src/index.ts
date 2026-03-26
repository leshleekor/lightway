import type { LightwayContext, Preprocessor } from "@lightway/core";

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

export class TrimStringInputPreprocessor implements Preprocessor {
  readonly name = "trim-string-input";

  async run(context: LightwayContext): Promise<LightwayContext> {
    const trimmedInput = trimDeep(context.input);
    const nextMessages = [...context.messages];
    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      const message = nextMessages[index];
      if (!message) {
        continue;
      }

      if (message.role === "user" && message.metadata?.source !== "rag") {
        nextMessages[index] = {
          ...message,
          content:
            typeof trimmedInput === "string"
              ? trimmedInput
              : JSON.stringify(trimmedInput, null, 2)
        };
        break;
      }
    }

    return {
      ...context,
      input: trimmedInput,
      messages: nextMessages,
      metadata: {
        ...context.metadata,
        preprocessedBy: this.name
      }
    };
  }
}
