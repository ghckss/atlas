import type { Role } from "./rbac";
import { canModifyCoreMemoryFile } from "./rbac";

export const memoryNamespaces = [
  "personal",
  "team",
  "project",
  "organization"
] as const;

export type MemoryNamespace = (typeof memoryNamespaces)[number];

export const memoryLifetimes = ["permanent", "project", "temporary"] as const;
export type MemoryLifetime = (typeof memoryLifetimes)[number];

export const coreMemoryFiles = ["USER.md", "MEMORY.md"] as const;
export type CoreMemoryFile = (typeof coreMemoryFiles)[number];

export const externalMemorySources = [
  "user-declared",
  "extracted-preference",
  "project-fact"
] as const;

export type ExternalMemorySource = (typeof externalMemorySources)[number];
export type MemorySource =
  | ExternalMemorySource
  | "core-file"
  | "session-history";

export interface MemoryIdentity {
  userId: string;
  teamId?: string;
  organizationId?: string;
  projectId?: string;
}

export interface MemoryRecord {
  id: string;
  namespace: MemoryNamespace;
  lifetime: MemoryLifetime;
  owner: MemoryIdentity;
  content: string;
  source: MemorySource;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchRequest {
  identity: MemoryIdentity;
  requestedNamespaces?: readonly MemoryNamespace[];
}

export interface MemorySearchScope {
  userId: string;
  teamId?: string;
  organizationId?: string;
  projectId?: string;
  namespaces: readonly MemoryNamespace[];
}

export function buildMemorySearchScope(
  request: MemorySearchRequest
): MemorySearchScope {
  const allowedNamespaces = new Set<MemoryNamespace>(["personal"]);

  if (request.identity.teamId) {
    allowedNamespaces.add("team");
  }

  if (request.identity.projectId) {
    allowedNamespaces.add("project");
  }

  if (request.identity.organizationId) {
    allowedNamespaces.add("organization");
  }

  const requested = request.requestedNamespaces ?? [...allowedNamespaces];
  const namespaces = requested.filter((namespace) =>
    allowedNamespaces.has(namespace)
  );

  return {
    userId: request.identity.userId,
    teamId: request.identity.teamId,
    organizationId: request.identity.organizationId,
    projectId: request.identity.projectId,
    namespaces
  };
}

export function canWriteCoreMemoryFile(role: Role, file: CoreMemoryFile): boolean {
  return coreMemoryFiles.includes(file) && canModifyCoreMemoryFile(role);
}

export function shouldPersistInExternalMemory(source: MemoryRecord["source"]): boolean {
  return externalMemorySources.some(
    (externalSource) => externalSource === source
  );
}
