import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { RuntimeConfig } from "../config/runtime-config";
import { roleFromRuntimeInput } from "../config/runtime-config";
import type { LocalRuntime } from "../create-runtime";
import {
  createNewsBriefingWebhookHandler,
  routeDiscordMessage
} from "../../interfaces";

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
    return handleDiscordMessage(request.body, runtime);
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

async function handleDiscordMessage(
  body: unknown,
  runtime: LocalRuntime
): Promise<RuntimeHttpResponse> {
  if (!isDiscordMessageBody(body)) {
    return {
      status: 400,
      body: {
        error: "invalid_discord_message_payload"
      }
    };
  }

  const route = routeDiscordMessage(
    {
      id: body.id,
      authorId: body.authorId,
      channelId: body.channelId,
      content: body.content,
      isBot: body.isBot ?? false,
      isDirectMessage: body.isDirectMessage ?? false,
      mentionedUserIds: body.mentionedUserIds ?? []
    },
    runtime.discord
  );

  if (route.kind === "ignore") {
    return {
      status: 202,
      body: route
    };
  }

  if (route.kind === "admin-dm") {
    return {
      status: 200,
      body: {
        kind: "admin-dm",
        content: "관리자 DM은 로컬 MVP에서 수신 확인까지만 처리합니다."
      }
    };
  }

  const response = await runtime.chat.respond({
    sessionId: body.sessionId ?? body.channelId,
    user: {
      id: body.authorId,
      role: roleFromRuntimeInput(body.userRole)
    },
    projectId: body.projectId,
    content: route.content
  });

  return {
    status: 200,
    body: {
      kind: "chat",
      answer: response.answer,
      memoryCount: response.memoryCount,
      souls: response.pipeline.steps.map((step) => step.step.soul)
    }
  };
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

function isDiscordMessageBody(body: unknown): body is {
  id: string;
  authorId: string;
  channelId: string;
  content: string;
  isBot?: boolean;
  isDirectMessage?: boolean;
  mentionedUserIds?: readonly string[];
  sessionId?: string;
  projectId?: string;
  userRole?: unknown;
} {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const value = body as {
    id?: unknown;
    authorId?: unknown;
    channelId?: unknown;
    content?: unknown;
    mentionedUserIds?: unknown;
  };

  return (
    typeof value.id === "string" &&
    typeof value.authorId === "string" &&
    typeof value.channelId === "string" &&
    typeof value.content === "string" &&
    (value.mentionedUserIds === undefined ||
      (Array.isArray(value.mentionedUserIds) &&
        value.mentionedUserIds.every((id) => typeof id === "string")))
  );
}
