import type { McpGateway } from "../ports";
import { SoulPipeline } from "./soul-pipeline";
import { TaskPlanner } from "./task-planner";

export interface ProjectFileAnalysisRequest {
  projectId: string;
  allowedRoot: string;
  relativePaths: readonly string[];
  question: string;
}

export interface ProjectFileSnapshot {
  path: string;
  content: string;
}

export interface ProjectFileAnalysisResponse {
  filesRead: readonly string[];
  answer: string;
}

interface FilesystemReadInput {
  allowedRoot: string;
  relativePath: string;
}

export class ProjectFileAnalysisService {
  constructor(
    private readonly mcpGateway: McpGateway,
    private readonly planner: TaskPlanner,
    private readonly soulPipeline: SoulPipeline
  ) {}

  async analyze(
    request: ProjectFileAnalysisRequest
  ): Promise<ProjectFileAnalysisResponse> {
    const relativePaths = request.relativePaths.map(assertSafeRelativePath);
    const snapshots = await Promise.all(
      relativePaths.map((relativePath) =>
        this.mcpGateway.execute<FilesystemReadInput, ProjectFileSnapshot>({
          kind: "filesystem",
          operation: "file:read",
          input: {
            allowedRoot: request.allowedRoot,
            relativePath
          }
        })
      )
    );
    const plan = this.planner.plan({
      request: `프로젝트 파일 분석: ${request.question}`
    });
    const result = await this.soulPipeline.run({
      plan,
      memoryContext: formatSnapshots(request.projectId, snapshots)
    });

    return {
      filesRead: snapshots.map((snapshot) => snapshot.path),
      answer: result.finalOutput
    };
  }
}

function assertSafeRelativePath(relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("/") ||
    relativePath.includes("..")
  ) {
    throw new Error(`Unsafe project file path: ${relativePath}`);
  }

  return relativePath;
}

function formatSnapshots(
  projectId: string,
  snapshots: readonly ProjectFileSnapshot[]
): string {
  return [
    `[Project: ${projectId}]`,
    ...snapshots.map(
      (snapshot) => `--- ${snapshot.path} ---\n${snapshot.content}`
    )
  ].join("\n\n");
}
