import assert from "node:assert/strict";
import test from "node:test";

import { GitApprovalService, type GitCommandExecutor } from "../src";

test("GitApprovalService commits and pushes an approved bot change", async () => {
  let statusLines: readonly string[] = [];
  const commands: string[] = [];
  const executor: GitCommandExecutor = async ({ args }) => {
    const command = args.join(" ");
    commands.push(command);

    if (command === "status --porcelain=v1") {
      return success(statusLines.join("\n"));
    }

    if (command === "rev-parse --abbrev-ref HEAD") {
      return success("master\n");
    }

    if (command === "add -A") {
      return success("");
    }

    if (command === "commit -m feat: bot change") {
      statusLines = [];
      return success("[master abc123] feat: bot change\n");
    }

    if (command === "rev-parse --short HEAD") {
      return success("abc123\n");
    }

    if (command === "push origin HEAD") {
      return success("");
    }

    return failure(`unexpected command: ${command}`);
  };
  const service = new GitApprovalService({
    enabled: true,
    workdir: "/tmp/project",
    commandExecutor: executor
  });

  const snapshot = await service.captureBeforeRequest();
  statusLines = [" M src/file.ts"];
  await service.recordRequestResult(snapshot, {
    messageId: "message-1",
    requesterUserId: "user-1"
  });

  const result = await service.approve({
    approverUserId: "owner-1",
    commitMessage: "feat: bot change"
  });

  assert.equal(result.status, "pushed");
  assert.match(result.content, /commit abc123/);
  assert.deepEqual(commands, [
    "rev-parse --abbrev-ref HEAD",
    "status --porcelain=v1",
    "rev-parse --abbrev-ref HEAD",
    "status --porcelain=v1",
    "status --porcelain=v1",
    "rev-parse --abbrev-ref HEAD",
    "add -A",
    "commit -m feat: bot change",
    "rev-parse --short HEAD",
    "push origin HEAD"
  ]);
});

test("GitApprovalService blocks approval when the worktree was already dirty", async () => {
  let statusLines: readonly string[] = [" M existing.ts"];
  const commands: string[] = [];
  const executor: GitCommandExecutor = async ({ args }) => {
    const command = args.join(" ");
    commands.push(command);

    if (command === "status --porcelain=v1") {
      return success(statusLines.join("\n"));
    }

    if (command === "rev-parse --abbrev-ref HEAD") {
      return success("master\n");
    }

    return failure(`unexpected command: ${command}`);
  };
  const service = new GitApprovalService({
    enabled: true,
    workdir: "/tmp/project",
    commandExecutor: executor
  });

  const snapshot = await service.captureBeforeRequest();
  statusLines = [" M existing.ts", " M src/file.ts"];
  await service.recordRequestResult(snapshot, {
    messageId: "message-1",
    requesterUserId: "user-1"
  });

  const result = await service.approve({
    approverUserId: "owner-1"
  });

  assert.equal(result.status, "blocked");
  assert.match(result.content, /이미 변경사항/);
  assert.equal(commands.includes("add -A"), false);
});

test("GitApprovalService approves only changed repositories under workspace roots", async () => {
  const repoA = "/tmp/workspace/already-dirty";
  const repoB = "/tmp/workspace/bot-change";
  const statusByCwd = new Map<string, readonly string[]>([
    [repoA, [" M existing.ts"]],
    [repoB, []]
  ]);
  const commands: string[] = [];
  const executor: GitCommandExecutor = async ({ args, cwd }) => {
    const command = args.join(" ");
    commands.push(`${cwd}:${command}`);

    if (command === "status --porcelain=v1") {
      return success((statusByCwd.get(cwd) ?? []).join("\n"));
    }

    if (command === "rev-parse --abbrev-ref HEAD") {
      return success("master\n");
    }

    if (command === "add -A") {
      return success("");
    }

    if (command === "commit -m feat: bot change") {
      statusByCwd.set(cwd, []);
      return success("[master def456] feat: bot change\n");
    }

    if (command === "rev-parse --short HEAD") {
      return success("def456\n");
    }

    if (command === "push origin HEAD") {
      return success("");
    }

    return failure(`unexpected command: ${command}`);
  };
  const service = new GitApprovalService({
    enabled: true,
    workspaceRoots: ["/tmp/workspace"],
    repositoryFinder: async () => [repoA, repoB],
    commandExecutor: executor
  });

  const snapshot = await service.captureBeforeRequest();
  statusByCwd.set(repoB, [" M src/file.ts"]);
  await service.recordRequestResult(snapshot, {
    messageId: "message-1",
    requesterUserId: "user-1"
  });

  const result = await service.approve({
    approverUserId: "owner-1",
    commitMessage: "feat: bot change"
  });

  assert.equal(result.status, "pushed");
  assert.match(result.content, /bot-change/);
  assert.equal(
    commands.includes(`${repoA}:add -A`),
    false,
    "unrelated dirty repository must not be committed"
  );
  assert.equal(commands.includes(`${repoB}:add -A`), true);
  assert.equal(commands.includes(`${repoB}:push origin HEAD`), true);
});

test("GitApprovalService does nothing when there is no pending approval", async () => {
  const service = new GitApprovalService({
    enabled: true,
    workdir: "/tmp/project",
    commandExecutor: async () => failure("should not run git")
  });

  const result = await service.approve({
    approverUserId: "owner-1"
  });

  assert.equal(result.status, "no-pending");
});

function success(stdout: string) {
  return {
    exitCode: 0,
    stdout,
    stderr: ""
  };
}

function failure(stderr: string) {
  return {
    exitCode: 1,
    stdout: "",
    stderr
  };
}
