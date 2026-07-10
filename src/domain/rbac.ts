export const roles = ["owner", "developer", "viewer"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "conversation:send",
  "project:ask",
  "document:create",
  "news:read",
  "memory:read",
  "memory:manage",
  "hermes:configure",
  "mcp:manage",
  "workflow:manage",
  "system:configure"
] as const;

export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  owner: permissions,
  developer: [
    "conversation:send",
    "project:ask",
    "document:create",
    "news:read",
    "memory:read"
  ],
  viewer: ["conversation:send", "project:ask", "news:read", "memory:read"]
};

export const systemMutationPermissions: readonly Permission[] = [
  "memory:manage",
  "hermes:configure",
  "mcp:manage",
  "workflow:manage",
  "system:configure"
];

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function canMutateSystem(role: Role): boolean {
  return systemMutationPermissions.some((permission) => can(role, permission));
}

export function canModifyCoreMemoryFile(role: Role): boolean {
  return can(role, "memory:manage");
}
