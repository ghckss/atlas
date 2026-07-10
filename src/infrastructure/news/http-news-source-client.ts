import type { NewsArticle } from "../../application";

export interface NewsSourceClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class HttpNewsSourceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: NewsSourceClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async collect(sourceUrls: readonly string[]): Promise<readonly NewsArticle[]> {
    const results = await Promise.all(
      sourceUrls.map((sourceUrl) => this.fetchSource(sourceUrl))
    );
    const seen = new Set<string>();

    return results
      .flat()
      .filter((article) => {
        const key = article.url || article.title;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  private async fetchSource(sourceUrl: string): Promise<readonly NewsArticle[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(sourceUrl, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`News source failed with ${response.status}: ${sourceUrl}`);
      }

      return readNewsArticles(await response.json(), sourceUrl);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseNewsSourceUrls(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readNewsArticles(payload: unknown, fallbackSource: string): readonly NewsArticle[] {
  const rawArticles = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null
      ? (payload as { articles?: unknown; items?: unknown; data?: unknown })
          .articles ??
        (payload as { items?: unknown }).items ??
        (payload as { data?: unknown }).data
      : undefined;

  if (!Array.isArray(rawArticles)) {
    return [];
  }

  return rawArticles.flatMap((value) => toNewsArticle(value, fallbackSource));
}

function toNewsArticle(value: unknown, fallbackSource: string): NewsArticle[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const article = value as {
    title?: unknown;
    url?: unknown;
    link?: unknown;
    source?: unknown;
    publishedAt?: unknown;
    published_at?: unknown;
    summary?: unknown;
    description?: unknown;
  };
  const title = typeof article.title === "string" ? article.title : undefined;
  const url =
    typeof article.url === "string"
      ? article.url
      : typeof article.link === "string"
        ? article.link
        : undefined;

  if (!title || !url) {
    return [];
  }

  return [
    {
      title,
      url,
      source: typeof article.source === "string" ? article.source : fallbackSource,
      publishedAt:
        typeof article.publishedAt === "string"
          ? article.publishedAt
          : typeof article.published_at === "string"
            ? article.published_at
            : undefined,
      summary:
        typeof article.summary === "string"
          ? article.summary
          : typeof article.description === "string"
            ? article.description
            : undefined
    }
  ];
}
