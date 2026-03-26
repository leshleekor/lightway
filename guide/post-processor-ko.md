# Post-Processor 가이드

## 개요

Post-Processor는 Provider 응답을 받은 뒤 최종 응답으로 내보내기 전에 결과를 가공하는 컴포넌트입니다.
실행 순서는 다음과 같습니다.

1. Provider 응답 수신
2. 필요 시 구조화 출력 검증 및 보정
3. Post-Processor 실행
4. 컨텍스트 저장
5. API 응답 반환

즉, 응답 정리, 민감 정보 제거, 메타데이터 보강 같은 후처리에 적합합니다.

## 구현해야 하는 인터페이스

```ts
import type { LightwayContext, LightwayResult, Postprocessor } from "@lightway/core";

export class ExamplePostprocessor implements Postprocessor {
  readonly name = "example-postprocessor";

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    return result;
  }
}
```

## 구현 예시

아래 예시는 출력 문자열을 정리하고 메타데이터를 추가하는 패턴입니다.

```ts
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

export class CleanOutputPostprocessor implements Postprocessor {
  readonly name = "clean-output";

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
```

## Registry에 등록

```ts
import { createLightwayRegistry } from "@lightway/core";
import { CleanOutputPostprocessor } from "@lightway/plugin-postprocess-custom";

const registry = createLightwayRegistry();

registry.registerPostprocessor(new CleanOutputPostprocessor());
```

기본 등록 예시는 [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)에서 확인할 수 있습니다.

## Definition에서 사용

Definition JSON의 `postprocess` 배열에 이름을 추가하면 순서대로 실행됩니다.

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
  "postprocess": ["clean-output", "trim-text-output"]
}
```

## 언제 사용하면 좋은가

- 응답 문자열 정리
- JSON 출력 후 필드 후가공
- 민감 정보 제거
- 사용량, 추적 정보 등 메타데이터 추가
- 제품 응답 형식에 맞는 최종 결과 보정

## 구현 시 주의사항

- 구조화 출력 정의에서는 `result.output`이 최종 응답에 직접 사용될 수 있으므로 함께 관리하세요.
- 일반 텍스트 응답에서는 `result.output`이 없을 수 있으므로 `rawText` 기준 처리도 고려해야 합니다.
- Post-Processor는 컨텍스트 저장 전에 실행되므로, 수정한 결과가 저장본에도 반영됩니다.
- 등록되지 않은 이름이 Definition에 들어가면 로딩 시 warning이 남고, 실제 실행 시에는 오류가 발생합니다.

## 참고 구현

- 기본 구현: [`packages/postprocess-common/src/index.ts`](../packages/postprocess-common/src/index.ts)
- 등록 예시: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
