import "dotenv/config";
import { resolve } from "node:path";
import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry
} from "@lightway/core";
import { InMemoryContextStore } from "@lightway/context-memory";
import { JsonDefinitionSource } from "@lightway/definition-loader-json";
import { createGatewayServer } from "@lightway/http";
import { TrimTextOutputPostprocessor } from "@lightway/plugin-postprocess-common";
import { TrimStringInputPreprocessor } from "@lightway/plugin-preprocess-common";
import { BedrockProvider } from "@lightway/provider-bedrock";
import { OpenAIProvider } from "@lightway/provider-openai";

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
  registry.registerContextStore("memory", new InMemoryContextStore());
  registry.setDefaultContextStore("memory");
  registry.registerPreprocessor(new TrimStringInputPreprocessor());
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

  try {
    await definitionRegistry.load(source, registry);
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
      Number(process.env.LIGHTWAY_DEFAULT_TIMEOUT_MS ?? 30_000)
  });

  return createGatewayServer({
    registry,
    definitionRegistry,
    orchestrator,
    authToken: config.authToken ?? process.env.LIGHTWAY_AUTH_TOKEN,
    maxRequestBytes:
      config.maxRequestBytes ??
      Number(process.env.LIGHTWAY_MAX_REQUEST_BYTES ?? 1_048_576),
    bootIssues
  });
}
