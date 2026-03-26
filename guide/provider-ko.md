# Provider 가이드

## 개요

Provider는 Lightway가 실제 AI 모델과 통신할 수 있게 해주는 어댑터입니다.
새 Provider를 추가하려면 `@lightway/core`의 `ModelProvider` 인터페이스를 구현하고, 애플리케이션 부팅 시 Registry에 등록해야 합니다.

이 프로젝트에서 Provider는 다음 순서로 사용됩니다.

1. Definition이 참조하는 `provider` 이름을 확인합니다.
2. Registry에서 같은 이름의 Provider를 찾습니다.
3. Orchestrator가 `generate()` 또는 `stream()`을 호출합니다.

`provider`가 등록되어 있지 않으면 Definition 로딩이 실패합니다.

## 구현해야 하는 인터페이스

핵심 계약은 [`packages/core/src/types.ts`](../packages/core/src/types.ts)에 정의되어 있습니다.

```ts
import type {
  ModelProvider,
  ProviderCapability,
  ProviderRequest,
  ProviderResponse,
  ProviderRuntimeStatus,
  ProviderStreamHandler
} from "@lightway/core";

export class ExampleProvider implements ModelProvider {
  readonly name = "example";

  supports(capability: ProviderCapability): boolean {
    return capability === "text-generation";
  }

  getStatus(): ProviderRuntimeStatus {
    return { status: "ready" };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    return {
      rawText: "hello"
    };
  }

  async stream(
    request: ProviderRequest,
    handler: ProviderStreamHandler
  ): Promise<void> {
    await handler({ type: "start" });
    await handler({ type: "delta", text: "hello" });
    await handler({ type: "end", finishReason: "stop" });
  }
}
```

## 권장 디렉터리 구조

기존 워크스페이스 구조에 맞추려면 새 Provider를 별도 패키지로 만드는 것이 가장 단순합니다.

```text
packages/
  provider-my-provider/
    package.json
    src/
      index.ts
```

패키지 이름 예시는 `@lightway/provider-my-provider`처럼 맞추면 일관성이 좋습니다.

## 구현 순서

### 1. 새 Provider 클래스 작성

아래 예시는 최소 구현 형태입니다.

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

export interface MyProviderOptions {
  apiKey?: string;
}

export class MyProvider implements ModelProvider {
  readonly name = "my-provider";
  private readonly apiKey?: string;

  constructor(options: MyProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.MY_PROVIDER_API_KEY;
  }

  supports(capability: ProviderCapability): boolean {
    return (
      capability === "text-generation" ||
      capability === "structured-output" ||
      capability === "streaming"
    );
  }

  getStatus(): ProviderRuntimeStatus {
    if (!this.apiKey) {
      return {
        status: "failed",
        issue: "MY_PROVIDER_API_KEY_MISSING"
      };
    }

    return {
      status: "ready"
    };
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new LightwayError(
        "PROVIDER_EXECUTION_FAILED",
        "Provider API key is not configured"
      );
    }

    return {
      rawText: "sample response",
      metadata: {
        requestId: request.requestId
      }
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

### 2. Capability를 정확히 선언

- `text-generation`: 기본 텍스트 생성
- `structured-output`: `outputSchema`가 있는 Definition 처리
- `streaming`: 스트리밍 응답 처리
- `tool-calling`: 현재 예약만 되어 있으며 실제 실행 경로는 아직 제공되지 않습니다.

`supports()`는 실제로 제공 가능한 기능만 `true`가 되어야 합니다.
예를 들어 `structured-output`을 지원하지 않는데 `true`를 반환하면 런타임 동작이 불명확해집니다.

### 3. 요청 필드를 반영

`ProviderRequest`에는 아래 값들이 들어옵니다.

- `model`: Definition에서 선택한 모델
- `systemPrompt`: RAG 결과가 병합된 최종 시스템 프롬프트
- `messages`: 전처리와 컨텍스트가 반영된 대화 목록
- `outputSchema`: 구조화 출력 검증에 사용할 스키마
- `generationOptions.temperature`, `generationOptions.maxTokens`
- `providerOptions`: Definition 별 Provider 전용 옵션
- `abortSignal`: 타임아웃이나 취소를 위한 시그널

Provider 구현은 가능하면 이 필드를 그대로 upstream API에 매핑하는 편이 좋습니다.

### 4. Registry에 등록

애플리케이션 부팅 코드에서 Provider를 등록합니다.
현재 예시는 [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)에 있습니다.

```ts
import { createLightwayRegistry } from "@lightway/core";
import { MyProvider } from "@lightway/provider-my-provider";

const registry = createLightwayRegistry();

registry.registerProvider(new MyProvider());
```

`name`이 중복되면 Registry가 예외를 던집니다.

### 5. Definition에서 사용

Definition JSON의 `provider` 필드가 등록된 Provider의 `name`과 정확히 같아야 합니다.

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

## 구현 팁

- `getStatus()`는 readiness 체크에 사용되므로, 필수 자격 증명 누락 여부를 분명하게 반환하는 편이 좋습니다.
- 스트리밍을 지원한다면 `stream()`에서도 `abortSignal`을 upstream 호출에 연결하세요.
- 구조화 출력을 지원한다면 JSON만 반환하도록 upstream 요청을 구성하는 것이 안전합니다.
- `ProviderResponse.rawText`는 항상 채우는 편이 좋습니다. 후처리와 저장 단계에서 공통적으로 사용됩니다.
- Provider별 예외는 가능하면 `LightwayError`로 변환해두면 진단이 쉬워집니다.

## 참고 구현

- OpenAI Provider: [`packages/provider-openai/src/index.ts`](../packages/provider-openai/src/index.ts)
- Bedrock Provider: [`packages/provider-bedrock/src/index.ts`](../packages/provider-bedrock/src/index.ts)
- Provider 등록 예시: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
