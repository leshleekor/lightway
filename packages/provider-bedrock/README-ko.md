# @lightway/provider-bedrock

`@lightway/provider-bedrock`는 AWS Bedrock Converse API를 Lightway `ModelProvider` 계약에 맞춰 연동하는 패키지입니다. Bedrock 모델을 Definition에서 사용할 수 있도록 registry에 등록합니다.

## 제공 기능

- 텍스트 생성
- 스트리밍 응답 처리
- Provider 상태 점검(`getStatus`)

## 주요 Export

```ts
import { BedrockProvider } from "@lightway/provider-bedrock";
```

## 등록 방법

```ts
import { createLightwayRegistry } from "@lightway/core";
import { BedrockProvider } from "@lightway/provider-bedrock";

const registry = createLightwayRegistry();
registry.registerProvider(new BedrockProvider());
```

## `BedrockProvider`

생성자:

```ts
new BedrockProvider({
  region: process.env.AWS_REGION
});
```

옵션:

- `region?`

지원 capability:

- `text-generation`
- `streaming`

지원하지 않는 capability:

- `structured-output`

주요 메서드:

- `supports(capability)`
- `getStatus()`
- `generate(request)`
- `stream(request, handler)`

## 환경변수

필수:

- `AWS_REGION`

자격 증명:

- 이 패키지는 AWS SDK 기본 credential chain을 사용합니다.
- 다음과 같은 방식이 가능합니다.
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
  - shared config/profile
  - ECS/EKS task role
  - EC2 instance role

`getStatus()` 동작:

- Region이 없으면 `{ status: "failed", issue: "AWS_REGION_MISSING" }`
- Region이 있으면 `{ status: "ready" }`

## Definition 예시

```json
{
  "name": "animal-pedia-bedrock",
  "provider": "bedrock",
  "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
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

## 사용 예시

```ts
const provider = new BedrockProvider({
  region: "us-west-2"
});

const result = await provider.generate({
  requestId: "req-1",
  definitionName: "animal-pedia-bedrock",
  provider: "bedrock",
  model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
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

- 내부적으로 `BedrockRuntimeClient`와 `ConverseCommand`/`ConverseStreamCommand`를 사용합니다.
- `image-url` 입력은 현재 구현에서 지원하지 않습니다.
- JSON part는 문자열로 직렬화하여 전송합니다.
- Structured Output capability는 현재 provider 수준에서는 노출하지 않습니다.
