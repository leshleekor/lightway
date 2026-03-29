# Pre-Processor 가이드

## 개요

Pre-Processor는 Provider 호출 전에 요청 컨텍스트를 가공하는 컴포넌트입니다.

이 모노레포에서 새 Pre-Processor를 추가하려면 보통 아래 순서가 필요합니다.

1. 워크스페이스 패키지 생성
2. `Preprocessor` 계약 구현
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
  preprocess-custom/
    package.json
    src/
      index.ts
```

최소 `package.json`:

```json
{
  "name": "@lightway/preprocess-custom",
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

## 2. Pre-Processor 구현

최소 구현 패턴:

```ts
import type { LightwayContext, Preprocessor } from "@lightway/core";

export class NormalizeInputPreprocessor implements Preprocessor {
  readonly name = "normalize-input";

  async run(context: LightwayContext): Promise<LightwayContext> {
    const normalizedInput =
      typeof context.input === "string" ? context.input.trim() : context.input;

    return {
      ...context,
      input: normalizedInput
    };
  }
}
```

참고:

- `name`은 Definition의 `preprocess` 배열에서 쓰는 식별자입니다
- `context.input`을 바꾸면 `context.messages`도 같이 맞춰야 하는 경우가 많습니다
- Definition별 설정은 `context.definition.preprocessConfig`에서 읽을 수 있습니다

## 3. 워크스페이스에 연결

### `apps/gateway` dependency 추가

```json
{
  "dependencies": {
    "@lightway/preprocess-custom": "workspace:*"
  }
}
```

### 루트 path alias 추가

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/preprocess-custom": [
        "packages/preprocess-custom/src/index.ts"
      ]
    }
  }
}
```

### bootstrap 등록

[`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)에 등록합니다.

```ts
import { NormalizeInputPreprocessor } from "@lightway/preprocess-custom";

registry.registerPreprocessor(new NormalizeInputPreprocessor());
```

## 4. Definition에서 사용

Definition의 `preprocess` 배열에 이름을 추가합니다.

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

Definition별 설정이 필요하면 `preprocessConfig`를 씁니다.

```json
{
  "name": "customer-support",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["normalize-input"],
  "preprocessConfig": {
    "normalize-input": {
      "trim": true
    }
  }
}
```

## 5. 테스트와 패키지 문서 추가

권장 후속 작업:

- `tests/preprocess-custom.test.ts` 추가
- `context.input`, `context.messages`, `context.metadata` 변화 검증
- `preprocessConfig`를 쓴다면 설정 경로 테스트 추가
- 기대하는 설정 구조를 설명하는 패키지 README 추가

## 실무 팁

- 가능하면 기존 객체를 mutate하지 말고 새 context를 반환하세요.
- 등록되지 않은 preprocessor를 Definition이 참조하면 로딩 시 warning이 남고, 실제 실행 시 오류가 납니다.
- 현재 네이밍 규칙은 `preprocess-*`입니다. `plugin-preprocess-*` 예시는 쓰지 마십시오.
- 등록 후에는 `corepack pnpm validate`로 바로 확인하세요.

## 통합 체크리스트

- `packages/preprocess-*` 아래 패키지 생성 완료
- `package.json` 작성 완료
- `src/index.ts` export 완료
- `apps/gateway/package.json` 반영 완료
- 루트 `tsconfig.json` path alias 반영 완료
- `apps/gateway/src/app.ts` 등록 완료
- Definition `preprocess` 항목 추가 완료
- 테스트 추가 완료
- `corepack pnpm validate` 통과 확인

## 참고 구현

- 기본 전처리기: [`packages/preprocess-common/src/index.ts`](../packages/preprocess-common/src/index.ts)
- PII 마스킹: [`packages/preprocess-pii-masking/src/index.ts`](../packages/preprocess-pii-masking/src/index.ts)
