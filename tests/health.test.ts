import assert from "node:assert/strict";
import test from "node:test";

import { health, platformName } from "../src";

test("health reports the platform service name", () => {
  assert.equal(platformName, "ai-assistant-platform");
  assert.deepEqual(health(), {
    status: "ok",
    service: "ai-assistant-platform"
  });
});
