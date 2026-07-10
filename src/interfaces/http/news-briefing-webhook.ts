import type {
  HermesNewsBriefingService,
  NewsArticle,
  NewsBriefingResponse
} from "../../application";

export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface WebhookResponse {
  status: number;
  body: unknown;
}

export interface NewsBriefingWebhookBody {
  articles: readonly NewsArticle[];
  audience?: "personal" | "team";
  locale?: "ko" | "en";
}

export function createNewsBriefingWebhookHandler(
  service: HermesNewsBriefingService,
  secret: string
): (request: WebhookRequest) => Promise<WebhookResponse> {
  if (!secret) {
    throw new Error("N8N webhook secret is required.");
  }

  return async (request) => {
    if (request.headers["x-n8n-webhook-secret"] !== secret) {
      return {
        status: 401,
        body: {
          error: "unauthorized"
        }
      };
    }

    const body = parseBody(request.body);

    if (!body) {
      return {
        status: 400,
        body: {
          error: "invalid_news_briefing_payload"
        }
      };
    }

    const result = await service.summarize({
      articles: body.articles,
      audience: body.audience ?? "personal",
      locale: body.locale ?? "ko"
    });

    return toWebhookResponse(result);
  };
}

function parseBody(body: unknown): NewsBriefingWebhookBody | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const value = body as {
    articles?: unknown;
    audience?: unknown;
    locale?: unknown;
  };

  if (!Array.isArray(value.articles) || !value.articles.every(isNewsArticle)) {
    return undefined;
  }

  if (
    value.audience !== undefined &&
    value.audience !== "personal" &&
    value.audience !== "team"
  ) {
    return undefined;
  }

  if (value.locale !== undefined && value.locale !== "ko" && value.locale !== "en") {
    return undefined;
  }

  return {
    articles: value.articles,
    audience: value.audience,
    locale: value.locale
  };
}

function isNewsArticle(value: unknown): value is NewsArticle {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const article = value as {
    title?: unknown;
    url?: unknown;
  };

  return typeof article.title === "string" && typeof article.url === "string";
}

function toWebhookResponse(result: NewsBriefingResponse): WebhookResponse {
  return {
    status: 200,
    body: result
  };
}
