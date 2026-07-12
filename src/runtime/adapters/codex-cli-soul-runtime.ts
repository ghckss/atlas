import { spawn } from "node:child_process";
import { appendFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SoulRuntime, SoulRuntimeInput } from "../../application";
import { buildSoulInstructions, buildSoulUserInput } from "./soul-runtime-prompts";

export interface CodexCliSoulRuntimeOptions {
  command?: string;
  model?: string;
  profile?: string;
  sandbox?: CodexCliSandbox;
  workingDirectory?: string;
  timeoutMs?: number;
  logFilePath?: string;
  useOss?: boolean;
  localProvider?: string;
  commandExecutor?: CodexCliCommandExecutor;
}

export type CodexCliSandbox =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

export interface CodexCliCommandExecutorInput {
  command: string;
  args: readonly string[];
  prompt: string;
  timeoutMs: number;
  workingDirectory?: string;
  outputFilePath: string;
}

export interface CodexCliCommandExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  signal?: string;
  timedOut?: boolean;
}

export type CodexCliCommandExecutor = (
  input: CodexCliCommandExecutorInput
) => Promise<CodexCliCommandExecutorResult>;

export interface CodexCliRuntimeLogEvent {
  timestamp: string;
  provider: "codex-cli";
  event: "request_start" | "request_success" | "request_error";
  command: string;
  model?: string;
  profile?: string;
  sandbox: CodexCliSandbox;
  workingDirectory?: string;
  useOss: boolean;
  localProvider?: string;
  soul: SoulRuntimeInput["soul"];
  durationMs?: number;
  exitCode?: number;
  signal?: string;
  timedOut?: boolean;
  requestBytes?: number;
  requestLength?: number;
  previousOutputLength?: number;
  memoryContextLength?: number;
  stdoutBytes?: number;
  stderrBytes?: number;
  outputBytes?: number;
  errorName?: string;
  errorMessage?: string;
}

const DEFAULT_COMMAND = "codex";
const DEFAULT_SANDBOX: CodexCliSandbox = "read-only";
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_CAPTURE_BYTES = 65536;

class CodexCliExecutionError extends Error {
  readonly result?: CodexCliCommandExecutorResult;

  constructor(message: string, result?: CodexCliCommandExecutorResult) {
    super(message);
    this.name = "CodexCliExecutionError";
    this.result = result;
  }
}

export class CodexCliSoulRuntime implements SoulRuntime {
  private readonly command: string;
  private readonly model?: string;
  private readonly profile?: string;
  private readonly sandbox: CodexCliSandbox;
  private readonly workingDirectory?: string;
  private readonly timeoutMs: number;
  private readonly logFilePath?: string;
  private readonly useOss: boolean;
  private readonly localProvider?: string;
  private readonly commandExecutor: CodexCliCommandExecutor;

  constructor(options: CodexCliSoulRuntimeOptions = {}) {
    this.command = options.command?.trim() || DEFAULT_COMMAND;
    this.model = options.model?.trim() || undefined;
    this.profile = options.profile?.trim() || undefined;
    this.sandbox = options.sandbox ?? DEFAULT_SANDBOX;
    this.workingDirectory = options.workingDirectory?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logFilePath = options.logFilePath?.trim() || undefined;
    this.useOss = options.useOss ?? false;
    this.localProvider = options.localProvider?.trim() || undefined;
    this.commandExecutor = options.commandExecutor ?? runCodexCliCommand;
  }

