# Pre-Processor 가이드

## 개요

Pre-Processor는 Provider 호출 전에 요청 컨텍스트를 가공하는 컴포넌트입니다.
실행 순서는 다음과 같습니다.

1. 입력 검증
2. 컨텍스트 로드
3. Pre-Processor 실행
4. RAG 실행
5. Provider 호출

즉, Pre-Processor는 사용자 입력, 메시지 목록, 메타데이터를 정리하거나 보강하는 역할에 적합합니다.

## 구현해야 하는 인터페이스

```ts
import type { LightwayContext, Preprocessor } from "@lightway/core";

export class ExamplePreprocessor implements Preprocessor {
  readonly name = "example-preprocessor";

  async run(context: LightwayContext): Promise<LightwayContext> {
    return context;
  }
}
```

`name`은 Definition의 `preprocess` 배열에서 참조하는 식별자입니다.

Definition별 설정이 필요하다면 `context.definition.preprocessConfig?.[preprocessorName]`에서 읽을 수 있습니다.

## 구현 예시

아래 예시는 문자열 입력을 정규화하고, 마지막 사용자 메시지도 함께 맞춰 주는 형태입니다.

```ts
import type { LightwayContext, Preprocessor } from "@lightway/core";

function normalizeInput(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ");
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeInput(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, normalizeInput(current)])
    );
  }

  return value;
}

export class NormalizeInputPreprocessor implements Preprocessor {
  readonly name = "normalize-input";

  async run(context: LightwayContext): Promise<LightwayContext> {
    const normalizedInput = normalizeInput(context.input);
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
            typeof normalizedInput === "string"
              ? normalizedInput
              : JSON.stringify(normalizedInput, null, 2)
        };
        break;
      }
    }

    return {
      ...context,
      input: normalizedInput,
      messages: nextMessages,
      metadata: {
        ...context.metadata,
        normalizedBy: this.name
      }
    };
  }
}
```

## Registry에 등록

부팅 시 Pre-Processor를 등록합니다.

```ts
import { createLightwayRegistry } from "@lightway/core";
import { NormalizeInputPreprocessor } from "@lightway/plugin-preprocess-custom";

const registry = createLightwayRegistry();

registry.registerPreprocessor(new NormalizeInputPreprocessor());
```

현재 기본 등록 예시는 [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)에 있습니다.

## Definition에서 사용

Definition JSON의 `preprocess` 배열에 이름을 추가하면 순서대로 실행됩니다.

```json
{
  "name": "custom-chat",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  },
  "preprocess": ["normalize-input", "trim-string-input"]
}
```

배열 순서가 그대로 실행 순서입니다.

Definition별 설정은 `preprocessConfig`로 함께 전달할 수 있습니다.

```json
{
  "name": "customer-support",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "customerName": { "type": "string" }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["pii-masking"],
  "preprocessConfig": {
    "pii-masking": {
      "fieldNames": {
        "customerName": "full-masking",
        "deliveryAddress": "sample-masking"
      }
    }
  }
}
```

## 언제 사용하면 좋은가

- 입력 문자열 정리
- 민감 정보 마스킹
- 공통 메타데이터 주입
- 입력 객체를 내부 표준 형식으로 변환
- RAG 이전에 쿼리 문장을 정제

## 구현 시 주의사항

- 가능하면 기존 `context`를 직접 변경하지 말고 새 객체를 반환하세요.
- `context.input`을 바꿨다면 Provider에 전달될 `context.messages`도 같이 맞추는 것이 안전합니다.
- Definition별 동작 차이가 있다면 기대하는 `preprocessConfig` 구조를 문서화하는 편이 좋습니다.
- 예외가 발생하면 오케스트레이터가 `PREPROCESS_FAILED`로 감싸서 처리합니다.
- 등록되지 않은 이름이 Definition에 들어가면 로딩 시 warning이 남고, 실제 실행 시에는 오류가 발생합니다.

## 참고 구현

- 기본 구현: [`packages/preprocess-common/src/index.ts`](../packages/preprocess-common/src/index.ts)
- 개인정보 마스킹 예시: [`packages/preprocess-pii-masking/src/index.ts`](../packages/preprocess-pii-masking/src/index.ts)
- 등록 예시: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
