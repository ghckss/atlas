import type { McpGateway } from "../ports";
import { SoulPipeline } from "./soul-pipeline";
import { TaskPlanner } from "./task-planner";

export interface GitHubRepositoryContextRequest {
  owner: string;
  repo: string;
  question: string;
}

export interface GitHubRepositoryContext {
  name: string;
  defaultBranch?: string;
  description?: string;
  openPullRequests?: number;
  openIssues?: number;
}

export interface GitHubAssistantResponse {
  repository: string;
  answer: string;
}

export class GitHubAssistantService {
  constructor(
    private readonly mcpGateway: McpGateway,
    private readonly planner: TaskPlanner,
    private readonly soulPipeline: SoulPipeline
  ) {}

  async answerRepositoryQuestion(
    request: GitHubRepositoryContextRequest
  ): Promise<GitHubAssistantResponse> {
    const repository = await this.mcpGateway.execute<
      { owner: string; repo: string },
      GitHubRepositoryContext
    >({
      kind: "github",
      operation: "repository:read",
      input: {
        owner: request.owner,
        repo: request.repo
      }
    });
    const plan = this.planner.plan({
      request: `GitHub repository analysis: ${request.question}`
    });
    const result = await this.soulPipeline.run({
      plan,
      memoryContext: formatRepositoryContext(repository)
    });

    return {
      repository: `${request.owner}/${request.repo}`,
      answer: result.finalOutput
    };
  }
}

function formatRepositoryContext(repository: GitHubRepositoryContext): string {
  return [
    `[GitHub Repository: ${repository.name}]`,
    repository.defaultBranch ? `defaultBranch=${repository.defaultBranch}` : undefined,
    repository.description ? `description=${repository.description}` : undefined,
    typeof repository.openPullRequests === "number"
      ? `openPullRequests=${repository.openPullRequests}`
      : undefined,
    typeof repository.openIssues === "number"
      ? `openIssues=${repository.openIssues}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n");
}
