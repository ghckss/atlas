import { TaskPlanner } from "./task-planner";
import { SoulPipeline } from "./soul-pipeline";

export interface NewsArticle {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
}

export interface NewsBriefingRequest {
  articles: readonly NewsArticle[];
  audience: "personal" | "team";
  locale: "ko" | "en";
}

export interface NewsBriefingResponse {
  shouldSend: boolean;
  discordMessage: string;
  discordMessages: readonly string[];
  articleCount: number;
}

const DISCORD_MESSAGE_LIMIT = 2000;
const LOCAL_TEMPLATE_MARKER = "로컬 MVP 런타임 응답입니다.";

export class HermesNewsBriefingService {
  constructor(
    private readonly planner: TaskPlanner,
    private readonly soulPipeline: SoulPipeline
  ) {}

  async summarize(
    request: NewsBriefingRequest
  ): Promise<NewsBriefingResponse> {
    if (request.articles.length === 0) {
      return {
        shouldSend: false,
        discordMessage: "",
        discordMessages: [],
        articleCount: 0
      };
    }

    const plan = this.planner.plan({
      request: "이번 뉴스 브리핑을 조사하고 요약해줘"
    });
    const pipeline = await this.soulPipeline.run({
      plan,
      memoryContext: formatArticles(request.articles)
    });
    const output = isLocalTemplateOutput(pipeline.finalOutput)
      ? formatCompactBriefing(request.articles, request.locale)
      : pipeline.finalOutput;
    const discordMessages = splitDiscordMessages(output);

    return {
      shouldSend: discordMessages.length > 0,
      discordMessage: discordMessages[0] ?? "",
      discordMessages,
      articleCount: request.articles.length
    };
  }
}

function splitDiscordMessages(value: string): readonly string[] {
  const message = value.trim();

  if (!message) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";

  for (const line of message.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= DISCORD_MESSAGE_LIMIT) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    chunks.push(...splitLongLine(line));
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitLongLine(value: string): readonly string[] {
  if (value.length <= DISCORD_MESSAGE_LIMIT) {
    return [value];
  }

  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += DISCORD_MESSAGE_LIMIT) {
    chunks.push(value.slice(index, index + DISCORD_MESSAGE_LIMIT));
  }

  return chunks;
}

function isLocalTemplateOutput(value: string): boolean {
  return value.includes(LOCAL_TEMPLATE_MARKER);
}

function formatCompactBriefing(
  articles: readonly NewsArticle[],
  locale: NewsBriefingRequest["locale"]
): string {
  const title =
    locale === "ko"
      ? `오늘의 뉴스 브리핑 (${formatBriefingDate(new Date())})`
      : `News Briefing (${formatBriefingDate(new Date())})`;
  const entries = articles.map((article, index) => {
    const source = article.source ? ` (${article.source})` : "";

    return `${index + 1}. [${escapeMarkdownLinkText(article.title)}](${article.url})${source}`;
  });

  return [title, ...entries].filter(Boolean).join("\n");
}

function formatBriefingDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}

function formatArticles(articles: readonly NewsArticle[]): string {
  return articles
    .map((article, index) => {
      const source = article.source ? `source=${article.source}` : undefined;

      return [`${index + 1}. ${article.title}`, source, article.url]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
