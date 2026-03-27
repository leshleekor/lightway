# @lightway/provider-claude

`@lightway/provider-claude`는 Anthropic Claude Messages API를 Lightway `ModelProvider` 계약에 맞춰 연동하는 패키지입니다. Claude를 Provider Registry에 등록해 Definition에서 바로 사용할 수 있습니다.

## 제공 기능

- 텍스트 생성
- Structured Output 실행
- SSE 기반 스트리밍 처리
- Provider 상태 점검(`getStatus`)

## 주요 Export

```ts
import { ClaudeProvider } from "@lightway/provider-claude";
```

## 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { ClaudeProvider } from "@lightway/provider-claude";

const registry = createLightwayRegistry();
registry.registerProvider(new ClaudeProvider());
```

## `ClaudeProvider`

생성자:

```ts
new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL
});
```

옵션:

- `apiKey?`
- `baseUrl?`

지원 capability:

- `text-generation`
- `structured-output`
- `streaming`

주요 메서드:

- `supports(capability)`
- `getStatus()`
- `generate(request)`
- `stream(request, handler)`

## 환경변수

필수:

- `ANTHROPIC_API_KEY`

선택:

- `ANTHROPIC_BASE_URL`
  - 기본값: `https://api.anthropic.com`

내부 고정 헤더:

- `anthropic-version`
  - 현재 구현은 `2023-06-01`로 고정합니다.

`getStatus()` 동작:

- API Key가 없으면 `{ status: "failed", issue: "ANTHROPIC_API_KEY_MISSING" }`
- API Key가 있으면 `{ status: "ready" }`

## Definition 예시

```json
{
  "name": "animal-pedia-claude",
  "provider": "claude",
  "model": "claude-3-5-sonnet-latest",
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
    "stream": true
  }
}
```

Structured Output 예시:

```json
{
  "name": "animal-profile-claude",
  "provider": "claude",
  "model": "claude-3-5-sonnet-latest",
  "systemPrompt": "Return valid JSON only.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "animal": { "type": "string" }
    },
    "required": ["animal"],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "habitat": { "type": "string" }
    },
    "required": ["name", "habitat"],
    "additionalProperties": false
  },
  "executionOptions": {
    "structuredOutput": true
  }
}
```

## 사용 예시

```ts
const provider = new ClaudeProvider();

const result = await provider.generate({
  requestId: "req-1",
  definitionName: "animal-pedia-claude",
  provider: "claude",
  model: "claude-3-5-sonnet-latest",
  systemPrompt: "You are a helpful assistant.",
  input: { question: "Tell me about otters" },
  messages: [
    {
      role: "user",
      content: "{\"question\":\"Tell me about otters\"}"
    }
  ]
});
```

## 구현 메모

- 현재 구현은 공식 SDK가 아니라 raw `fetch`와 직접 SSE 파싱을 사용합니다.
- `image-url` 입력은 지원하지 않습니다.
- Structured Output은 Claude 전용 schema 모드가 아니라 Lightway Core의 schema 검증/보정 흐름을 사용합니다.
- 스트리밍 중 `content_block_delta`, `message_delta`, `message_stop` 등을 `ProviderStreamEvent`로 정규화합니다.
