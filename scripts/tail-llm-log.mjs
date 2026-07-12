import { spawn } from "node:child_process";
import { open, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const latestOnly = process.argv.includes("--latest");
const includeAll = process.argv.includes("--all");
const providerOverride = readProviderOverride(process.argv.slice(2));
const providers = includeAll
  ? ["openai", "codex-cli"]
  : [normalizeProvider(providerOverride ?? process.env.LLM_PROVIDER)];
const targets = providers.flatMap(resolveLogTarget);

if (targets.length === 0) {
  console.log(
    "LLM_PROVIDER=template uses the local wiring runtime and does not write provider logs."
  );
  process.exit(0);
}

for (const target of targets) {
  await ensureFile(target.path);
}

if (latestOnly) {
  for (const target of targets) {
    const content = await readFile(target.path, "utf8");
    const lines = content.trimEnd().split("\n").filter(Boolean).slice(-100);

    if (targets.length > 1) {
      console.log(`==> ${target.provider}: ${target.path} <==`);
    }

    if (lines.length > 0) {
      console.log(lines.join("\n"));
    }
  }

  process.exit(0);
}

const tail = spawn("tail", ["-n", "100", "-f", ...targets.map((target) => target.path)], {
  stdio: "inherit"
});

tail.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  tail.kill("SIGINT");
});

function readProviderOverride(args) {
  const inline = args.find((arg) => arg.startsWith("--provider="));

  if (inline) {
    return inline.slice("--provider=".length);
  }

  const providerIndex = args.indexOf("--provider");

  if (providerIndex >= 0) {
    return args[providerIndex + 1];
  }

  return undefined;
}

function normalizeProvider(value) {
  if (!value || value === "template") {
    return "template";
  }

  if (value === "openai") {
    return "openai";
  }

  if (value === "codex" || value === "codex-cli") {
    return "codex-cli";
  }

  throw new Error("LLM_PROVIDER must be template, openai, or codex-cli.");
}

function resolveLogTarget(provider) {
  if (provider === "openai") {
    return [
      {
        provider,
        path: process.env.OPENAI_LOG_FILE?.trim() || "logs/openai-runtime.log"
      }
    ];
  }

  if (provider === "codex-cli") {
    return [
      {
        provider,
        path:
          process.env.CODEX_CLI_LOG_FILE?.trim() ||
          "logs/codex-cli-runtime.log"
      }
    ];
  }

  return [];
}

async function ensureFile(path) {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "a");
  await file.close();
}
