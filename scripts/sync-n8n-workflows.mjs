import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const apiUrl = process.env.N8N_API_URL;
const apiKey = process.env.N8N_API_KEY;

if (!apiUrl || !apiKey) {
  console.error("N8N_API_URL and N8N_API_KEY are required.");
  process.exit(1);
}

const workflowsDir = join(process.cwd(), "workflows");
const existingWorkflows = await request("/api/v1/workflows", {
  method: "GET"
});
const existingList = Array.isArray(existingWorkflows)
  ? existingWorkflows
  : Array.isArray(existingWorkflows?.data)
    ? existingWorkflows.data
    : [];

for (const workflowName of readdirSync(workflowsDir)) {
  const jsonPath = join(
    workflowsDir,
    workflowName,
    `${workflowName}.n8n.json`
  );
  const workflow = JSON.parse(readFileSync(jsonPath, "utf8"));
  const existing = existingList.find((candidate) => candidate.name === workflow.name);

  if (existing?.id) {
    await request(`/api/v1/workflows/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(workflow)
    });
    console.log(`Updated n8n workflow: ${workflow.name}`);
    continue;
  }

  await request("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(workflow)
  });
  console.log(`Created n8n workflow: ${workflow.name}`);
}

async function request(path, init) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-n8n-api-key": apiKey,
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`n8n API request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}
