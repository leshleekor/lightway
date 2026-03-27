# @lightway/store-in-memory

`@lightway/store-in-memory`는 Lightway의 `ContextStore` 계약을 메모리 기반으로 구현한 패키지입니다. 로컬 개발, 테스트, 단일 프로세스 데모에 적합합니다.

## 제공 기능

- 메모리 기반 대화 히스토리 저장
- 새 `contextId` 생성
- 메시지 append/get
- TTL 설정과 주기적 만료 정리

## 주요 Export

```ts
import { InMemoryContextStore } from "@lightway/store-in-memory";
```

## 기본 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { InMemoryContextStore } from "@lightway/store-in-memory";

const registry = createLightwayRegistry();

registry.registerContextStore("memory", new InMemoryContextStore());
registry.setDefaultContextStore("memory");
```

Definition에서 특정 Store를 지정하려면:

```json
{
  "name": "chat-with-memory",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful assistant.",
  "inputSchema": { "type": "string" },
  "executionOptions": {
    "context": true,
    "contextStore": "memory"
  }
}
```

## `InMemoryContextStore`

생성자:

```ts
new InMemoryContextStore(cleanupIntervalMs);
```

옵션:

- `cleanupIntervalMs`
  - 만료된 context를 정리하는 주기
  - 기본값 `60_000`

메서드:

- `create()`
  - 새 `contextId`를 생성하고 빈 대화 저장소를 만듭니다.
- `get(contextId, options?)`
  - 저장된 메시지를 조회합니다.
  - `options.limit`이 있으면 최근 N개 메시지만 반환합니다.
- `append(contextId, messages)`
  - 기존 메시지 뒤에 추가합니다.
- `setTtl(contextId, ttlSeconds)`
  - 저장소 만료 시각을 설정합니다.

## 직접 사용 예시

```ts
const store = new InMemoryContextStore();

const contextId = await store.create();
await store.append(contextId, [
  {
    role: "user",
    content: "hello",
    timestamp: new Date().toISOString()
  }
]);

const messages = await store.get(contextId);
```

## 동작 특성

- 프로세스 메모리에만 저장됩니다.
- 서버 재시작 시 데이터가 사라집니다.
- 여러 인스턴스 간 공유 저장소가 아닙니다.
- TTL이 지난 항목은 조회 시 제거되거나 정리 주기에서 제거됩니다.

## 환경변수

이 패키지 자체는 환경변수를 사용하지 않습니다.

## 언제 이 패키지를 사용하나요?

- 로컬 개발
- 테스트 코드
- 단일 인스턴스 데모

실서비스용 공유 저장소가 필요하면 `store-*` 계열의 별도 패키지를 구현하는 것이 적합합니다.
