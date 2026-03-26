# Store 가이드

## 개요

Store는 대화 컨텍스트를 저장하고 다시 불러오는 컴포넌트입니다.
이 프로젝트에서는 `ContextStore` 인터페이스를 구현한 뒤 Registry에 등록해서 사용합니다.

Store는 아래 상황에서 사용됩니다.

- Definition 또는 요청에서 `context`가 `true`인 경우
- `executionOptions.contextStore`가 지정되었거나 기본 Store가 설정된 경우

Store가 없으면 컨텍스트 실행은 실패합니다.

## 구현해야 하는 인터페이스

```ts
import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStore,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

export class ExampleStore implements ContextStoreWithTtl {
  async get(
    contextId: string,
    options?: ContextLoadOptions
  ): Promise<LightwayMessage[]> {
    return [];
  }

  async append(contextId: string, messages: LightwayMessage[]): Promise<void> {}

  async create(): Promise<string> {
    return randomUUID();
  }

  async setTtl(contextId: string, ttlSeconds: number): Promise<void> {}
}
```

필수 메서드는 `get()`과 `append()`입니다.
`create()`와 `setTtl()`은 선택입니다.

## 각 메서드 역할

- `get(contextId, options)`: 저장된 메시지 목록을 반환합니다.
- `append(contextId, messages)`: 사용자/어시스턴트 메시지를 이어서 저장합니다.
- `create()`: 새 컨텍스트 ID를 직접 생성하고 싶을 때 구현합니다.
- `setTtl()`: `contextWindow.ttlSeconds`를 지원하려면 구현합니다.

`create()`를 구현하지 않아도 오케스트레이터가 UUID를 생성해 실행은 가능합니다.

## 구현 예시

아래 예시는 데이터베이스나 Redis 연결체를 감싼 Store 패턴입니다.

```ts
import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

export interface DatabaseClient {
  loadMessages(
    contextId: string,
    limit?: number
  ): Promise<LightwayMessage[]>;
  saveMessages(contextId: string, messages: LightwayMessage[]): Promise<void>;
  updateExpiry(contextId: string, expiresAt: Date): Promise<void>;
}

export class DatabaseContextStore implements ContextStoreWithTtl {
  constructor(private readonly client: DatabaseClient) {}

  async get(
    contextId: string,
    options?: ContextLoadOptions
  ): Promise<LightwayMessage[]> {
    return await this.client.loadMessages(contextId, options?.limit);
  }

  async append(contextId: string, messages: LightwayMessage[]): Promise<void> {
    await this.client.saveMessages(contextId, messages);
  }

  async create(): Promise<string> {
    return randomUUID();
  }

  async setTtl(contextId: string, ttlSeconds: number): Promise<void> {
    await this.client.updateExpiry(
      contextId,
      new Date(Date.now() + ttlSeconds * 1_000)
    );
  }
}
```

## Registry에 등록

Store 이름은 Definition에서 참조하는 값이므로 명확하게 정하는 편이 좋습니다.

```ts
import { createLightwayRegistry } from "@lightway/core";
import { DatabaseContextStore } from "@lightway/store-database";

const registry = createLightwayRegistry();

registry.registerContextStore("database", new DatabaseContextStore(client));
registry.setDefaultContextStore("database");
```

`setDefaultContextStore()`는 먼저 등록된 Store에만 사용할 수 있습니다.

## Definition에서 사용

Store는 `executionOptions.contextStore`로 선택합니다.

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
  "executionOptions": {
    "context": true,
    "contextStore": "database",
    "contextWindow": {
      "maxMessages": 20,
      "ttlSeconds": 86400
    }
  }
}
```

정의에 `contextStore`가 없으면 Registry의 기본 Store가 사용됩니다.

## 언제 사용하면 좋은가

- Redis로 대화 세션을 유지할 때
- PostgreSQL, MySQL, DynamoDB 같은 DB에 기록할 때
- 사용자별 TTL 정책이 필요할 때
- 여러 인스턴스에서 공유 가능한 컨텍스트 저장소가 필요할 때

## 구현 시 주의사항

- `get()`은 `options.limit`를 존중하는 편이 메모리 사용과 응답 시간에 유리합니다.
- 저장 포맷은 `LightwayMessage` 구조를 그대로 유지하는 것이 가장 단순합니다.
- 컨텍스트 저장 실패는 `CONTEXT_SAVE_FAILED`, 로드 실패는 `CONTEXT_LOAD_FAILED`로 이어질 수 있습니다.
- Definition이 존재하지 않는 Store를 참조하면 로딩 시 warning이 남고, 컨텍스트 실행 시에는 오류가 발생합니다.
- TTL을 쓰지 않는 저장소라면 `setTtl()`을 생략해도 됩니다.

## 참고 구현

- 메모리 Store: [`packages/context-memory/src/index.ts`](../packages/context-memory/src/index.ts)
- 등록 예시: [`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)
- Definition 예시: [`definitions/animal-pedia.json`](../definitions/animal-pedia.json)
