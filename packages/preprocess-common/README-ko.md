# @lightway/preprocess-common

`@lightway/preprocess-common`은 기본적으로 바로 사용할 수 있는 공통 Preprocessor를 제공하는 패키지입니다. 현재는 입력 문자열과 객체 내부 문자열을 정리하는 `TrimStringInputPreprocessor`를 포함합니다.

## 제공 컴포넌트

- `TrimStringInputPreprocessor`

## 주요 Export

```ts
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";
```

## 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";

const registry = createLightwayRegistry();
registry.registerPreprocessor(new TrimStringInputPreprocessor());
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
      "message": { "type": "string" }
    },
    "required": ["message"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input"]
}
```

## `TrimStringInputPreprocessor`

Registry 이름:

- `trim-string-input`

동작:

- 입력 데이터의 모든 문자열 값을 재귀적으로 `trim()` 합니다.
- 마지막 사용자 메시지의 content를 정리된 입력 기준으로 다시 작성합니다.
- RAG로 주입된 사용자 메시지(`metadata.source === "rag"`)는 수정하지 않습니다.
- `context.metadata.preprocessedBy`에 자신의 이름을 기록합니다.

## 입력 변환 예시

입력:

```json
{
  "message": "  hello world  ",
  "tags": ["  a  ", " b "]
}
```

변환 후:

```json
{
  "message": "hello world",
  "tags": ["a", "b"]
}
```

## 환경변수

이 패키지 자체는 환경변수를 사용하지 않습니다.

## 언제 사용하나요?

- 사용자 입력의 앞뒤 공백을 일관되게 제거하고 싶을 때
- Prompt에 들어가는 문자열을 정규화하고 싶을 때
- 커스텀 Preprocessor 구현 전에 기본 예제를 참고하고 싶을 때
