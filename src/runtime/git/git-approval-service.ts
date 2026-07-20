import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface GitApprovalServiceOptions {
  enabled?: boolean;
  workdir?: string;
  workspaceRoots?: readonly string[];
  remote?: string;
  defaultCommitMessage?: string;
  commandExecutor?: GitCommandExecutor;
  repositoryFinder?: GitRepositoryFinder;
}

export interface GitCommandExecutorInput {
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}

export interface GitCommandExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string;
  timedOut?: boolean;
}

export type GitCommandExecutor = (
  input: GitCommandExecutorInput
) => Promise<GitCommandExecutorResult>;

export type GitRepositoryFinder = (
  roots: readonly string[]
) => Promise<readonly string[]>;

export interface GitApprovalRepositorySnapshot {
  workdir: string;
  branch?: string;
  statusLines: readonly string[];
  reason?: string;
}

export interface GitApprovalSnapshot {
  enabled: boolean;
  workdir?: string;
  workspaceRoots?: readonly string[];
  repositories: readonly GitApprovalRepositorySnapshot[];
  branch?: string;
  statusLines: readonly string[];
  reason?: string;
}

export interface GitApprovalRequestMetadata {
  messageId: string;
  requesterUserId: string;
}

export interface GitApprovalApproveInput {
  approverUserId: string;
  commitMessage?: string;
}

export interface GitApprovalApproveResult {
  status:
    | "disabled"
    | "no-pending"
    | "blocked"
    | "no-changes"
    | "pushed"
    | "push-failed";
  content: string;
}

interface PendingGitApproval {
  sourceMessageId: string;
  requesterUserId: string;
  createdAt: string;
  statusCount: number;
  repositories: readonly PendingGitApprovalRepository[];
}

interface PendingGitApprovalRepository {
  approvable: boolean;
  workdir: string;
  branch?: string;
  statusCount: number;
  reason?: string;
  committedHash?: string;
}

const DEFAULT_REMOTE = "origin";
const DEFAULT_COMMIT_MESSAGE = "chore: apply Discord-approved changes";
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_CAPTURE_BYTES = 65536;
const REPOSITORY_DISCOVERY_MAX_DEPTH = 5;
const SKIPPED_DISCOVERY_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor"
]);

export class GitApprovalService {
  private readonly enabled: boolean;
  private readonly workdir?: string;
  private readonly workspaceRoots: readonly string[];
  private readonly remote: string;
  private readonly defaultCommitMessage: string;
  private readonly commandExecutor: GitCommandExecutor;
  private readonly repositoryFinder: GitRepositoryFinder;
  private pending?: PendingGitApproval;

  constructor(options: GitApprovalServiceOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.workdir = options.workdir?.trim() || undefined;
    this.workspaceRoots = uniquePaths(options.workspaceRoots ?? []);
    this.remote = options.remote?.trim() || DEFAULT_REMOTE;
    this.defaultCommitMessage =
      normalizeCommitMessage(options.defaultCommitMessage) ??
      DEFAULT_COMMIT_MESSAGE;
    this.commandExecutor = options.commandExecutor ?? runGitCommand;
    this.repositoryFinder = options.repositoryFinder ?? findGitRepositories;
  }

