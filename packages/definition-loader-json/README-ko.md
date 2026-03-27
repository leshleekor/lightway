# @lightway/definition-loader-json

`@lightway/definition-loader-json`은 파일 시스템의 JSON Definition을 읽어 `DefinitionRegistry`에 적재하기 위한 패키지입니다. Template Repository를 기반으로 사용할 때 가장 기본적인 Definition 로더 역할을 합니다.

## 제공 기능

- 지정한 디렉터리의 최상위 `*.json` 파일 로드
- `DefinitionSource` 계약 구현
- Definition Registry와 바로 연결 가능한 `JsonDefinitionSource` 제공

## 주요 Export

```ts
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
```

## 기본 사용법

```ts
import { createDefinitionRegistry, createLightwayRegistry } from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());

const definitionRegistry = createDefinitionRegistry();
await definitionRegistry.load(
  new JsonDefinitionSource({
    directory: "./definitions"
  }),
  registry
);
```

## `JsonDefinitionSource`

생성자:

```ts
new JsonDefinitionSource({
  directory: "./definitions"
});
```

옵션:

- `directory`: Definition JSON 파일이 있는 디렉터리 절대/상대 경로

메서드:

- `list()`: 디렉터리의 모든 JSON Definition을 읽습니다.
- `get(name)`: 이름이 일치하는 Definition을 반환합니다.

## 디렉터리 구조 예시

```text
definitions/
  animal-pedia.json
  animal-profile.json
  customer-support.json
```

예시 Definition:

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
  }
}
```

## 동작 특성

- 하위 디렉터리 재귀 탐색은 하지 않습니다.
- 파일명 기준이 아니라 JSON 내부의 `name` 필드로 Definition 이름을 결정합니다.
- 정렬된 순서로 파일을 읽습니다.
- Registry에 등록되지 않은 Provider를 참조하면 `definitionRegistry.load()`에서 실패합니다.

## 환경변수

이 패키지 자체는 환경변수를 사용하지 않습니다.

일반적으로 앱 레벨에서 Definition 경로를 정하고 싶다면, 별도의 bootstrap 코드 또는 앱 환경변수로 디렉터리를 주입합니다. 예를 들어 gateway 앱은 `LIGHTWAY_DEFINITIONS_DIR` 같은 앱 전용 설정을 사용할 수 있습니다.
