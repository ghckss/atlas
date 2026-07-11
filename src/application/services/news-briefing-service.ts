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
    const discordMessage = formatDiscordMessage(pipeline.finalOutput);

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

function formatArticles(articles: readonly NewsArticle[]): string {
  return articles
    .map((article, index) => {
      const metadata = [
        article.source ? `source=${article.source}` : undefined,
        article.publishedAt ? `publishedAt=${article.publishedAt}` : undefined
      ]
        .filter(Boolean)
        .join(" ");

      return [
        `${index + 1}. ${article.title}`,
        metadata,
        article.summary,
        article.url
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
