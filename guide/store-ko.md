# Store 가이드

## 개요

Store는 대화 컨텍스트를 저장하고 다시 불러오는 컴포넌트입니다.

이 모노레포에서 커스텀 Store를 추가하려면 보통 아래 순서가 필요합니다.

1. 워크스페이스 패키지 생성
2. `ContextStore` 또는 `ContextStoreWithTtl` 구현
3. `src/index.ts` export 추가
4. `apps/gateway` dependency 추가
5. 루트 `tsconfig.json` path alias 추가
6. bootstrap 등록
7. Definition에서 store 이름 참조
8. 테스트 추가 후 `corepack pnpm validate` 실행

## 1. 워크스페이스 패키지 생성

권장 구조:

```text
packages/
  store-database/
    package.json
    src/
      index.ts
```

최소 `package.json`:

```json
{
  "name": "@lightway/store-database",
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

## 2. Store 구현

최소 구현 패턴:

```ts
import { randomUUID } from "node:crypto";
import type {
  ContextLoadOptions,
  ContextStoreWithTtl,
  LightwayMessage
} from "@lightway/core";

export class DatabaseContextStore implements ContextStoreWithTtl {
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

참고:

- `get()`과 `append()`는 필수입니다
- `create()`와 `setTtl()`은 선택입니다
- backend에서 `contextWindow.ttlSeconds`가 중요하다면 `setTtl()`을 구현하세요

## 3. 워크스페이스에 연결

### `apps/gateway` dependency 추가

```json
{
  "dependencies": {
    "@lightway/store-database": "workspace:*"
  }
}
```

### 루트 path alias 추가

```json
{
  "compilerOptions": {
    "paths": {
      "@lightway/store-database": [
        "packages/store-database/src/index.ts"
      ]
    }
  }
}
```

### bootstrap 등록

[`apps/gateway/src/app.ts`](../apps/gateway/src/app.ts)에 store를 등록합니다.

```ts
import { DatabaseContextStore } from "@lightway/store-database";

registry.registerContextStore("database", new DatabaseContextStore());
registry.setDefaultContextStore("database");
```

## 4. Definition에서 사용

`executionOptions.contextStore`로 사용할 store를 지정합니다.

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

## 5. 테스트와 패키지 문서 추가

권장 후속 작업:

- `tests/store-database.test.ts` 추가
- `get()`, `append()`, 선택적으로 `create()`, `setTtl()` 검증
- `options.limit` 처리 검증
- 내구성, 순서 보장, TTL 동작을 설명하는 패키지 README 추가

## 실무 팁

- 가능하면 저장 포맷은 `LightwayMessage` 구조를 그대로 유지하세요.
- Definition이 없는 store를 참조하면 readiness가 저하되거나, context가 실제로 필요해지는 시점에 실행이 실패할 수 있습니다.
- 기본 `memory` store는 로컬 개발용으로만 보는 편이 좋습니다.
- 연결 후에는 `corepack pnpm validate`로 확인하세요.

## 통합 체크리스트

- `packages/store-*` 아래 패키지 생성 완료
- `package.json` 작성 완료
- `src/index.ts` export 완료
- `apps/gateway/package.json` 반영 완료
- 루트 `tsconfig.json` path alias 반영 완료
- `apps/gateway/src/app.ts` 등록 완료
- 필요 시 기본 store 지정 완료
- Definition에서 올바른 store 이름 사용 확인
- 테스트 추가 완료
- `corepack pnpm validate` 통과 확인

## 참고 구현

- 메모리 Store: [`packages/store-in-memory/src/index.ts`](../packages/store-in-memory/src/index.ts)
