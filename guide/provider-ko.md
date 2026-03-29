# Provider 가이드

## 개요

Provider는 Lightway가 실제 AI 모델 backend를 호출할 수 있게 해주는 어댑터입니다.

이 모노레포에서 새 Provider를 추가하려면 단순히 `ModelProvider` 구현만으로 끝나지 않습니다.

1. 워크스페이스 패키지 생성
2. Provider 클래스 구현
3. 패키지 entrypoint export
4. `apps/gateway` dependency 추가
5. 루트 `tsconfig.json` path alias 추가
6. bootstrap 등록
7. 최소 테스트 추가
8. `corepack pnpm validate` 실행

## 1. 워크스페이스 패키지 생성

권장 구조:

```text
packages/
  provider-my-provider/
    package.json
    src/
      index.ts
```

`pnpm-workspace.yaml`은 이미 `packages/*`를 포함하므로 별도 워크스페이스 설정은 필요 없습니다.

최소 `package.json` 예시:

```json
{
  "name": "@lightway/provider-my-provider",
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

## 2. Provider 구현

핵심 계약은 [`packages/core/src/types.ts`](../packages/core/src/types.ts)에 있습니다.

최소 구현 패턴:

```ts
import {
  LightwayError,
  type ModelProvider,
  type ProviderCapability,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderRuntimeStatus,
  type ProviderStreamHandler
} from "@lightway/core";

export class MyProvider implements ModelProvider {
  readonly name = "my-provider";

  supports(capability: ProviderCapability): boolean {
    return capability === "text-generation";
  }

  getStatus(): ProviderRuntimeStatus {
    return { status: "ready" };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.model) {
      throw new LightwayError("PROVIDER_EXECUTION_FAILED", "Model is missing");
    }

    return {
      rawText: "sample response"
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    await handler({ type: "start" });
    await handler({ type: "delta", text: "sample response" });
    await handler({ type: "end", finishReason: "stop" });
  }
}
```

Capability 참고:

- `text-generation`: 일반 텍스트 생성
- `structured-output`: `outputSchema`가 있는 Definition 처리
- `streaming`: 스트리밍 응답
- `tool-calling`: 향후 확장용 예약 기능

## 3. 워크스페이스에 연결

### `apps/gateway` dependency 추가

`apps/gateway/src/app.ts`에서 새 Provider 패키지를 import할 예정이라면 [`apps/gateway/package.json`](../apps/gateway/package.json)에 dependency를 추가해야 합니다.

```json
{
  "dependencies": {
    "@lightway/provider-my-provider": "workspace:*"
  }
}
```

### 루트 path alias 추가

앱과 테스트에서 일관된 import를 쓰려면 [`tsconfig.json`](../tsconfig.json)에 alias를 추가합니다.

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/provider-my-provider": [
        "packages/provider-my-provider/src/index.ts"
      ]
    }
  }
}
```

### bootstrap 등록

[`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)에 Provider를 등록합니다.

```ts
import { MyProvider } from "@lightway/provider-my-provider";

registry.registerProvider(new MyProvider());
```

## 4. Definition에서 사용

Definition의 `provider` 필드는 Provider 클래스의 `name`과 정확히 같아야 합니다.

```json
{
  "name": "custom-chat",
  "provider": "my-provider",
  "model": "my-model-v1",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  }
}
```

## 5. 테스트와 패키지 문서 추가

권장 후속 작업:

- `tests/provider-my-provider.test.ts` 추가
- `getStatus()`, `generate()`, `stream()` 동작 검증
- 구조화 출력이나 스트리밍을 지원한다면 capability 검증 추가
- 필수 환경변수와 upstream API 동작을 설명하는 패키지 README 추가

## 실무 팁

- `ProviderRequest` 필드는 가능하면 upstream API에 직접 매핑하는 편이 단순합니다.
- 지원한다면 `abortSignal`을 upstream 요청에 연결하세요.
- `ProviderResponse.rawText`는 가능하면 항상 채우는 편이 좋습니다.
- Provider별 예외는 가능하면 `LightwayError`로 변환해 두세요.
- 워크스페이스 연결 후에는 `corepack pnpm validate`로 바로 확인하세요.

## 통합 체크리스트

- `packages/` 아래 패키지 디렉터리 생성 완료
- `package.json`에 `@lightway/core: workspace:*` 추가 완료
- `src/index.ts`에서 Provider export 완료
- `apps/gateway/package.json` 반영 완료
- 루트 `tsconfig.json` path alias 반영 완료
- `apps/gateway/src/app.ts` bootstrap 등록 완료
- Definition에서 올바른 `provider` 이름 사용 확인
- 테스트 추가 완료
- `corepack pnpm validate` 통과 확인

## 참고 구현

- OpenAI Provider: [`packages/provider-openai/src/index.ts`](../packages/provider-openai/src/index.ts)
- Bedrock Provider: [`packages/provider-bedrock/src/index.ts`](../packages/provider-bedrock/src/index.ts)
- Claude Provider: [`packages/provider-claude/src/index.ts`](../packages/provider-claude/src/index.ts)
