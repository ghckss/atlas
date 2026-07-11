import type { MemorySearchResult } from "../../application";
import type { MemoryRecord } from "../../domain";
import type {
  Mem0AddRequest,
  Mem0Client,
  Mem0SearchRequest
} from "./mem0-memory-adapter";

export interface Mem0HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

interface Mem0SearchPayload {
  results?: unknown;
  memories?: unknown;
}

export class Mem0HttpClient implements Mem0Client {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: Mem0HttpClientOptions) {
    if (!options.apiKey) {
      throw new Error("MEM0_API_KEY is required.");
    }

    if (!options.baseUrl) {
      throw new Error("MEM0_BASE_URL is required.");
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async add(request: Mem0AddRequest): Promise<void> {
    await this.request("/v3/memories/add/", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: request.record.content
          }
        ],
        user_id: request.record.owner.userId,
        metadata: toMem0Metadata(request.record, request.embedding)
      })
    });
  }

  async search(
    request: Mem0SearchRequest
  ): Promise<readonly MemorySearchResult[]> {
    const payload = await this.request("/v3/memories/search/", {
      method: "POST",
      body: JSON.stringify({
        query: request.query,
        filters: buildMem0SearchFilters(request),
        top_k: request.limit,
        threshold: request.minScore ?? 0
      })
    });

    return readSearchResults(payload, request);
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Token ${this.apiKey}`,
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
        `Mem0 request failed with ${response.status}: ${responseText || response.statusText}`
      );
    }

    return responseText ? JSON.parse(responseText) : undefined;
  }
}

function toMem0Metadata(
  record: MemoryRecord,
  embedding: Mem0AddRequest["embedding"]
): Record<string, unknown> {
  return {
    hermes_memory_id: record.id,
    namespace: record.namespace,
    lifetime: record.lifetime,
    source: record.source,
    team_id: record.owner.teamId,
    organization_id: record.owner.organizationId,
    project_id: record.owner.projectId,
    embedding_provider: embedding?.provider,
    embedding_model: embedding?.model,
    embedding_dimensions: embedding?.dimensions
  };
}

function buildMem0SearchFilters(
  request: Mem0SearchRequest
): Record<string, unknown> {
  const sharedMetadataFilters: Record<string, unknown> = {};

  if (request.scope.teamId) {
    sharedMetadataFilters.team_id = request.scope.teamId;
  }

  if (request.scope.organizationId) {
    sharedMetadataFilters.organization_id = request.scope.organizationId;
  }

  if (request.scope.projectId) {
    sharedMetadataFilters.project_id = request.scope.projectId;
  }
  const namespaceFilters = request.scope.namespaces.map((namespace) => ({
    metadata: {
      ...sharedMetadataFilters,
      namespace
    }
  }));

  return {
    AND: [
      {
        user_id: request.scope.userId
      },
      namespaceFilters.length === 1
        ? namespaceFilters[0]
        : {
            OR: namespaceFilters
          }
    ]
  };
}

function readSearchResults(
  payload: unknown,
  request: Mem0SearchRequest
): readonly MemorySearchResult[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const body = payload as Mem0SearchPayload;
  const values = Array.isArray(body.results)
    ? body.results
    : Array.isArray(body.memories)
      ? body.memories
      : [];

  return values.flatMap((value) => toSearchResult(value, request));
}

function toSearchResult(
  value: unknown,
  request: Mem0SearchRequest
): MemorySearchResult[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const item = value as {
    id?: unknown;
    memory?: unknown;
    content?: unknown;
    score?: unknown;
    metadata?: unknown;
  };
  const content =
    typeof item.memory === "string"
      ? item.memory
      : typeof item.content === "string"
        ? item.content
        : undefined;

  if (!content) {
    return [];
  }

  const metadata =
    typeof item.metadata === "object" && item.metadata !== null
      ? (item.metadata as Record<string, unknown>)
      : {};
  const namespace = readNamespace(metadata.namespace, request);
  const score = typeof item.score === "number" ? item.score : 1;

  if (request.minScore !== undefined && score < request.minScore) {
    return [];
  }

  return [
    {
      record: {
        id:
          typeof metadata.hermes_memory_id === "string"
            ? metadata.hermes_memory_id
            : typeof item.id === "string"
              ? item.id
              : `mem0-${content}`,
        namespace,
        lifetime: readLifetime(metadata.lifetime),
        owner: {
          userId: request.scope.userId,
          teamId: readOptionalString(metadata.team_id, request.scope.teamId),
          organizationId: readOptionalString(
            metadata.organization_id,
            request.scope.organizationId
          ),
          projectId: readOptionalString(metadata.project_id, request.scope.projectId)
        },
        content,
        source: "extracted-preference",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      score
    }
  ];
}

function readNamespace(
  value: unknown,
  request: Mem0SearchRequest
): MemorySearchResult["record"]["namespace"] {
  if (
    value === "personal" ||
    value === "team" ||
    value === "project" ||
    value === "organization"
  ) {
    return value;
  }

  return request.scope.namespaces[0] ?? "personal";
}

function readLifetime(
  value: unknown
): MemorySearchResult["record"]["lifetime"] {
  if (value === "permanent" || value === "project" || value === "temporary") {
    return value;
  }

  return "permanent";
}

function readOptionalString(value: unknown, fallback: string | undefined): string | undefined {
  return typeof value === "string" ? value : fallback;
}
