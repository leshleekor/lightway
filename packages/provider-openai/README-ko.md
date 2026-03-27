# @lightway/provider-openai

`@lightway/provider-openai`는 OpenAI Chat Completions API를 Lightway `ModelProvider` 계약으로 감싼 패키지입니다. Boilerplate에서 가장 기본적인 OpenAI 연동 Provider로 사용할 수 있습니다.

## 제공 기능

- 텍스트 생성
- Structured Output 실행
- SSE 기반 스트리밍 응답 처리
- Provider 상태 점검(`getStatus`)

## 주요 Export

```ts
import { OpenAIProvider } from "@lightway/provider-openai";
```

## 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());
```

## `OpenAIProvider`

생성자:

```ts
new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_BASE_URL,
  organization: process.env.OPENAI_ORGANIZATION,
  project: process.env.OPENAI_PROJECT
});
```

옵션:

- `apiKey?`
- `baseUrl?`
- `organization?`
- `project?`

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

- `OPENAI_API_KEY`

선택:

- `OPENAI_BASE_URL`
  - 기본값: `https://api.openai.com`
- `OPENAI_ORGANIZATION`
- `OPENAI_PROJECT`

`getStatus()` 동작:

- API Key가 없으면 `{ status: "failed", issue: "OPENAI_API_KEY_MISSING" }`
- API Key가 있으면 `{ status: "ready" }`

## Definition 예시

```json
{
  "name": "animal-pedia",
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
    "structuredOutput": false,
    "stream": true
  }
}
```

Structured Output 예시:

```json
{
  "name": "animal-profile",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
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
const provider = new OpenAIProvider();

const result = await provider.generate({
  requestId: "req-1",
  definitionName: "animal-pedia",
  provider: "openai",
  model: "gpt-5.4-mini-2026-03-17",
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

- 이미지 입력(`image-url`)은 현재 구현에서 지원하지 않습니다.
- Structured Output은 OpenAI 응답과 Lightway Core의 schema 검증 흐름을 함께 사용합니다.
- 스트리밍 사용 시 provider는 `start`, `delta`, `usage`, `end` 이벤트를 emit합니다.
