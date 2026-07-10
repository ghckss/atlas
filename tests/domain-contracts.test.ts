import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMemorySearchScope,
  can,
  canModifyCoreMemoryFile,
  canMutateSystem,
  canWriteCoreMemoryFile,
  createSoulExecutionPlan,
  isCompleteSoulProfile,
  mcpPolicies,
  newsBriefingWorkflow,
  shouldPersistInExternalMemory,
  soulProfiles
} from "../src";

test("RBAC allows only owner to mutate system configuration", () => {
  assert.equal(can("owner", "system:configure"), true);
  assert.equal(can("developer", "system:configure"), false);
  assert.equal(can("viewer", "system:configure"), false);
  assert.equal(canMutateSystem("owner"), true);
  assert.equal(canMutateSystem("developer"), false);
  assert.equal(canMutateSystem("viewer"), false);
});

test("core memory files are owner-managed and file-backed", () => {
  assert.equal(canModifyCoreMemoryFile("owner"), true);
  assert.equal(canWriteCoreMemoryFile("owner", "USER.md"), true);
  assert.equal(canWriteCoreMemoryFile("developer", "USER.md"), false);
  assert.equal(canWriteCoreMemoryFile("viewer", "MEMORY.md"), false);
});

test("memory search scope filters unrelated namespaces", () => {
  const scope = buildMemorySearchScope({
    identity: {
      userId: "user-1",
      teamId: "team-a",
      organizationId: "org-a",
      projectId: "project-a"
    },
    requestedNamespaces: ["personal", "project", "team", "organization"]
  });

  assert.deepEqual(scope, {
    userId: "user-1",
    teamId: "team-a",
    organizationId: "org-a",
    projectId: "project-a",
    namespaces: ["personal", "project", "team", "organization"]
  });
});

test("raw session history and core files are not written directly to External Memory", () => {
  assert.equal(shouldPersistInExternalMemory("session-history"), false);
  assert.equal(shouldPersistInExternalMemory("core-file"), false);
  assert.equal(shouldPersistInExternalMemory("extracted-preference"), true);
  assert.equal(shouldPersistInExternalMemory("project-fact"), true);
});

test("all Soul profiles include the required prompt sections", () => {
  for (const profile of Object.values(soulProfiles)) {
    assert.equal(isCompleteSoulProfile(profile), true, profile.id);
  }
});

test("Default Soul cannot be mixed with specialist Souls", () => {
  assert.throws(
    () => createSoulExecutionPlan("빈 계획", []),
    /최소 하나의 Soul/
  );

  assert.throws(
    () => createSoulExecutionPlan("구조를 설계하고 구현", ["default", "coder"]),
    /Default Soul/
  );

  assert.deepEqual(createSoulExecutionPlan("코드 리뷰 후 수정", ["reviewer", "coder"]), {
    objective: "코드 리뷰 후 수정",
    steps: [
      {
        soul: "reviewer",
        receivesFrom: undefined
      },
      {
        soul: "coder",
        receivesFrom: "reviewer"
      }
    ]
  });
});

test("news briefing workflow is managed as n8n JSON plus documentation", () => {
  assert.equal(newsBriefingWorkflow.trigger, "scheduler");
  assert.equal(
    newsBriefingWorkflow.jsonExportPath,
    "workflows/news-briefing/news-briefing.n8n.json"
  );
  assert.equal(
    newsBriefingWorkflow.documentationPath,
    "workflows/news-briefing/README.md"
  );
});

test("MCP policies keep GitHub and filesystem access behind explicit adapters", () => {
  assert.equal(mcpPolicies.github.requiresOwnerConfiguration, true);
  assert.equal(mcpPolicies.filesystem.requiresOwnerConfiguration, true);
  assert.match(
    mcpPolicies.filesystem.allowedOperations.join(","),
    /allowed-directory/
  );
});
