import "dotenv/config";
import { resolve } from "node:path";
import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry
} from "@lightway/core";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { createGatewayServer } from "@lightway/http";
import { BedrockProvider } from "@lightway/provider-bedrock";
import { ClaudeProvider } from "@lightway/provider-claude";
import { OpenAIProvider } from "@lightway/provider-openai";
import { InMemoryContextStore } from "@lightway/store-in-memory";
import {
  ConsoleExecutionAuditSink,
  createExecutionAuditHook
} from "@lightway/postprocess-audit-log";
import { TrimTextOutputPostprocessor } from "@lightway/postprocess-common";
import { TrimStringInputPreprocessor } from "@lightway/preprocess-common";
import { PiiMaskingPreprocessor } from "@lightway/preprocess-pii-masking";

export interface GatewayAppConfig {
  authToken?: string;
  definitionsDir?: string;
  maxRequestBytes?: number;
  defaultTimeoutMs?: number;
}

export async function createGatewayApplication(config: GatewayAppConfig = {}) {
  const registry = createLightwayRegistry();
  const definitionRegistry = createDefinitionRegistry();
  const bootIssues: string[] = [];

  registry.registerProvider(new OpenAIProvider());
  registry.registerProvider(new BedrockProvider());
  registry.registerProvider(new ClaudeProvider());
  registry.registerContextStore("memory", new InMemoryContextStore());
  registry.setDefaultContextStore("memory");
  registry.registerPreprocessor(new TrimStringInputPreprocessor());
  registry.registerPreprocessor(new PiiMaskingPreprocessor());
  registry.registerPostprocessor(new TrimTextOutputPostprocessor());

  const definitionsDir = resolve(
    process.cwd(),
    config.definitionsDir ??
      process.env.LIGHTWAY_DEFINITIONS_DIR ??
      "./definitions"
  );

  const source = new JsonDefinitionSource({
    directory: definitionsDir
  });

  let definitionsLoaded = false;
  try {
    await definitionRegistry.load(source, registry);
    definitionsLoaded = true;
  } catch (error) {
    bootIssues.push(
      `DEFINITION_LOAD_FAILED:${error instanceof Error ? error.message : "unknown"}`
    );
  }

  const orchestrator = createExecuteOrchestrator({
    registry,
    definitionRegistry,
    defaultTimeoutMs:
      config.defaultTimeoutMs ??
      Number(process.env.LIGHTWAY_DEFAULT_TIMEOUT_MS ?? 30_000),
    onExecutionEnd: createExecutionAuditHook(
      new ConsoleExecutionAuditSink(),
      {
        captureResponseBody: "full",
        failOpen: true
      }
    )
  });

  const app = await createGatewayServer({
    registry,
    definitionRegistry,
    orchestrator,
    authToken: config.authToken ?? process.env.LIGHTWAY_AUTH_TOKEN,
    maxRequestBytes:
      config.maxRequestBytes ??
      Number(process.env.LIGHTWAY_MAX_REQUEST_BYTES ?? 1_048_576),
    bootIssues,
    logger: true
  });

  if (definitionsLoaded) {
    app.log.info(
      {
        definitions: definitionRegistry.list().map((definition) => definition.name)
      },
      "definitions loaded"
    );
  }

  if (bootIssues.length > 0) {
    app.log.warn(
      {
        bootIssues
      },
      "gateway started with boot issues"
    );
  }

  return app;
}
