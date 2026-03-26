import type { ModelProvider } from "@lightway/core";
import {
  createDefinitionRegistry,
  createExecuteOrchestrator,
  createLightwayRegistry
} from "@lightway/core";
import { createGatewayServer } from "@lightway/http";
import { describe, expect, it } from "vitest";
import { InlineDefinitionSource, MockProvider } from "./helpers.js";

describe("http gateway", () => {
  it("protects /v1 routes and exposes definitions with auth", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(
      new MockProvider({
        name: "openai",
        onGenerate: async () => ({
          rawText: "ok"
        })
      })
    );

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-pedia",
          provider: "openai",
          model: "test-model",
          systemPrompt: "You are helpful.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string" }
            },
            required: ["question"],
            additionalProperties: false
          }
        }
      ]),
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
      authToken: "secret-token"
    });

    const health = await app.inject({
      method: "GET",
      url: "/health"
    });
    expect(health.statusCode).toBe(200);

    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/definitions"
    });
    expect(unauthorized.statusCode).toBe(401);

    const definitions = await app.inject({
      method: "GET",
      url: "/v1/definitions",
      headers: {
        authorization: "Bearer secret-token"
      }
    });
    expect(definitions.statusCode).toBe(200);
    expect(definitions.json().items[0].name).toBe("animal-pedia");

    const execute = await app.inject({
      method: "POST",
      url: "/v1/execute",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      payload: {
        definitionName: "animal-pedia",
        input: {
          question: "Tell me about otters"
        },
        temperature: 0
      }
    });
    expect(execute.statusCode).toBe(200);
    expect(execute.json().output).toBe("ok");

    await app.close();
  });

  it("returns requestId on invalid input errors", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-pedia",
          provider: "openai",
          model: "test-model",
          systemPrompt: "You are helpful.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string" }
            },
            required: ["question"],
            additionalProperties: false
          }
        }
      ]),
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
      authToken: "secret-token"
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/execute",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json"
      },
      payload: {
        definitionName: "animal-pedia",
        input: {}
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().requestId).toBeTruthy();
    expect(response.json().error.code).toBe("INVALID_INPUT");

    await app.close();
  });

  it("reports not_ready when auth token is missing", async () => {
    const registry = createLightwayRegistry();
    registry.registerProvider(new MockProvider({ name: "openai" }));

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-pedia",
          provider: "openai",
          model: "test-model",
          systemPrompt: "You are helpful.",
          inputSchema: { type: "string" }
        }
      ]),
      registry
    );

    const orchestrator = createExecuteOrchestrator({
      registry,
      definitionRegistry
    });

    const app = await createGatewayServer({
      registry,
      definitionRegistry,
      orchestrator
    });

    const ready = await app.inject({
      method: "GET",
      url: "/ready"
    });

    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe("not_ready");
    expect(ready.json().checks.auth).toBe("failed");

    await app.close();
  });

  it("calls getStatus only once per provider on /v1/providers", async () => {
    let statusCalls = 0;
    const provider: ModelProvider = {
      name: "claude",
      supports: () => true,
      async generate() {
        return {
          rawText: "ok"
        };
      },
      getStatus() {
        statusCalls += 1;
        return {
          status: "ready"
        };
      }
    };

    const registry = createLightwayRegistry();
    registry.registerProvider(provider);

    const definitionRegistry = createDefinitionRegistry();
    await definitionRegistry.load(
      new InlineDefinitionSource([
        {
          name: "animal-pedia",
          provider: "claude",
          model: "test-model",
          systemPrompt: "You are helpful.",
          inputSchema: { type: "string" }
        }
      ]),
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
      authToken: "secret-token"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/providers",
      headers: {
        authorization: "Bearer secret-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(statusCalls).toBe(1);

    await app.close();
  });
});
