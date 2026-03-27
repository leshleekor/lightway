# @lightway/http

`@lightway/http`는 Lightway 런타임을 Fastify 기반 HTTP API로 노출하는 어댑터 패키지입니다. 앱에서 registry, definition registry, orchestrator를 조합한 뒤 이 패키지로 외부 요청을 받을 수 있습니다.

## 제공 기능

- Fastify 서버 생성
- Bearer 인증 처리
- `/health`, `/ready` 상태 확인
- Definition, Provider, Capability 조회 API
- JSON 실행 API
- SSE 스트리밍 응답 처리

## 주요 Export

```ts
import { buildReadinessReport, createGatewayServer } from "@lightway/http";
```

## 기본 사용법

```ts
import { createDefinitionRegistry, createExecuteOrchestrator, createLightwayRegistry } from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { createGatewayServer } from "@lightway/http";
import { OpenAIProvider } from "@lightway/provider-openai";

const registry = createLightwayRegistry();
registry.registerProvider(new OpenAIProvider());

const definitionRegistry = createDefinitionRegistry();
await definitionRegistry.load(
  new JsonDefinitionSource({ directory: "./definitions" }),
  registry
);

const orchestrator = createExecuteOrchestrator({
  registry,
  definitionRegistry
});

const app = await createGatewayServer({
  registry,
  definitionRegistry,
  orchestrator,
  authToken: process.env.LIGHTWAY_AUTH_TOKEN
});

await app.listen({ port: 3000, host: "0.0.0.0" });
```

## `createGatewayServer(options)`

옵션:

- `registry`: `LightwayRegistry`
- `definitionRegistry`: `DefinitionRegistry`
- `orchestrator`: `ExecuteOrchestrator`
- `authToken?`: `/v1/*` 경로에서 사용할 Bearer 토큰
- `maxRequestBytes?`: Fastify body limit. 기본값 `1_048_576`
- `bootIssues?`: 부트스트랩 단계에서 수집한 진단 메시지
- `logger?`: Fastify logger 활성화 여부

반환값:

- `Promise<FastifyInstance>`

## 제공 엔드포인트

- `GET /health`
  - 프로세스 생존 여부 확인
- `GET /ready`
  - Definition, Provider, Auth, Context Store readiness 보고서 반환
- `GET /v1/definitions`
  - 정의 목록 반환
- `GET /v1/definitions/:name`
  - 단일 정의 반환
- `GET /v1/providers`
  - 등록된 Provider 상태 반환
- `GET /v1/capabilities`
  - gateway capability 및 provider capability 반환
- `POST /v1/execute`
  - 일반 JSON 응답 또는 SSE 스트리밍 실행

## 인증

- `/v1/*` 경로는 Bearer 토큰이 필요합니다.
- `authToken`이 없거나 값이 다르면 `UNAUTHORIZED` 에러가 발생합니다.

예시:

```bash
curl -H "Authorization: Bearer $LIGHTWAY_AUTH_TOKEN" \
  http://localhost:3000/v1/definitions
```

## 스트리밍

요청 또는 Definition의 `stream` 옵션이 활성화되면 `/v1/execute`는 SSE로 응답합니다.

SSE 이벤트:

- `start`
- `delta`
- `usage`
- `output`
- `end`
- `error`

## `buildReadinessReport(options)`

HTTP 서버를 띄우지 않고 readiness 계산만 재사용하고 싶을 때 사용합니다.

```ts
const readiness = buildReadinessReport({
  registry,
  definitionRegistry,
  authToken: process.env.LIGHTWAY_AUTH_TOKEN,
  bootIssues: []
});
```

보고 항목:

- `definitions`
- `providers`
- `auth`
- `contextStore`

## 환경변수

이 패키지 자체는 환경변수를 직접 읽지 않습니다. 필요한 값은 모두 `createGatewayServer()` 옵션으로 주입합니다.

일반적으로 앱 레벨에서는 다음 값을 함께 관리합니다.

- `LIGHTWAY_AUTH_TOKEN`
- `LIGHTWAY_MAX_REQUEST_BYTES`
- `LIGHTWAY_DEFAULT_TIMEOUT_MS`
- `LIGHTWAY_DEFINITIONS_DIR`

## 언제 이 패키지를 사용하나요?

- Fastify 기반 API 서버를 빠르게 구성할 때
- gateway 앱을 직접 만들거나 교체할 때
- readiness와 SSE 규약을 동일하게 유지하고 싶을 때
