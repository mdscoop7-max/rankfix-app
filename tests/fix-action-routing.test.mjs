import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
test("public GitHub Fix opens saved audit workflow, not incomplete code write", async () => {
  const page = await read("../app/page.tsx");
  assert.doesNotMatch(page, /fetch\(["']\/api\/github\/fix/);
  assert.doesNotMatch(page, /Fix veilig klaarzetten/);
  assert.match(page, /\/dashboard\/scan\?url=/);
});
test("public Fix offers only known types from central policy", async () => {
  const page = await read("../app/page.tsx");
  assert.match(page, /const type = policy\.safe_type/);
  assert.match(page, /if \(!type \|\| !\["fail", "warning"\]\.includes\(item\.status\)\)/);
  assert.doesNotMatch(page, /: "structured_data";/);
});
test("GitHub workspace blocks incomplete submission and clarifies Free access", async () => {
  const page = await read("../app/dashboard/github/page.tsx");
  const server = await read("../app/api/github/fix/route.ts");
  assert.match(page, /disabled=\{busy\|\|!scanId\|\|!issueId/);
  assert.match(page, /\/dashboard\/history/);
  assert.match(page, /Bekijk abonnementen/);
  assert.match(server, /!issueId\|\|!scanId/);
  assert.match(server, /PAID_PLAN_REQUIRED/);
});
test("audit GitHub links only render for a saved scan and verified issue", async () => {
  const page = await read("../app/dashboard/audit/[id]/page.tsx");
  assert.match(page, /!idForFix\(scan\)\|\|!issueId\|\|policy\.action/);
  assert.match(page, /!hasEvidence/);
  assert.match(page, /check\.fix_category==="C"/);
});
