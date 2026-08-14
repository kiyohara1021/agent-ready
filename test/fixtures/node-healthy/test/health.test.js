import assert from "node:assert/strict";
import { test } from "node:test";

import { health } from "../src/index.js";

test("health returns ok", () => {
  assert.equal(health(), "ok");
});
