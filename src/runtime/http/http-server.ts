import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { RuntimeConfig } from "../config/runtime-config";
import type { LocalRuntime } from "../create-runtime";
import { createNewsBriefingWebhookHandler } from "../../interfaces";
import { handleRuntimeDiscordMessage } from "../discord";

export interface RuntimeHttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

export interface RuntimeHttpResponse {
  status: number;
  body?: unknown;
}

export async function handleRuntimeHttpRequest(
  request: RuntimeHttpRequest,
  runtime: LocalRuntime,
  config: RuntimeConfig
): Promise<RuntimeHttpResponse> {
  if (request.method === "GET" && request.path === "/health") {
    return {
      status: 200,
      body: {
        status: "ok",
        service: "ai-assistant-platform",
        runtime: "local-mvp"
      }
    };
  }

  if (request.method === "POST" && request.path === "/discord/message") {
    return handleRuntimeDiscordMessage(request.body, runtime);
  }

  if (request.method === "GET" && request.path === "/news/articles") {
    const articles = await runtime.newsCollector.collect({
      sourceUrls: config.news.sourceUrls,
      providers: config.news.providers,
      query: config.news.query,
      googleLanguage: config.news.googleLanguage,
      googleCountry: config.news.googleCountry,
      naverClientId: config.news.naverClientId,
      naverClientSecret: config.news.naverClientSecret,
      naverDisplay: config.news.naverDisplay,
      maxArticles: config.news.maxArticles
    });

    return {
      status: 200,
      body: {
        articles
      }
    };
  }

  if (request.method === "POST" && request.path === "/webhooks/news-briefing") {
    const handler = createNewsBriefingWebhookHandler(
      runtime.newsBriefing,
      config.n8n.webhookSecret
    );

    return handler({
      headers: request.headers,
      body: request.body
    });
  }

  return {
    status: 404,
    body: {
      error: "not_found"
    }
  };
}

export function startHttpServer(
  runtime: LocalRuntime,
  config: RuntimeConfig
): ReturnType<typeof createServer> {
  const server = createServer(async (request, response) => {
    try {
      const runtimeRequest = await toRuntimeRequest(request);
      const runtimeResponse = await handleRuntimeHttpRequest(
        runtimeRequest,
        runtime,
        config
      );

      sendJson(response, runtimeResponse);
    } catch (error) {
      sendJson(response, {
        status: 500,
        body: {
          error: error instanceof Error ? error.message : "unknown_error"
        }
      });
    }
  });

  server.listen(config.port);
  return server;
}

async function toRuntimeRequest(
  request: IncomingMessage
): Promise<RuntimeHttpRequest> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  return {
    method: request.method ?? "GET",
    path: request.url?.split("?")[0] ?? "/",
    headers: normalizeHeaders(request.headers),
    body: parseJsonBody(rawBody)
  };
}

function parseJsonBody(rawBody: string): unknown {
  if (rawBody.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

function normalizeHeaders(
  headers: IncomingMessage["headers"]
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }

  return normalized;
}

function sendJson(response: ServerResponse, runtimeResponse: RuntimeHttpResponse): void {
  response.statusCode = runtimeResponse.status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(runtimeResponse.body ?? {}));
}
