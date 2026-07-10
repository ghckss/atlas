export const mcpKinds = ["github", "filesystem"] as const;
export type McpKind = (typeof mcpKinds)[number];

export interface McpConnectionPolicy {
  kind: McpKind;
  displayName: string;
  allowedOperations: readonly string[];
  requiresOwnerConfiguration: boolean;
}

export const mcpPolicies: Record<McpKind, McpConnectionPolicy> = {
  github: {
    kind: "github",
    displayName: "GitHub MCP",
    allowedOperations: [
      "repository:read",
      "pull-request:read",
      "issue:read",
      "code:assist"
    ],
    requiresOwnerConfiguration: true
  },
  filesystem: {
    kind: "filesystem",
    displayName: "Filesystem MCP",
    allowedOperations: ["file:read", "file:write:allowed-directory"],
    requiresOwnerConfiguration: true
  }
};
