import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProcessResult } from "./helpers/process-result.mjs";

test("file URL conversion retains Windows drive/UNC paths and encoded characters on either OS", () => {
  for (const [native, windows] of [
    [String.raw`C:\Users\test\RankFix AI #1 % café\fixture.json`, true],
    [String.raw`\\server\share\RankFix AI #1 % café\fixture.json`, true],
    ["/home/test/RankFix AI #1 % café/fixture.json", false],
  ]) {
    const url = pathToFileURL(native, { windows });
    assert.equal(fileURLToPath(url, { windows }), native);
    assert.equal(url.hash, "");
    assert.equal(url.search, "");
  }
  assert.equal(fileURLToPath(new URL("../fixtures/group.json", "file:///C:/repo/tests/scan-matrix/run.mjs"), { windows: true }), String.raw`C:\repo\tests\fixtures\group.json`);
});

test("fixture reads and ESM imports work in a real path with spaces, Unicode, # and %", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rankfix café # % "));
  writeFileSync(join(dir, "fixture.json"), '{"value":42}');
  writeFileSync(join(dir, "read.mjs"), 'import { readFileSync } from "node:fs"; export default JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));');
  const loaded = await import(pathToFileURL(join(dir, "read.mjs")).href);
  assert.deepEqual(loaded.default, { value: 42 });
});

test("offline runners never use URL.pathname as a native path or ESM specifier", () => {
  const folders = [new URL("./scan-matrix/", import.meta.url), new URL("./fix-engine/", import.meta.url)];
  const files = folders.flatMap(dir => readdirSync(dir).filter(f => f.endsWith(".mjs")).map(f => new URL(f, dir)));
  files.push(new URL("./report-checks-p9.test.mjs", import.meta.url), new URL("./ymyl-sample.test.mjs", import.meta.url), new URL("./ci-safety-gates.test.mjs", import.meta.url), new URL("../scripts/testlab/validate-mkb-catalog.mjs", import.meta.url));
  for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /new URL\([^\n]*import\.meta\.url\)\.pathname/, file.href);
});

test("child result parsing accepts LF/CRLF but rejects spawn errors, nonzero exits and missing results", () => {
  for (const newline of ["\n", "\r\n"]) assert.deepEqual(readProcessResult({ status: 0, stdout: `log${newline}RESULT {"ok":true}${newline}` }, "RESULT ", "fixture"), { ok: true });
  assert.throws(() => readProcessResult({ error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }) }, "RESULT ", "fixture"), /spawn ENOENT/);
  assert.throws(() => readProcessResult({ status: 1, stdout: 'RESULT {"ok":true}', stderr: "child failed" }, "RESULT ", "fixture"), /child failed/);
  assert.throws(() => readProcessResult({ status: 0, stdout: "no marker" }, "RESULT ", "fixture"), /missing RESULT/);
});
