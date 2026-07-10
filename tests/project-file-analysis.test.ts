import assert from "node:assert/strict";
import test from "node:test";

import { ProjectFileAnalysisService, SoulPipeline, TaskPlanner } from "../src";
import type { McpGateway, McpGatewayRequest, ProjectFileSnapshot } from "../src";

test("ProjectFileAnalysisService reads files through Filesystem MCP gateway", async () => {
  const gateway = new FakeMcpGateway({
    "src/index.ts": {
      path: "src/index.ts",
      content: "export const platformName = 'ai-assistant-platform';"
    }
  });
  const service = new ProjectFileAnalysisService(
    gateway,
    new TaskPlanner(),
    new SoulPipeline({
      async execute(input) {
        return `${input.soul}: ${input.memoryContext}`;
      }
    })
  );

  const response = await service.analyze({
    projectId: "ai-assistant-platform",
    allowedRoot: "/workspace/ai-assistant-platform",
    relativePaths: ["src/index.ts"],
    question: "핵심 진입점 분석"
  });

  assert.deepEqual(response.filesRead, ["src/index.ts"]);
  assert.match(response.answer, /coder:/);
  assert.match(response.answer, /platformName/);
  assert.deepEqual(gateway.calls, [
    {
      kind: "filesystem",
      operation: "file:read",
      input: {
        allowedRoot: "/workspace/ai-assistant-platform",
        relativePath: "src/index.ts"
      }
    }
  ]);
});

test("ProjectFileAnalysisService rejects unsafe paths before MCP execution", async () => {
  const gateway = new FakeMcpGateway({});
  const service = new ProjectFileAnalysisService(
    gateway,
    new TaskPlanner(),
    new SoulPipeline({
      async execute() {
        return "unused";
      }
    })
  );

  await assert.rejects(
    () =>
      service.analyze({
        projectId: "ai-assistant-platform",
        allowedRoot: "/workspace/ai-assistant-platform",
        relativePaths: ["../secret.env"],
        question: "분석"
      }),
    /Unsafe project file path/
  );
  assert.deepEqual(gateway.calls, []);
});

class FakeMcpGateway implements McpGateway {
  readonly calls: Array<McpGatewayRequest> = [];

  constructor(private readonly files: Record<string, ProjectFileSnapshot>) {}

  async execute<TInput, TOutput>(
    request: McpGatewayRequest<TInput>
  ): Promise<TOutput> {
    this.calls.push(request);
    const input = request.input as { relativePath?: string };
    const snapshot = input.relativePath
      ? this.files[input.relativePath]
      : undefined;

    if (!snapshot) {
      throw new Error("File not found in fake gateway.");
    }

    return snapshot as TOutput;
  }
}
