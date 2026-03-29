# Definition 가이드

## 개요

이 가이드는 현재 템플릿에서 Lightway Definition을 추가하거나 수정하는 방법을 설명합니다.

현재 템플릿은 기본 JSON Definition loader를 전제로 합니다.

- `definitions/*.json` 파일은 자동으로 로드됩니다
- `definitions/examples/` 파일은 참고용 예시입니다
- 나중에 다른 Definition source를 쓰더라도 Definition 자체의 형태는 유지하고, source별 적재 절차만 별도로 맞추면 됩니다

## Definition 파일 위치

활성 Definition은 최상위 `definitions/` 디렉터리에 둡니다.

```text
definitions/
  animal-pedia.json
  animal-profile.json
  customer-support-pii.json
definitions/examples/
  animal-pedia-claude.json
```

중요:

- 현재 템플릿에서 실제 로드 경로는 `definitions/*.json`입니다
- `definitions/examples/*.json`는 자동 로드되지 않습니다
- 예제를 쓰고 싶다면 먼저 `definitions/`로 복사해야 합니다

## 필수 필드

모든 Definition에는 최소한 아래 필드가 필요합니다.

- `name`: 고유한 Definition 이름
- `provider`: 등록된 provider 이름. 예: `openai`
- `model`: provider 모델 ID
- `systemPrompt`: 시스템 프롬프트 문자열
- `inputSchema`: 입력 스키마

최소 예시:

```json
{
  "name": "animal-pedia",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are an animal encyclopedia assistant.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  }
}
```

## 자주 쓰는 선택 필드

- `outputSchema`: 구조화 출력 활성화
- `preprocess`: 전처리기 이름 배열
- `preprocessConfig`: 전처리기별 설정
- `postprocess`: 후처리기 이름 배열
- `postprocessConfig`: 후처리기별 설정
- `executionOptions.context`: 대화 컨텍스트 사용 여부
- `executionOptions.contextStore`: 사용할 store 이름
- `executionOptions.structuredOutput`: Definition 계약에는 있지만, 현재 런타임에서는 사실상 `outputSchema`가 구조화 출력의 기준입니다
- `executionOptions.stream`: 기본 스트리밍 여부
- `executionOptions.timeoutMs`: provider 타임아웃
- `executionOptions.temperature`: 모델 temperature

구조화 출력 관련 참고:

- `outputSchema`가 있으면 해당 Definition은 구조화 출력으로 실행됩니다
- 현재 런타임에서는 보통 `executionOptions.structuredOutput`을 따로 지정할 필요가 없습니다
- `outputSchema`가 있는 Definition에 대해 요청에서 `structuredOutput: false`를 보내면 오류가 발생합니다

## 자주 쓰는 패턴

### 1. 텍스트 응답 Definition

```json
{
  "name": "animal-pedia",
  "description": "Free-form animal encyclopedia answers.",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "You are an animal encyclopedia assistant. Answer accurately and clearly.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string" }
    },
    "required": ["question"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input"],
  "postprocess": ["trim-text-output"],
  "executionOptions": {
    "context": true,
    "contextStore": "memory",
    "stream": false,
    "timeoutMs": 30000,
    "temperature": 0.4
  }
}
```

### 2. 구조화 출력 Definition

```json
{
  "name": "animal-profile",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Return concise factual summaries.",
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
      "summary": { "type": "string" }
    },
    "required": ["name", "summary"],
    "additionalProperties": false
  },
  "preprocess": ["trim-string-input"],
  "postprocess": ["trim-text-output"],
  "executionOptions": {
    "stream": false,
    "timeoutMs": 30000,
    "temperature": 0.2
  }
}
```

### 3. PII 마스킹 Definition

```json
{
  "name": "customer-support-pii",
  "provider": "openai",
  "model": "gpt-5.4-mini-2026-03-17",
  "systemPrompt": "Respond clearly and keep masked placeholders exactly as provided.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": { "type": "string" },
      "data": {
        "type": "object",
        "properties": {
          "customerName": { "type": "string" },
          "customerEmail": { "type": "string" }
        },
        "additionalProperties": false
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
        "customerEmail": "full-masking"
      }
    }
  }
}
```

## 새 Definition을 가장 빨리 만드는 방법

1. `definitions/` 또는 `definitions/examples/`의 기존 파일을 복사합니다.
2. 파일명을 바꿉니다.
3. `name`을 고유하게 바꿉니다.
4. `model`을 현재 계정에서 사용할 수 있는 모델로 교체합니다.
5. `provider`가 등록된 provider 이름과 일치하는지 확인합니다.
6. `systemPrompt`, 스키마, 실행 옵션을 조정합니다.
7. `corepack pnpm validate`를 실행합니다.
8. `corepack pnpm dev`를 시작하거나 재시작합니다.
9. `/ready` 또는 `/v1/definitions`로 반영 여부를 확인합니다.

## 런타임 확인 방법

Definition 수정 후 유용한 확인 경로:

- `GET /ready`: readiness와 warning 확인
- `GET /v1/definitions`: 로드된 Definition 목록 확인
- `GET /v1/definitions/:name`: 특정 Definition 확인

예시:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions/my-definition
```

## 자주 만나는 오류

- 등록되지 않은 provider 참조
  `provider` 값은 bootstrap에서 등록한 provider 이름과 같아야 합니다.
- 구조화 출력 조합 오류
  `outputSchema`가 있으면 요청에서 구조화 출력을 끌 수 없습니다.
- 선언되지 않은 pre/postprocess 설정 key
  `preprocessConfig`, `postprocessConfig`의 key는 선언한 plugin 이름과 일치해야 합니다.
- context store 누락
  `context`를 켰다면 해당 store가 실제로 등록되어 있어야 합니다.
- 예제 파일을 복사하지 않음
  `definitions/examples/`에만 두면 기본 loader가 무시합니다.

## 실무 팁

- 클라이언트는 `definitionName`으로 호출하므로 `name`은 안정적으로 유지하는 편이 좋습니다.
- 현재 템플릿의 기본 context store는 메모리 기반 `memory`입니다.
- provider 자격 증명 유효성은 `pnpm validate`가 아니라 런타임에서 확인됩니다.
- 나중에 DB 기반 Definition source로 옮기더라도 gateway 계약을 바꾸기보다 source 적재 흐름을 교체하는 편이 단순합니다.

## 다음 가이드

- Provider: [provider-ko.md](./provider-ko.md)
- Pre-Processor: [pre-processor-ko.md](./pre-processor-ko.md)
- Post-Processor: [post-processor-ko.md](./post-processor-ko.md)
- Store: [store-ko.md](./store-ko.md)