  async captureBeforeRequest(): Promise<GitApprovalSnapshot> {
    if (!this.enabled) {
      return {
        enabled: false,
        repositories: [],
        statusLines: [],
        reason: "git approval disabled"
      };
    }

    if (!this.hasConfiguredTargets()) {
      return {
        enabled: false,
        workspaceRoots: this.workspaceRoots,
        repositories: [],
        statusLines: [],
        reason: "git approval workdir or workspace roots missing"
      };
    }

    try {
      const workdirs = await this.resolveWorkdirs();
      const repositories = await this.captureRepositories(workdirs);
      const trackedRepositories = repositories.filter(
        (repository) => repository.reason === undefined
      );
      const firstRepository = trackedRepositories[0];

      if (trackedRepositories.length === 0) {
        return {
          enabled: false,
          workdir: this.workdir,
          workspaceRoots: this.workspaceRoots,
          repositories,
          statusLines: [],
          reason: "no git repositories found for git approval"
        };
      }

      return {
        enabled: true,
        workdir: firstRepository?.workdir,
        workspaceRoots: this.workspaceRoots,
        repositories: trackedRepositories,
        branch: firstRepository?.branch,
        statusLines: flattenStatusLines(trackedRepositories)
      };
    } catch (error) {
      return {
        enabled: false,
        workdir: this.workdir,
        workspaceRoots: this.workspaceRoots,
        repositories: [],
        statusLines: [],
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async recordRequestResult(
    snapshot: GitApprovalSnapshot,
    metadata: GitApprovalRequestMetadata
  ): Promise<void> {
    if (!snapshot.enabled || !this.enabled || !this.hasConfiguredTargets()) {
      return;
    }

    const beforeByWorkdir = new Map(
      snapshot.repositories.map((repository) => [repository.workdir, repository])
    );
    const repositories = await this.captureRepositories(await this.resolveWorkdirs());
    const changedRepositories: PendingGitApprovalRepository[] = [];

    for (const repository of repositories) {
      if (repository.reason) {
        continue;
      }

      const before = beforeByWorkdir.get(repository.workdir);

      if (!before) {
        if (repository.statusLines.length > 0) {
          changedRepositories.push({
            approvable: false,
            workdir: repository.workdir,
            branch: repository.branch,
            statusCount: repository.statusLines.length,
            reason: "repository was not tracked before the bot request"
          });
        }
        continue;
      }

      if (sameStatus(before.statusLines, repository.statusLines)) {
        continue;
      }

      changedRepositories.push({
        approvable: before.statusLines.length === 0,
        workdir: repository.workdir,
        branch: repository.branch,
        statusCount: repository.statusLines.length,
        reason:
          before.statusLines.length === 0
            ? undefined
            : "worktree was already dirty before the bot request"
      });
    }

    if (changedRepositories.length === 0) {
      return;
    }

    this.pending = {
      sourceMessageId: metadata.messageId,
      requesterUserId: metadata.requesterUserId,
      createdAt: new Date().toISOString(),
      statusCount: changedRepositories.reduce(
        (sum, repository) => sum + repository.statusCount,
        0
      ),
      repositories: changedRepositories
    };
  }

  async approve(
    input: GitApprovalApproveInput
  ): Promise<GitApprovalApproveResult> {
    if (!this.enabled || !this.hasConfiguredTargets()) {
      return {
        status: "disabled",
        content:
          "Git 승인 기능이 비활성화되어 있습니다. `.env`의 `DISCORD_GIT_APPROVAL_ENABLED=true`와 workdir 또는 workspace roots 설정을 확인해주세요."
      };
    }

    if (!this.pending) {
      return {
        status: "no-pending",
        content: "승인 대기 중인 봇 작업이 없습니다."
      };
    }

    const blockedRepositories = this.pending.repositories.filter(
      (repository) => !repository.approvable
    );

    if (blockedRepositories.length > 0) {
      return {
        status: "blocked",
        content: [
          "이 작업은 자동 commit/push 대상이 아닙니다. 봇 요청 전에 이미 변경사항이 있거나 스냅샷되지 않은 저장소가 있어 기존 변경과 분리할 수 없습니다.",
          formatRepositorySummary(blockedRepositories)
        ].join("\n")
      };
    }

    const currentStatuses = await Promise.all(
      this.pending.repositories.map(async (repository) => ({
        repository,
        statusLines: await this.statusLines(repository.workdir)
      }))
    );
    const repositoriesWithChanges = currentStatuses.filter(
      ({ repository, statusLines }) =>
        statusLines.length > 0 || repository.committedHash
    );

    if (repositoriesWithChanges.length === 0) {
      this.pending = undefined;
      return {
        status: "no-changes",
        content: "commit할 변경사항이 없습니다."
      };
    }

    const commitMessage =
      normalizeCommitMessage(input.commitMessage) ?? this.defaultCommitMessage;
    const committedRepositories: PendingGitApprovalRepository[] = [];

    for (const { repository, statusLines } of repositoriesWithChanges) {
      const branch = await this.currentBranch(repository.workdir);
      let committedHash = repository.committedHash;

      if (!committedHash && statusLines.length > 0) {
        await this.git(repository.workdir, ["add", "-A"]);
        await this.git(repository.workdir, ["commit", "-m", commitMessage]);
        committedHash = (
          await this.git(repository.workdir, ["rev-parse", "--short", "HEAD"])
        ).stdout.trim();
      }

      committedRepositories.push({
        ...repository,
        branch,
        committedHash
      });
    }

    this.pending = {
      ...this.pending,
      repositories: committedRepositories
    };

    try {
      for (const repository of committedRepositories) {
        await this.git(repository.workdir, ["push", this.remote, "HEAD"]);
      }
      this.pending = undefined;

      return {
        status: "pushed",
        content: formatPushedContent(this.remote, committedRepositories)
      };
    } catch (error) {
      return {
        status: "push-failed",
        content: [
          `commit은 완료됐지만 push에 실패했습니다.`,
          formatRepositorySummary(committedRepositories),
          error instanceof Error ? error.message : String(error)
        ].join("\n")
      };
    }
  }

  private hasConfiguredTargets(): boolean {
    return this.workspaceRoots.length > 0 || this.workdir !== undefined;
  }

  private async resolveWorkdirs(): Promise<readonly string[]> {
    if (this.workspaceRoots.length > 0) {
      return uniquePaths(await this.repositoryFinder(this.workspaceRoots));
    }

    return this.workdir ? [this.workdir] : [];
  }

  private async captureRepositories(
    workdirs: readonly string[]
  ): Promise<readonly GitApprovalRepositorySnapshot[]> {
    const repositories: GitApprovalRepositorySnapshot[] = [];

    for (const workdir of workdirs) {
      try {
        repositories.push({
          workdir,
          branch: await this.currentBranch(workdir),
          statusLines: await this.statusLines(workdir)
        });
      } catch (error) {
        repositories.push({
          workdir,
          statusLines: [],
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return repositories;
  }

  private async statusLines(workdir: string): Promise<readonly string[]> {
    const result = await this.git(workdir, ["status", "--porcelain=v1"]);

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
  }

  private async currentBranch(workdir: string): Promise<string> {
    const result = await this.git(workdir, ["rev-parse", "--abbrev-ref", "HEAD"]);

    return result.stdout.trim() || "HEAD";
  }

  private async git(
    workdir: string,
    args: readonly string[]
  ): Promise<GitCommandExecutorResult> {
    const result = await this.commandExecutor({
      args,
      cwd: workdir,
      timeoutMs: DEFAULT_TIMEOUT_MS
    });

    if (result.exitCode !== 0) {
      throw new Error(formatGitFailure(args, result));
    }

    return result;
  }
}

function uniquePaths(paths: readonly string[]): readonly string[] {
  return [
    ...new Set(
      paths
        .map((path) => path.trim())
        .filter((path) => path.length > 0)
        .map((path) => resolve(path))
    )
  ];
}

function flattenStatusLines(
  repositories: readonly GitApprovalRepositorySnapshot[]
): readonly string[] {
  return repositories.flatMap((repository) =>
    repository.statusLines.map((line) => `${repository.workdir}:${line}`)
  );
}

function sameStatus(
  before: readonly string[],
  after: readonly string[]
): boolean {
  return before.join("\n") === after.join("\n");
}

function normalizeCommitMessage(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized || undefined;
}

async function findGitRepositories(
  roots: readonly string[]
): Promise<readonly string[]> {
  const repositories: string[] = [];

  for (const root of roots) {
    await collectGitRepositories(root, 0, repositories);
  }

  return uniquePaths(repositories);
}

async function collectGitRepositories(
  directory: string,
  depth: number,
  repositories: string[]
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((entry) => entry.isDirectory() && entry.name === ".git")) {
    repositories.push(resolve(directory));
    return;
  }

  if (depth >= REPOSITORY_DISCOVERY_MAX_DEPTH) {
    return;
  }

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      SKIPPED_DISCOVERY_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }

    await collectGitRepositories(resolve(directory, entry.name), depth + 1, repositories);
  }
}

function formatPushedContent(
  remote: string,
  repositories: readonly PendingGitApprovalRepository[]
): string {
  if (repositories.length === 1) {
    const repository = repositories[0];

    return `작업 승인 완료: ${repository.workdir}에서 commit ${repository.committedHash ?? "unknown"} 후 ${remote}/${repository.branch ?? "HEAD"}로 push했습니다.`;
  }

  return [
    `작업 승인 완료: ${repositories.length}개 저장소를 commit 후 push했습니다.`,
    formatRepositorySummary(repositories)
  ].join("\n");
}

function formatRepositorySummary(
  repositories: readonly PendingGitApprovalRepository[]
): string {
  return repositories
    .map((repository) =>
      [
        `- ${repository.workdir}`,
        repository.branch ? `branch=${repository.branch}` : undefined,
        repository.committedHash ? `commit=${repository.committedHash}` : undefined,
        `changes=${repository.statusCount}`,
        repository.reason ? `reason=${repository.reason}` : undefined
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

async function runGitCommand(
  input: GitCommandExecutorInput
): Promise<GitCommandExecutorResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
        signal: signal ?? undefined,
        timedOut
      });
    });
  });
}

function appendLimited(current: string, next: string): string {
  const combined = `${current}${next}`;

  if (Buffer.byteLength(combined) <= MAX_CAPTURE_BYTES) {
    return combined;
  }

  return combined.slice(-MAX_CAPTURE_BYTES);
}

function formatGitFailure(
  args: readonly string[],
  result: GitCommandExecutorResult
): string {
  if (result.timedOut) {
    return `git ${args.join(" ")} timed out.`;
  }

  const detail = result.stderr.trim() || result.stdout.trim();
  const suffix = detail ? `: ${detail.slice(0, 500)}` : "";

  return `git ${args.join(" ")} failed with exit code ${result.exitCode}${suffix}`;
}
