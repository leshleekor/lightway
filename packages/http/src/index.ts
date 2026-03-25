import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  LightwayError,
  isLightwayError,
  sanitizeDefinition,
  type DefinitionRegistry,
  type ExecuteOrchestrator,
  type ExecuteRequest,
  type GatewayStreamEvent,
  type LightwayRegistry,
  type ReadinessReport,
  type WarningDetail
} from "@lightway/core";

const executeRequestSchema = z.object({
  definitionName: z.string().min(1),
  input: z.unknown(),
  context: z.boolean().optional(),
  contextId: z.string().optional(),
  structuredOutput: z.boolean().optional(),
  stream: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  temperature: z.number().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  toolCalling: z.array(z.string()).optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
});

const GATEWAY_CAPABILITIES = [
  "context",
  "rag",
  "preprocess",
  "postprocess",
  "streaming",
  "structured-output"
] as const;

export interface CreateGatewayServerOptions {
  registry: LightwayRegistry;
  definitionRegistry: DefinitionRegistry;
  orchestrator: ExecuteOrchestrator;
  authToken?: string;
  maxRequestBytes?: number;
  bootIssues?: string[];
}

function getProviderStatus(registry: LightwayRegistry, providerName: string) {
  const provider = registry.getProvider(providerName);
  if (!provider) {
    return {
      status: "failed" as const,
      issue: `PROVIDER_NOT_REGISTERED:${providerName}`
    };
  }

  return provider.getStatus?.() ?? { status: "ready" as const };
}

export function buildReadinessReport(
  options: Pick<
    CreateGatewayServerOptions,
    "registry" | "definitionRegistry" | "authToken" | "bootIssues"
  >
): ReadinessReport {
  const issues = [...(options.bootIssues ?? [])];
  const definitionWarnings = options.definitionRegistry
    .listWarnings()
    .filter((item) => item.warnings.length > 0);
  const systemWarnings: WarningDetail[] = [];

  const definitionsCheck =
    issues.some((issue) => issue.startsWith("DEFINITION_")) ||
    issues.some((issue) => issue.startsWith("BOOT_"))
      ? "failed"
      : definitionWarnings.length > 0
        ? "degraded"
        : "ok";

  const authCheck = options.authToken ? "ok" : "failed";
  if (!options.authToken) {
    issues.push("AUTH_TOKEN_MISSING");
  }

  const referencedProviders = new Set(
    options.definitionRegistry.list().map((definition) => definition.provider)
  );
  let providersCheck: ReadinessReport["checks"]["providers"] = "ok";
  for (const providerName of referencedProviders) {
    const status = getProviderStatus(options.registry, providerName);
    if (status.status === "failed") {
      providersCheck = "failed";
      if (status.issue) {
        issues.push(status.issue);
      }
    }
  }

  let contextStoreCheck: ReadinessReport["checks"]["contextStore"] = "ok";
  const defaultContextStoreName = options.registry.getDefaultContextStoreName();
  const definitionsRequiringContext = options.definitionRegistry
    .list()
    .filter((definition) => definition.executionOptions?.context === true);

  if (definitionsRequiringContext.length === 0) {
    contextStoreCheck = "disabled";
    if (!defaultContextStoreName) {
      systemWarnings.push({
        code: "CONTEXT_DISABLED",
        message: "No default context store is configured"
      });
    }
  } else {
    for (const definition of definitionsRequiringContext) {
      const storeName =
        definition.executionOptions?.contextStore ?? defaultContextStoreName;
      if (!storeName || !options.registry.getContextStore(storeName)) {
        contextStoreCheck = "failed";
        issues.push(`CONTEXT_STORE_REQUIRED:${definition.name}`);
      }
    }
  }

  const isReady =
    definitionsCheck !== "failed" &&
    authCheck !== "failed" &&
    providersCheck !== "failed" &&
    contextStoreCheck !== "failed";

  return {
    status: isReady ? "ready" : "not_ready",
    checks: {
      definitions: definitionsCheck,
      providers: providersCheck,
      auth: authCheck,
      contextStore: contextStoreCheck
    },
    warnings: {
      system: systemWarnings,
      definitions: definitionWarnings
    },
    issues: [...new Set(issues)]
  };
}

function getBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return undefined;
  }

  return header.slice("Bearer ".length);
}

function sendSseEvent(reply: FastifyReply, event: GatewayStreamEvent): void {
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

function shouldUseStreaming(
  definitionRegistry: DefinitionRegistry,
  body: ExecuteRequest
): boolean {
  const definition = definitionRegistry.get(body.definitionName);
  return body.stream ?? definition?.executionOptions?.stream ?? false;
}

export async function createGatewayServer(
  options: CreateGatewayServerOptions
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: options.maxRequestBytes ?? 1_048_576,
    genReqId: () => randomUUID()
  });

  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/v1/")) {
      return;
    }

    const token = getBearerToken(request);
    if (!options.authToken || token !== options.authToken) {
      throw new LightwayError("UNAUTHORIZED", "Invalid or missing bearer token");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    let lightwayError: LightwayError;

    if (isLightwayError(error)) {
      lightwayError = error;
    } else if ((error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      lightwayError = new LightwayError(
        "REQUEST_TOO_LARGE",
        "Request body exceeds the configured limit"
      );
    } else {
      lightwayError = new LightwayError("INTERNAL_ERROR", "Unexpected server error", {
        cause: error instanceof Error ? error.message : "unknown"
      });
    }

    reply.status(lightwayError.statusCode).send({
      requestId: request.id,
      error: {
        code: lightwayError.code,
        message: lightwayError.message,
        details: lightwayError.details
      }
    });
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/ready", async () => buildReadinessReport(options));

  app.get("/v1/definitions", async () => ({
    items: options.definitionRegistry.list().map((definition) =>
      sanitizeDefinition(
        definition,
        options.definitionRegistry.getWarnings(definition.name)
      )
    )
  }));

  app.get("/v1/definitions/:name", async (request) => {
    const params = request.params as { name: string };
    const definition = options.definitionRegistry.get(params.name);
    if (!definition) {
      throw new LightwayError("DEFINITION_NOT_FOUND", "Definition not found", {
        definitionName: params.name
      });
    }

    return sanitizeDefinition(
      definition,
      options.definitionRegistry.getWarnings(definition.name)
    );
  });

  app.get("/v1/providers", async () => ({
    items: options.registry.listProviders().map((provider) => ({
      name: provider.name,
      status: provider.getStatus?.().status ?? "ready",
      issue: provider.getStatus?.().issue
    }))
  }));

  app.get("/v1/capabilities", async () => ({
    gateway: [...GATEWAY_CAPABILITIES],
    providers: options.registry.listProviders().map((provider) => ({
      name: provider.name,
      capabilities: ["text-generation", "structured-output", "streaming", "tool-calling"].filter(
        (capability) =>
          provider.supports(
            capability as
              | "text-generation"
              | "structured-output"
              | "streaming"
              | "tool-calling"
          )
      )
    }))
  }));

  app.post("/v1/execute", async (request, reply) => {
    const bodyResult = executeRequestSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw new LightwayError(
        "INVALID_INPUT",
        bodyResult.error.issues.map((issue) => issue.message).join("; ")
      );
    }

    const body = bodyResult.data;
    if (shouldUseStreaming(options.definitionRegistry, body)) {
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive"
      });

      await options.orchestrator.stream(body, {
        requestId: request.id,
        onEvent: async (event) => {
          if (reply.raw.destroyed) {
            return;
          }

          sendSseEvent(reply, event);
        }
      });

      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
      return reply;
    }

    const response = await options.orchestrator.execute(body, {
      requestId: request.id
    });
    return response;
  });

  return app;
}
