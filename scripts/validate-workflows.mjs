import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowsDir = join(process.cwd(), "workflows");

if (!existsSync(workflowsDir)) {
  process.exit(0);
}

const failures = [];

for (const workflowName of readdirSync(workflowsDir)) {
  const workflowDir = join(workflowsDir, workflowName);
  const jsonPath = join(workflowDir, `${workflowName}.n8n.json`);
  const readmePath = join(workflowDir, "README.md");

  if (!existsSync(jsonPath)) {
    failures.push(`${workflowName}: missing ${workflowName}.n8n.json`);
    continue;
  }

  const jsonContent = readFileSync(jsonPath, "utf8");

  if (!existsSync(readmePath)) {
    failures.push(`${workflowName}: missing README.md`);
  }

  try {
    JSON.parse(jsonContent);
  } catch (error) {
    failures.push(`${workflowName}: invalid JSON (${error.message})`);
  }

  if (jsonContent.includes("$env")) {
    failures.push(
      `${workflowName}: use {{ENV:NAME}} sync-time placeholders instead of n8n $env access`
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
