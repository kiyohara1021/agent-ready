import assert from "node:assert/strict";
import { test } from "node:test";

import { stub } from "../src/index.js";

test("stub is true", () => {
  assert.equal(stub, true);
});