  async execute(input: SoulRuntimeInput): Promise<string> {
    const prompt = buildCodexPrompt(input);
    const startedAt = Date.now();
    const tempDirectory = await mkdtemp(join(tmpdir(), "hermes-codex-cli-"));
    const outputFilePath = join(tempDirectory, "last-message.txt");
    const args = this.buildArgs(outputFilePath);

    await this.writeLog({
      event: "request_start",
      ...this.baseLogFields(input),
      requestBytes: Buffer.byteLength(prompt),
      requestLength: input.request.length,
      previousOutputLength: input.previousOutput?.length ?? 0,
      memoryContextLength: input.memoryContext.length
    });

    try {
      const result = await this.commandExecutor({
        command: this.command,
        args,
        prompt,
        timeoutMs: this.timeoutMs,
        workingDirectory: this.workingDirectory,
        outputFilePath
      });

      if (result.exitCode !== 0) {
        throw new CodexCliExecutionError(
          formatCodexCliFailureMessage(result),
          result
        );
      }

      const output = (await readFile(outputFilePath, "utf8")).trim();

      if (!output) {
        throw new CodexCliExecutionError(
          "Codex CLI did not produce output text.",
          result
        );
      }

      await this.writeLog({
        event: "request_success",
        ...this.baseLogFields(input),
        durationMs: Date.now() - startedAt,
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        stdoutBytes: Buffer.byteLength(result.stdout),
        stderrBytes: Buffer.byteLength(result.stderr),
        outputBytes: Buffer.byteLength(output)
      });

      return output;
    } catch (error) {
      const result =
        error instanceof CodexCliExecutionError ? error.result : undefined;
      await this.writeLog({
        event: "request_error",
        ...this.baseLogFields(input),
        durationMs: Date.now() - startedAt,
        exitCode: result?.exitCode,
        signal: result?.signal,
        timedOut: result?.timedOut,
        stdoutBytes: result ? Buffer.byteLength(result.stdout) : undefined,
        stderrBytes: result ? Buffer.byteLength(result.stderr) : undefined,
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  private buildArgs(outputFilePath: string): readonly string[] {
    const args = [
      "exec",
      "--sandbox",
      this.sandbox,
      "--ephemeral",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--output-last-message",
      outputFilePath
    ];

    if (this.workingDirectory) {
      args.push("--cd", this.workingDirectory);
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    if (this.profile) {
      args.push("--profile", this.profile);
    }

    if (this.useOss) {
      args.push("--oss");
    }

    if (this.localProvider) {
      args.push("--local-provider", this.localProvider);
    }

    args.push("-");

    return args;
  }

  private baseLogFields(
    input: SoulRuntimeInput
  ): Omit<
    CodexCliRuntimeLogEvent,
    | "timestamp"
    | "event"
    | "durationMs"
    | "exitCode"
    | "signal"
    | "timedOut"
    | "requestBytes"
    | "requestLength"
    | "previousOutputLength"
    | "memoryContextLength"
    | "stdoutBytes"
    | "stderrBytes"
    | "outputBytes"
    | "errorName"
    | "errorMessage"
  > {
    return {
      provider: "codex-cli",
      command: this.command,
      model: this.model,
      profile: this.profile,
      sandbox: this.sandbox,
      workingDirectory: this.workingDirectory,
      useOss: this.useOss,
      localProvider: this.localProvider,
      soul: input.soul
    };
  }

  private async writeLog(
    event: Omit<CodexCliRuntimeLogEvent, "timestamp">
  ): Promise<void> {
    if (!this.logFilePath) {
      return;
    }

    try {
      await mkdir(dirname(this.logFilePath), { recursive: true });
      await appendFile(
        this.logFilePath,
        `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
        "utf8"
      );
    } catch {
      // Logging must never block a user-facing response path.
    }
  }
}

async function runCodexCliCommand(
  input: CodexCliCommandExecutorInput
): Promise<CodexCliCommandExecutorResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"]
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
    child.stdin.end(input.prompt);
  });
}

function buildCodexPrompt(input: SoulRuntimeInput): string {
  return [
    buildSoulInstructions(input),
    "",
    buildSoulUserInput(input),
    "",
    "Return only the final answer for the user.",
    "Do not modify files.",
    "Do not include internal execution logs."
  ].join("\n");
}

function appendLimited(current: string, next: string): string {
  const combined = `${current}${next}`;

  if (Buffer.byteLength(combined) <= MAX_CAPTURE_BYTES) {
    return combined;
  }

  return combined.slice(-MAX_CAPTURE_BYTES);
}

function formatCodexCliFailureMessage(
  result: CodexCliCommandExecutorResult
): string {
  if (result.timedOut) {
    return "Codex CLI request timed out.";
  }

  const detail = result.stderr.trim() || result.stdout.trim();
  const suffix = detail ? `: ${detail.slice(0, 500)}` : "";

  return `Codex CLI request failed with exit code ${result.exitCode}${suffix}`;
}
