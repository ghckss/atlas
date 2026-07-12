import { spawn } from "node:child_process";
import { open, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const logFilePath = process.env.LLM_LOG_FILE?.trim() || "logs/llm-runtime.log";
const latestOnly = process.argv.includes("--latest");

await ensureFile(logFilePath);

if (latestOnly) {
  const content = await readFile(logFilePath, "utf8");
  const lines = content.trimEnd().split("\n").filter(Boolean).slice(-100);

  if (lines.length > 0) {
    console.log(lines.join("\n"));
  }

  process.exit(0);
}

const tail = spawn("tail", ["-n", "100", "-f", logFilePath], {
  stdio: "inherit"
});

tail.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  tail.kill("SIGINT");
});

async function ensureFile(path) {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, "a");
  await file.close();
}
