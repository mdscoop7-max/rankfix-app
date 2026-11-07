import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scan route accepts og:image aliases and compares og:url with canonical", async () => {
  const source = await readFile(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");
  assert.match(source, /getMeta\("og:image"\) \|\| getMeta\("og:image:url"\) \|\| getMeta\("og:image:secure_url"\)/);
  assert.match(source, /wijkt af van de canonical/);
});
