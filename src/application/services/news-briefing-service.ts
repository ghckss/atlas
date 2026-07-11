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
  articleCount: number;
}

const DISCORD_MESSAGE_LIMIT = 2000;
const TRUNCATED_SUFFIX = "\n\n... truncated for Discord message limit";
const LOCAL_TEMPLATE_MARKER = "로컬 MVP 런타임 응답입니다.";
const COMPACT_ARTICLE_LIMIT = 5;

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
    const discordMessage = formatDiscordMessage(output);

    return {
      shouldSend: discordMessage.length > 0,
      discordMessage,
      articleCount: request.articles.length
    };
  }
}

function formatDiscordMessage(value: string): string {
  const message = value.trim();

  if (message.length <= DISCORD_MESSAGE_LIMIT) {
    return message;
  }

  return `${message.slice(0, DISCORD_MESSAGE_LIMIT - TRUNCATED_SUFFIX.length).trimEnd()}${TRUNCATED_SUFFIX}`;
}

function isLocalTemplateOutput(value: string): boolean {
  return value.includes(LOCAL_TEMPLATE_MARKER);
}

function formatCompactBriefing(
  articles: readonly NewsArticle[],
  locale: NewsBriefingRequest["locale"]
): string {
  const title = locale === "ko" ? "오늘의 뉴스 브리핑" : "News Briefing";
  const entries = articles.slice(0, COMPACT_ARTICLE_LIMIT).map((article, index) => {
    const source = article.source ? ` (${article.source})` : "";

    return `${index + 1}. [${escapeMarkdownLinkText(article.title)}](${article.url})${source}`;
  });
  const remaining = articles.length - entries.length;
  const suffix =
    remaining > 0
      ? locale === "ko"
        ? `외 ${remaining}건`
        : `${remaining} more`
      : undefined;

  return [title, "", ...entries, suffix].filter(Boolean).join("\n\n");
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
