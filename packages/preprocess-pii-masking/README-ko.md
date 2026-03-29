# @lightway/preprocess-pii-masking

`@lightway/preprocess-pii-masking`은 실행 요청의 입력과 Provider로 전달되는 메시지 이력에서 Definition별 exact field name 기준으로 개인정보 필드를 마스킹하는 Preprocessor 패키지입니다.

## 제공 컴포넌트

- `PiiMaskingPreprocessor`

## 주요 Export

```ts
import { PiiMaskingPreprocessor } from "@lightway/preprocess-pii-masking";
```

## 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { PiiMaskingPreprocessor } from "@lightway/preprocess-pii-masking";

const registry = createLightwayRegistry();
registry.registerPreprocessor(new PiiMaskingPreprocessor());
```

Definition에서 사용:

```json
{
  "name": "customer-support",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are a helpful support assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "customer": {
        "type": "object",
        "properties": {
          "customerName": { "type": "string" },
          "customerEmail": { "type": "string" },
          "customerPhone": { "type": "string" },
          "deliveryAddress": { "type": "string" }
        }
      }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input", "pii-masking"],
  "preprocessConfig": {
    "pii-masking": {
      "fieldNames": {
        "customerName": "full-masking",
        "customerEmail": "full-masking",
        "customerPhone": "full-masking",
        "deliveryAddress": "sample-masking"
      }
    }
  }
}
```

## `PiiMaskingPreprocessor`

Registry 이름:

- `pii-masking`

동작:

- `context.input`을 재귀 순회하며 configured exact field name과 일치하는 필드만 마스킹합니다.
- 마지막 사용자 메시지를 마스킹된 입력 기준으로 다시 작성합니다.
- 과거 `user`, `assistant`, `tool` 메시지도 실행 시점에 마스킹합니다.
- `system` 메시지와 `metadata.source === "rag"` 메시지는 수정하지 않습니다.
- `full-masking`은 값을 `[fieldName]` 토큰으로 치환합니다.
- `sample-masking`은 일부 문자만 남기고 나머지를 `*`로 가립니다.
- `context.metadata.piiMaskingSummary.fields`에 필드별 마스킹 건수를 기록합니다.

제한사항:

- 자유 텍스트 전체를 정규식으로 자동 탐지하지 않습니다.
- Definition의 `preprocessConfig["pii-masking"].fieldNames`에 지정한 exact field name만 사용합니다.
- field name은 대소문자 정규화나 suffix 매칭 없이 문자열 완전 일치로 비교합니다.
- `preprocess`에 `pii-masking`을 선언했다면 해당 config도 반드시 제공해야 합니다.

## 실행 예시

포함된 example definition:

- `definitions/customer-support-pii.json`

예시 요청:

```bash
curl -X POST http://localhost:3000/v1/execute \
  -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "definitionName": "customer-support-pii",
    "context": true,
    "contextId": "ctx-pii-1",
    "input": {
      "message": "Repeat the customer fields exactly as you received them.",
      "customerName": "Alice Kim",
      "receiverName": "Bob Lee",
      "customerEmail": "alice@example.com",
      "customerPhone": "010-1234-5678",
      "deliveryAddress": "서울시 강남구 테헤란로 123"
    }
  }'
```

기대 결과:

- `customerName`, `receiverName`, `customerEmail`, `customerPhone`은 `[fieldName]` 토큰으로 치환됩니다.
- `deliveryAddress`는 `sample-masking` 규칙에 따라 부분 마스킹됩니다.
- `fieldNames`에 없는 자유 텍스트는 v1에서 자동 마스킹되지 않습니다.

## 환경변수

이 패키지 자체는 환경변수를 사용하지 않습니다.
