export interface N8nWorkflowClientOptions {
  apiUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface N8nWorkflowSummary {
  id: string;
  name: string;
}

export class N8nWorkflowClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: N8nWorkflowClientOptions) {
    if (!options.apiUrl) {
      throw new Error("N8N_API_URL is required.");
    }

    if (!options.apiKey) {
      throw new Error("N8N_API_KEY is required.");
    }

    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listWorkflows(): Promise<readonly N8nWorkflowSummary[]> {
    const payload = await this.request("/api/v1/workflows", {
      method: "GET"
    });
    const data =
      typeof payload === "object" && payload !== null
        ? (payload as { data?: unknown }).data
        : undefined;
    const workflows = Array.isArray(data) ? data : Array.isArray(payload) ? payload : [];

    return workflows.flatMap((workflow) => {
      if (typeof workflow !== "object" || workflow === null) {
        return [];
      }

      const value = workflow as { id?: unknown; name?: unknown };

      if (typeof value.id !== "string" || typeof value.name !== "string") {
        return [];
      }

      return [
        {
          id: value.id,
          name: value.name
        }
      ];
    });
  }

  async upsertWorkflow(workflow: unknown): Promise<unknown> {
    const name = readWorkflowName(workflow);
    const workflowPayload = toN8nWorkflowPayload(workflow);
    const existing = (await this.listWorkflows()).find(
      (candidate) => candidate.name === name
    );

    if (existing) {
      return this.request(`/api/v1/workflows/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify(workflowPayload)
      });
    }

    return this.request("/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify(workflowPayload)
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        "x-n8n-api-key": this.apiKey,
        "content-type": "application/json",
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
}

function readWorkflowName(workflow: unknown): string {
  if (typeof workflow !== "object" || workflow === null) {
    throw new Error("n8n workflow must be an object.");
  }

  const name = (workflow as { name?: unknown }).name;

  if (typeof name !== "string" || name.length === 0) {
    throw new Error("n8n workflow requires a name.");
  }

  return name;
}

function toN8nWorkflowPayload(workflow: unknown): Record<string, unknown> {
  if (typeof workflow !== "object" || workflow === null) {
    throw new Error("n8n workflow must be an object.");
  }

  const value = workflow as {
    name?: unknown;
    nodes?: unknown;
    connections?: unknown;
    settings?: unknown;
  };

  return {
    name: value.name,
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
    connections:
      typeof value.connections === "object" && value.connections !== null
        ? value.connections
        : {},
    settings:
      typeof value.settings === "object" && value.settings !== null
        ? value.settings
        : {}
  };
}
