import { spawn } from "node:child_process";

export interface GitApprovalServiceOptions {
  enabled?: boolean;
  workdir?: string;
  remote?: string;
  defaultCommitMessage?: string;
  commandExecutor?: GitCommandExecutor;
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

export interface GitApprovalSnapshot {
  enabled: boolean;
  workdir?: string;
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
  approvable: boolean;
  sourceMessageId: string;
  requesterUserId: string;
  createdAt: string;
  branch?: string;
  statusCount: number;
  reason?: string;
  committedHash?: string;
}

const DEFAULT_REMOTE = "origin";
const DEFAULT_COMMIT_MESSAGE = "chore: apply Discord-approved changes";
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_CAPTURE_BYTES = 65536;

export class GitApprovalService {
  private readonly enabled: boolean;
  private readonly workdir?: string;
  private readonly remote: string;
  private readonly defaultCommitMessage: string;
  private readonly commandExecutor: GitCommandExecutor;
  private pending?: PendingGitApproval;

  constructor(options: GitApprovalServiceOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.workdir = options.workdir?.trim() || undefined;
    this.remote = options.remote?.trim() || DEFAULT_REMOTE;
    this.defaultCommitMessage =
      normalizeCommitMessage(options.defaultCommitMessage) ??
      DEFAULT_COMMIT_MESSAGE;
    this.commandExecutor = options.commandExecutor ?? runGitCommand;
  }

  async captureBeforeRequest(): Promise<GitApprovalSnapshot> {
    if (!this.enabled) {
      return {
        enabled: false,
        statusLines: [],
        reason: "git approval disabled"
      };
    }

    if (!this.workdir) {
      return {
        enabled: false,
        statusLines: [],
        reason: "git approval workdir missing"
      };
    }

    try {
      return {
        enabled: true,
        workdir: this.workdir,
        branch: await this.currentBranch(),
        statusLines: await this.statusLines()
      };
    } catch (error) {
      return {
        enabled: false,
        workdir: this.workdir,
        statusLines: [],
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async recordRequestResult(
    snapshot: GitApprovalSnapshot,
    metadata: GitApprovalRequestMetadata
  ): Promise<void> {
    if (!snapshot.enabled || !this.enabled || !this.workdir) {
      return;
    }

    const statusLines = await this.statusLines();

    if (sameStatus(snapshot.statusLines, statusLines)) {
      return;
    }

    this.pending = {
      approvable: snapshot.statusLines.length === 0,
      sourceMessageId: metadata.messageId,
      requesterUserId: metadata.requesterUserId,
      createdAt: new Date().toISOString(),
      branch: await this.currentBranch(),
      statusCount: statusLines.length,
      reason:
        snapshot.statusLines.length === 0
          ? undefined
          : "worktree was already dirty before the bot request"
    };
  }

  async approve(
    input: GitApprovalApproveInput
  ): Promise<GitApprovalApproveResult> {
    if (!this.enabled || !this.workdir) {
      return {
        status: "disabled",
        content:
          "Git 승인 기능이 비활성화되어 있습니다. `.env`의 `DISCORD_GIT_APPROVAL_ENABLED=true`와 workdir 설정을 확인해주세요."
      };
    }

    if (!this.pending) {
      return {
        status: "no-pending",
        content: "승인 대기 중인 봇 작업이 없습니다."
      };
    }

    if (!this.pending.approvable) {
      return {
        status: "blocked",
        content:
          "이 작업은 자동 commit/push 대상이 아닙니다. 봇 요청 전에 이미 변경사항이 있어 기존 변경과 분리할 수 없습니다."
      };
    }

    const statusLines = await this.statusLines();

    if (statusLines.length === 0 && !this.pending.committedHash) {
      this.pending = undefined;
      return {
        status: "no-changes",
        content: "commit할 변경사항이 없습니다."
      };
    }

    const commitMessage =
      normalizeCommitMessage(input.commitMessage) ?? this.defaultCommitMessage;
    const branch = await this.currentBranch();
    let committedHash = this.pending.committedHash;

    if (!committedHash) {
      await this.git(["add", "-A"]);
      await this.git(["commit", "-m", commitMessage]);
      committedHash = (await this.git(["rev-parse", "--short", "HEAD"])).stdout.trim();
      this.pending = {
        ...this.pending,
        branch,
        committedHash
      };
    }

    try {
      await this.git(["push", this.remote, "HEAD"]);
      this.pending = undefined;

      return {
        status: "pushed",
        content: `작업 승인 완료: commit ${committedHash} 후 ${this.remote}/${branch}로 push했습니다.`
      };
    } catch (error) {
      return {
        status: "push-failed",
        content: [
          `commit ${committedHash}는 완료됐지만 push에 실패했습니다.`,
          error instanceof Error ? error.message : String(error)
        ].join("\n")
      };
    }
  }

  private async statusLines(): Promise<readonly string[]> {
    const result = await this.git(["status", "--porcelain=v1"]);

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
  }

  private async currentBranch(): Promise<string> {
    const result = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);

    return result.stdout.trim() || "HEAD";
  }

  private async git(args: readonly string[]): Promise<GitCommandExecutorResult> {
    if (!this.workdir) {
      throw new Error("Git approval workdir is not configured.");
    }

    const result = await this.commandExecutor({
      args,
      cwd: this.workdir,
      timeoutMs: DEFAULT_TIMEOUT_MS
    });

    if (result.exitCode !== 0) {
      throw new Error(formatGitFailure(args, result));
    }

    return result;
  }
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
