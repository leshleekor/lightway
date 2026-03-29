# Post-Processor 가이드

## 개요

Post-Processor는 Provider 응답 이후, 최종 API 응답으로 내보내기 전에 결과를 가공하는 컴포넌트입니다.

이 모노레포에서 보통 필요한 통합 순서는 아래와 같습니다.

1. 워크스페이스 패키지 생성
2. `Postprocessor` 계약 구현
3. `src/index.ts` export 추가
4. `apps/gateway` dependency 추가
5. 루트 `tsconfig.json` path alias 추가
6. bootstrap 등록
7. Definition에서 참조
8. 테스트 추가 후 `corepack pnpm validate` 실행

## 1. 워크스페이스 패키지 생성

권장 구조:

```text
packages/
  postprocess-custom/
    package.json
    src/
      index.ts
```

최소 `package.json`:

```json
{
  "name": "@lightway/postprocess-custom",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@lightway/core": "workspace:*"
  }
}
```

## 2. Post-Processor 구현

최소 구현 패턴:

```ts
import type { LightwayContext, LightwayResult, Postprocessor } from "@lightway/core";

export class CleanOutputPostprocessor implements Postprocessor {
  readonly name = "clean-output";

  async run(
    result: LightwayResult,
    context: LightwayContext
  ): Promise<LightwayResult> {
    return {
      ...result,
      rawText: result.rawText.trim(),
      metadata: {
        ...result.metadata,
        postprocessedBy: this.name,
        requestId: context.requestId
      }
    };
  }
}
```

참고:

- `name`은 Definition의 `postprocess` 배열에서 쓰는 식별자입니다
- 구조화 출력에서는 `result.output` 수정도 함께 관리해야 합니다
- Post-Processor는 컨텍스트 저장 전에 실행됩니다

## 3. 워크스페이스에 연결

### `apps/gateway` dependency 추가

```json
{
  "dependencies": {
    "@lightway/postprocess-custom": "workspace:*"
  }
}
```

### 루트 path alias 추가

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/postprocess-custom": [
        "packages/postprocess-custom/src/index.ts"
      ]
    }
  }
}
```

### bootstrap 등록

```ts
import { CleanOutputPostprocessor } from "@lightway/postprocess-custom";

registry.registerPostprocessor(new CleanOutputPostprocessor());
```

## 4. Definition에서 사용

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

Definition별 설정이 필요하면 `postprocessConfig`를 씁니다.

```json
{
  "name": "custom-chat",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": { "type": "string" },
  "postprocess": ["clean-output"],
  "postprocessConfig": {
    "clean-output": {
      "trim": true
    }
  }
}
```

## 5. 테스트와 패키지 문서 추가

권장 후속 작업:

- `tests/postprocess-custom.test.ts` 추가
- `rawText`, `output`, `metadata` 변화 검증
- 패키지 설정과 부작용을 설명하는 README 추가

## 실무 팁

- 일반 텍스트 응답에서는 `rawText` 기준으로 다루는 편이 안전합니다.
- 구조화 출력 Definition에서는 `result.output`과 실제 응답 계약이 어긋나지 않게 유지하세요.
- 현재 네이밍 규칙은 `postprocess-*`입니다. `plugin-postprocess-*` 예시는 쓰지 마십시오.
- 등록 후에는 `corepack pnpm validate`로 확인하세요.

## 통합 체크리스트

- `packages/postprocess-*` 아래 패키지 생성 완료
- `package.json` 작성 완료
- `src/index.ts` export 완료
- `apps/gateway/package.json` 반영 완료
- 루트 `tsconfig.json` path alias 반영 완료
- `apps/gateway/src/app.ts` 등록 완료
- Definition `postprocess` 항목 추가 완료
- 테스트 추가 완료
- `corepack pnpm validate` 통과 확인

## 참고 구현

- 기본 후처리기: [`packages/postprocess-common/src/index.ts`](../packages/postprocess-common/src/index.ts)
- 감사 로그: [`packages/postprocess-audit-log/src/index.ts`](../packages/postprocess-audit-log/src/index.ts)
