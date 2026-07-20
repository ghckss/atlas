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
let refreshedActiveWorkflowCount = 0;

for (const workflowName of readdirSync(workflowsDir)) {
  const jsonPath = join(
    workflowsDir,
    workflowName,
    `${workflowName}.n8n.json`
  );
  const workflow = JSON.parse(readFileSync(jsonPath, "utf8"));
  const workflowPayload = toN8nWorkflowPayload(
    resolveEnvironmentPlaceholders(workflow, workflow.name)
  );
  const existing = existingList.find((candidate) => candidate.name === workflow.name);

  if (existing?.id) {
    await request(`/api/v1/workflows/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(workflowPayload)
    });
    console.log(`Updated n8n workflow: ${workflow.name}`);

    if (existing.active) {
      await refreshActiveWorkflowTrigger(existing.id, workflow.name);
      refreshedActiveWorkflowCount += 1;
    }

    continue;
  }

  await request("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(workflowPayload)
  });
  console.log(`Created n8n workflow: ${workflow.name}`);
}

if (refreshedActiveWorkflowCount > 0) {
  console.log(
    "Active workflows were refreshed through the n8n API. If schedule triggers do not fire, restart the n8n process so cron registrations are reloaded."
  );
}

async function refreshActiveWorkflowTrigger(workflowId, workflowName) {
  await request(`/api/v1/workflows/${workflowId}/deactivate`, {
    method: "POST"
  });
  await request(`/api/v1/workflows/${workflowId}/activate`, {
    method: "POST"
  });
  console.log(`Refreshed active n8n workflow trigger: ${workflowName}`);
}

function toN8nWorkflowPayload(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes ?? [],
    connections: workflow.connections ?? {},
    settings: workflow.settings ?? {}
  };
}

function resolveEnvironmentPlaceholders(value, workflowName) {
  if (typeof value === "string") {
    return value.replace(/\{\{ENV:([A-Z0-9_]+)\}\}/g, (_match, name) =>
      resolveEnvironmentValue(name, workflowName)
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvironmentPlaceholders(item, workflowName));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        resolveEnvironmentPlaceholders(nestedValue, workflowName)
      ])
    );
  }

  return value;
}

function resolveEnvironmentValue(name, workflowName) {
  if (name === "DISCORD_BOT_TOKEN_AUTH_HEADER") {
    const token = requireEnvironmentValue("DISCORD_BOT_TOKEN", workflowName);
    return token.startsWith("Bot ") ? token : `Bot ${token}`;
  }

  return requireEnvironmentValue(name, workflowName);
}

function requireEnvironmentValue(name, workflowName) {
  const value = process.env[name] ?? fallbackEnvironmentValue(name);

  if (!value) {
    throw new Error(
      `${name} is required to sync n8n workflow "${workflowName}".`
    );
  }

  return value;
}

function fallbackEnvironmentValue(name) {
  if (name === "HERMES_SCHEDULE_BRIEFING_WEBHOOK_URL") {
    return deriveScheduleWebhookUrl();
  }

  if (name === "SCHEDULE_BRIEFING_DISCORD_CHANNEL_ID") {
    return process.env.NEWS_BRIEFING_DISCORD_CHANNEL_ID;
  }

  return undefined;
}

function deriveScheduleWebhookUrl() {
  const newsWebhookUrl = process.env.HERMES_NEWS_BRIEFING_WEBHOOK_URL;

  if (!newsWebhookUrl) {
    return undefined;
  }

  if (!/\/webhooks\/news-briefing$/.test(newsWebhookUrl)) {
    return undefined;
  }

  return newsWebhookUrl.replace(
    /\/webhooks\/news-briefing$/,
    "/webhooks/schedule-briefing"
  );
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

  if (response.status === 204) {
    return undefined;
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `n8n API request failed with ${response.status}: ${responseText}`
    );
  }

  return responseText ? JSON.parse(responseText) : undefined;
}
