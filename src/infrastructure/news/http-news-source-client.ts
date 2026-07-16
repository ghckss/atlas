import type { NewsArticle } from "../../application";

export interface NewsSourceClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface NewsCollectionRequest {
  sourceUrls?: readonly string[];
  providers?: readonly string[];
  query?: string;
  googleLanguage?: string;
  googleCountry?: string;
  maxArticles?: number;
}

export class HttpNewsSourceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: NewsSourceClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async collect(
    request: NewsCollectionRequest | readonly string[]
  ): Promise<readonly NewsArticle[]> {
    const normalized: NewsCollectionRequest = Array.isArray(request)
      ? {
          sourceUrls: request as readonly string[],
          providers: ["source-url"]
        }
      : (request as NewsCollectionRequest);
    const sourceUrls = normalized.sourceUrls ?? [];
    const providers = new Set(normalized.providers ?? []);
    const query = normalized.query?.trim();
    const tasks = sourceUrls.map((sourceUrl) => this.fetchSource(sourceUrl));

    if (providers.has("google-news-top")) {
      tasks.push(
        this.fetchGoogleTopNews({
          language: normalized.googleLanguage ?? "ko",
          country: normalized.googleCountry ?? "KR"
        })
      );
    }

    if (query && providers.has("google-news")) {
      tasks.push(
        this.fetchGoogleNews({
          query,
          language: normalized.googleLanguage ?? "ko",
          country: normalized.googleCountry ?? "KR"
        })
      );
    }

    const results = await Promise.all(tasks);

    return deduplicateArticles(results.flat()).slice(
      0,
      normalized.maxArticles ?? Number.POSITIVE_INFINITY
    );
  }

  private async fetchSource(sourceUrl: string): Promise<readonly NewsArticle[]> {
    const responseText = await this.fetchText(sourceUrl);
    const trimmed = responseText.trim();

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return readJsonArticles(JSON.parse(trimmed), sourceUrl);
    }

    return readRssArticles(responseText, sourceUrl);
  }

  private async fetchGoogleNews(options: {
    query: string;
    language: string;
    country: string;
  }): Promise<readonly NewsArticle[]> {
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", options.query);
    url.searchParams.set("hl", options.language);
    url.searchParams.set("gl", options.country);
    url.searchParams.set("ceid", `${options.country}:${options.language}`);

    return readRssArticles(await this.fetchText(url.toString()), "google-news");
  }

  private async fetchGoogleTopNews(options: {
    language: string;
    country: string;
  }): Promise<readonly NewsArticle[]> {
    const url = new URL("https://news.google.com/rss");
    url.searchParams.set("hl", options.language);
    url.searchParams.set("gl", options.country);
    url.searchParams.set("ceid", `${options.country}:${options.language}`);

    return readRssArticles(
      await this.fetchText(url.toString()),
      "google-news-top"
    );
  }

  private async fetchText(
    sourceUrl: string,
    headers: Record<string, string> = {}
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(sourceUrl, {
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`News source failed with ${response.status}: ${sourceUrl}`);
      }

      return response.text();
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

function readJsonArticles(
  payload: unknown,
  fallbackSource: string
): readonly NewsArticle[] {
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

  return rawArticles.flatMap((value) => toJsonNewsArticle(value, fallbackSource));
}

function readRssArticles(xml: string, fallbackSource: string): readonly NewsArticle[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(
    ([, item]) => {
      const title = cleanText(readXmlTag(item, "title"));
      const url = cleanText(readXmlTag(item, "link"));

      if (!title || !url) {
        return [];
      }

      return [
        {
          title,
          url,
          source: cleanText(readXmlTag(item, "source")) || fallbackSource,
          publishedAt: cleanText(readXmlTag(item, "pubDate")) || undefined,
          summary: cleanText(readXmlTag(item, "description")) || undefined
        }
      ];
    }
  );
}

function toJsonNewsArticle(value: unknown, fallbackSource: string): NewsArticle[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const article = value as {
    title?: unknown;
    url?: unknown;
    link?: unknown;
    originallink?: unknown;
    source?: unknown;
    publishedAt?: unknown;
    published_at?: unknown;
    pubDate?: unknown;
    summary?: unknown;
    description?: unknown;
  };
  const title = readCleanString(article.title);
  const url =
    readCleanString(article.originallink) ??
    readCleanString(article.url) ??
    readCleanString(article.link);

  if (!title || !url) {
    return [];
  }

  return [
    {
      title,
      url,
      source: readCleanString(article.source) ?? fallbackSource,
      publishedAt:
        readCleanString(article.publishedAt) ??
        readCleanString(article.published_at) ??
        readCleanString(article.pubDate),
      summary:
        readCleanString(article.summary) ?? readCleanString(article.description)
    }
  ];
}

function deduplicateArticles(
  articles: readonly NewsArticle[]
): readonly NewsArticle[] {
  const seen = new Set<string>();

  return articles.filter((article) => {
    const key = article.url || article.title;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function readXmlTag(value: string, tagName: string): string | undefined {
  const match = value.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i")
  );

  return match?.[1];
}

function readCleanString(value: unknown): string | undefined {
  return typeof value === "string" ? cleanText(value) || undefined : undefined;
}

function cleanText(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return decodeXmlEntities(
    decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
      .replace(/<[^>]+>/g, "")
      .replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}
