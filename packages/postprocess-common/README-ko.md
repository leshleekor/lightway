# @lightway/postprocess-common

`@lightway/postprocess-common`은 기본적으로 바로 사용할 수 있는 공통 Postprocessor를 제공하는 패키지입니다. 현재는 응답 텍스트와 구조화 출력 내부 문자열을 정리하는 `TrimTextOutputPostprocessor`를 포함합니다.

## 제공 컴포넌트

- `TrimTextOutputPostprocessor`

## 주요 Export

```ts
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";
```

## 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";

const registry = createLightwayRegistry();
registry.registerPostprocessor(new TrimTextOutputPostprocessor());
```

Definition에서 사용:

```json
{
  "name": "animal-profile",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Return concise animal information.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "animal": { "type": "string" }
    },
    "required": ["animal"],
    "additionalProperties": false
  },
  "postprocess": ["trim-text-output"]
}
```

## `TrimTextOutputPostprocessor`

Registry 이름:

- `trim-text-output`

동작:

- `result.rawText.trim()`을 적용합니다.
- `result.output` 내부 문자열도 재귀적으로 trim 합니다.
- `result.metadata.postprocessedBy`에 자신의 이름을 기록합니다.
- `result.metadata.requestId`에 현재 요청 ID를 기록합니다.

## 출력 변환 예시

원본:

```json
{
  "rawText": "  hello world  ",
  "output": {
    "title": "  Otter  ",
    "tags": ["  playful  ", " aquatic "]
  }
}
```

후처리 후:

```json
{
  "rawText": "hello world",
  "output": {
    "title": "Otter",
    "tags": ["playful", "aquatic"]
  }
}
```

## 환경변수

이 패키지 자체는 환경변수를 사용하지 않습니다.

## 언제 사용하나요?

- LLM 응답의 앞뒤 공백을 정리하고 싶을 때
- Structured Output 내부 문자열을 일관되게 정리하고 싶을 때
- 커스텀 Postprocessor 구현 전에 기본 예제를 참고하고 싶을 때
