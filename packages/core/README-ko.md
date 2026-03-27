# @lightway/core

`@lightway/core`는 Lightway Boilerplate의 핵심 계약과 조립 API를 제공하는 패키지입니다. Provider, Preprocessor, Postprocessor, Store, RAG Retriever, Definition Loader, HTTP Gateway는 모두 이 패키지의 타입과 런타임 규칙을 기준으로 연결됩니다.

## 이 패키지가 제공하는 것

- Registry 조립 API
- Definition Registry 및 Definition 검증
- Execute Orchestrator
- 공통 타입과 에러 클래스
- Schema 검증 및 프롬프트 텍스트 변환 헬퍼
- 실행 종료 hook(`onExecutionEnd`) 계약

## 주요 Export

```ts
import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry,
  LightwayError
} from "@lightway/core";
```

자주 사용하는 타입:

- `AIDefinition`
- `LightwayContext`
- `LightwayResult`
- `ModelProvider`
- `Preprocessor`
- `Postprocessor`
- `ContextStore`
- `RagRetriever`
- `ExecutionHook`
- `GatewayStreamEvent`

## 기본 조립 예시

```ts
import { createDefinitionRegistry, createExecuteOrchestrator, createLightwayRegistry } from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());

const definitionRegistry = createDefinitionRegistry();
await definitionRegistry.load(
  new JsonDefinitionSource({ directory: "./definitions" }),
  registry
);

const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry
});
```

## Registry API

`createLightwayRegistry()`로 생성한 registry는 런타임 컴포넌트를 등록하고 조회합니다.

- `registerProvider(provider)`
- `registerPreprocessor(preprocessor)`
- `registerPostprocessor(postprocessor)`
- `registerRagRetriever(retriever)`
- `registerContextStore(name, store)`
- `setDefaultContextStore(name)`
- `getProvider(name)` / `getPreprocessor(name)` / `getPostprocessor(name)` / `getContextStore(name)`
- `listProviders()` / `listPreprocessors()` / `listPostprocessors()` / `listContextStores()`

중요한 동작:

- 같은 이름으로 중복 등록하면 `ConfigurationError`가 발생합니다.
- 기본 Context Store는 먼저 등록한 뒤 `setDefaultContextStore()`로 지정해야 합니다.

## Definition Registry

`createDefinitionRegistry()`는 Definition Source에서 읽은 정의를 검증하고 보관합니다.

주요 메서드:

- `load(source, registry)`
- `get(name)`
- `list()`
- `getWarnings(name)`
- `listWarnings()`

검증 항목 예시:

- `name`, `provider`, `model`, `systemPrompt` 존재 여부
- `inputSchema`, `outputSchema` 구조 유효성
- `preprocess`, `postprocess`, `rag`, `executionOptions` 형식
- 등록되지 않은 Provider 참조 여부

주의:

- Provider가 registry에 없으면 `load()` 단계에서 실패합니다.
- Preprocessor, Postprocessor, Store, RAG Retriever 누락은 warning으로 남습니다.

## Execute Orchestrator

`createExecuteOrchestrator()`는 Definition을 해석하고 실제 실행 파이프라인을 조립합니다.

```ts
const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry,
  defaultTimeoutMs: 30_000,
  onExecutionEnd: async (event) => {
    console.log(event.status, event.definitionName, event.requestId);
  }
});
```

옵션:

- `registry`: runtime component registry
- `definitionRegistry`: 로드된 definition registry
- `defaultTimeoutMs`: Definition/요청에 timeout이 없을 때 기본값
- `onExecutionEnd`: 성공/실패 실행 종료 시 호출되는 hook

주요 메서드:

- `execute(request, { requestId? })`
- `stream(request, { requestId?, onEvent })`

## 커스텀 컴포넌트 계약

Provider:

```ts
interface ModelProvider {
  name: string;
  supports(capability: ProviderCapability): boolean;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  stream?(request: ProviderRequest, handler: ProviderStreamHandler): Promise<void>;
  getStatus?(): ProviderRuntimeStatus;
}
```

Preprocessor:

```ts
interface Preprocessor {
  name: string;
  run(context: LightwayContext): Promise<LightwayContext>;
}
```

Postprocessor:

```ts
interface Postprocessor {
  name: string;
  run(result: LightwayResult, context: LightwayContext): Promise<LightwayResult>;
}
```

Store:

```ts
interface ContextStore {
  get(contextId: string, options?: { limit?: number }): Promise<LightwayMessage[]>;
  append(contextId: string, messages: LightwayMessage[]): Promise<void>;
  create?(): Promise<string>;
}
```

## 실행 Hook

감사 로그, 메트릭, 외부 추적 연동은 `ExecutionHook`으로 연결합니다.

```ts
type ExecutionHook = (event: ExecutionHookEvent) => Promise<void> | void;
```

`ExecutionHookEvent`에는 다음 정보가 포함됩니다.

- `requestId`
- `definitionName`
- `provider`, `model`
- `contextId`
- `status`
- `latencyMs`
- `finishReason`
- `usage`
- `rawText`, `output`
- `error`
- `metadata`

## 환경변수

이 패키지 자체는 필수 환경변수를 요구하지 않습니다.

## 언제 이 패키지를 직접 사용해야 하나요?

- 새 Provider/Store/Processor를 만들 때
- 자체 bootstrap 코드를 구성할 때
- 실행 hook, readiness, schema 검증 규칙을 재사용할 때
- HTTP 없이 다른 진입점(CLI, Worker, Queue Consumer)을 만들 때
