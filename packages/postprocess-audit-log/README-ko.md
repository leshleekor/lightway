# @lightway/postprocess-audit-log

`@lightway/postprocess-audit-log`는 실행 결과를 구조화된 감사 로그 레코드로 변환해 sink로 기록하는 패키지입니다. 성공/실패 로그를 함께 남기고 싶다면 `@lightway/core`의 `onExecutionEnd` hook과 함께 사용하는 것이 권장 경로입니다.

## 제공 기능

- 성공/실패 실행을 공통 감사 로그 레코드로 변환
- stdout JSON sink 제공
- 여러 sink를 fan-out하는 composite sink 제공
- hook 기반 기록과 standalone postprocessor 경로 제공

## 주요 Export

```ts
import {
  CompositeExecutionAuditSink,
  ConsoleExecutionAuditSink,
  ExecutionAuditLogPostprocessor,
  createExecutionAuditHook
} from "@lightway/postprocess-audit-log";
```

주요 타입:

- `ExecutionAuditSink`
- `ExecutionAuditLogRecord`
- `ExecutionAuditRuntimeOptions`

## 권장 사용법: Hook 기반

```ts
import { createExecuteOrchestrator } from "@lightway/core";
import {
  ConsoleExecutionAuditSink,
  createExecutionAuditHook
} from "@lightway/postprocess-audit-log";

const auditHook = createExecutionAuditHook(
  new ConsoleExecutionAuditSink(),
  {
    captureResponseBody: "full",
    failOpen: true
  }
);

const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry,
  onExecutionEnd: auditHook
});
```

이 경로의 장점:

- 성공/실패 모두 기록 가능
- `contextId`, `usage`, `finishReason`, `latencyMs`를 한 번에 확보 가능
- 스트리밍 종료 시 최종 누적 결과 기준으로 기록 가능

## Standalone Postprocessor

Hook을 사용할 수 없는 환경에서는 success-only standalone 경로로 사용할 수 있습니다.

```ts
import {
  ConsoleExecutionAuditSink,
  ExecutionAuditLogPostprocessor
} from "@lightway/postprocess-audit-log";

registry.registerPostprocessor(
  new ExecutionAuditLogPostprocessor(
    new ConsoleExecutionAuditSink(),
    {
      captureResponseBody: "full"
    }
  )
);
```

주의:

- 이 경로는 성공 결과만 기록합니다.
- Context 저장 이전 시점에 실행되므로, 실제 context 저장 실패와 완전히 동기화되지는 않습니다.
- Hook과 standalone postprocessor를 동시에 붙이면 성공 로그가 중복될 수 있으므로 피하는 것이 좋습니다.

## `ExecutionAuditSink`

커스텀 저장 대상을 만들려면 이 계약을 구현합니다.

```ts
interface ExecutionAuditSink {
  write(record: ExecutionAuditLogRecord): Promise<void> | void;
}
```

DB 적재용 sink, queue sink, file sink를 이 계약으로 추가할 수 있습니다.

예시:

```ts
class MyDatabaseSink {
  async write(record) {
    await db.insert("execution_audit_logs", record);
  }
}
```

## 제공 Sink

### `ConsoleExecutionAuditSink`

구조화된 JSON 한 줄을 stdout으로 기록합니다.

```ts
const sink = new ConsoleExecutionAuditSink();
```

옵션:

- `stream?`
  - 기본값은 `process.stdout`
  - 테스트나 특수 로거에 연결할 때 대체 가능

### `CompositeExecutionAuditSink`

여러 sink에 동시에 fan-out 합니다.

```ts
const sink = new CompositeExecutionAuditSink([
  new ConsoleExecutionAuditSink(),
  new MyDatabaseSink()
]);
```

동작:

- 모든 sink를 시도합니다.
- 하나 이상 실패하면 `AggregateError`를 발생시킵니다.
- 상위의 `failOpen` 정책이 이 오류를 계속 무시할지 실패로 전파할지 결정합니다.

## `createExecutionAuditHook(sink, options?)`

`ExecutionHook`를 생성합니다.

옵션:

- `captureResponseBody?: "none" | "full"`
  - 기본값 `full`
- `failOpen?: boolean`
  - 기본값 `true`
  - `true`면 sink 오류가 발생해도 원 요청은 계속 진행됩니다.
- `onSinkError?: (error, record) => Promise<void> | void`
  - sink 오류가 발생했을 때 추가 부수 효과를 수행합니다.

실패 정책:

- `failOpen: true`
  - 요청은 성공/실패 원래 흐름대로 계속 진행됩니다.
  - sink 실패는 stdout fallback 로그로 남습니다.
- `failOpen: false`
  - `EXECUTION_AUDIT_SINK_FAILED` 에러로 전파됩니다.

## 감사 로그 레코드 구조

`ExecutionAuditLogRecord` 주요 필드:

- `timestamp`
- `latencyMs`
- `status`
- `requestId`
- `definitionName`
- `provider`
- `model`
- `contextId`
- `finishReason`
- `usage`
- `rawText`
- `output`
- `error`
- `metadata`

예시:

```json
{
  "timestamp": "2026-03-28T10:00:00.000Z",
  "latencyMs": 842,
  "status": "succeeded",
  "requestId": "req-123",
  "definitionName": "animal-pedia",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "contextId": "ctx-1",
  "finishReason": "stop",
  "usage": {
    "inputTokens": 120,
    "outputTokens": 58,
    "totalTokens": 178
  },
  "rawText": "Otters are aquatic mammals...",
  "metadata": {
    "upstreamId": "chatcmpl_123"
  }
}
```

## 환경변수

이 패키지 자체는 환경변수를 사용하지 않습니다. sink 연결, fail-open/closed 정책, 본문 저장 여부는 모두 코드에서 제어합니다.

## 추천 확장 방식

- `stdout + DB` 이중 기록이 필요하면 `CompositeExecutionAuditSink`를 사용합니다.
- PostgreSQL, MongoDB, DynamoDB용 sink는 별도 패키지나 앱 전용 코드로 구현합니다.
- `contextId` 기준 조회가 중요하면 DB 스키마에서 인덱스를 준비합니다.
