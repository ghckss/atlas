import assert from "node:assert/strict";
import test from "node:test";

import { GitHubAssistantService, SoulPipeline, TaskPlanner } from "../src";
import type {
  GitHubRepositoryContext,
  McpGateway,
  McpGatewayRequest
} from "../src";

test("GitHubAssistantService reads repository context through GitHub MCP gateway", async () => {
  const gateway = new FakeGitHubGateway({
    name: "ai-assistant-platform",
    defaultBranch: "master",
    description: "Hermes assistant platform",
    openPullRequests: 2,
    openIssues: 5
  });
  const service = new GitHubAssistantService(
    gateway,
    new TaskPlanner(),
    new SoulPipeline({
      async execute(input) {
        return `${input.soul}: ${input.memoryContext}`;
      }
    })
  );

  const response = await service.answerRepositoryQuestion({
    owner: "owner",
    repo: "ai-assistant-platform",
    question: "저장소 상태 분석"
  });

  assert.equal(response.repository, "owner/ai-assistant-platform");
  assert.match(response.answer, /coder:/);
  assert.match(response.answer, /openPullRequests=2/);
  assert.deepEqual(gateway.calls, [
    {
      kind: "github",
      operation: "repository:read",
      input: {
        owner: "owner",
        repo: "ai-assistant-platform"
      }
    }
  ]);
});

class FakeGitHubGateway implements McpGateway {
  readonly calls: Array<McpGatewayRequest> = [];

  constructor(private readonly repository: GitHubRepositoryContext) {}

  async execute<TInput, TOutput>(
    request: McpGatewayRequest<TInput>
  ): Promise<TOutput> {
    this.calls.push(request);
    return this.repository as TOutput;
  }
}
