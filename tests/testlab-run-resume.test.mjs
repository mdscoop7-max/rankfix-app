import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const lab = readFileSync(new URL("../components/qa-testlab.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/testlab-audit-store.ts", import.meta.url), "utf8");
test("browser TestLab run survives a page reload and resumes without clearing results", () => {
  assert.match(lab, /rankfix-qa-testlab-run:/);
  assert.match(lab, /localStorage\.setItem\(flagKey,JSON\.stringify\(\{active:true/);
  // flag removed only when the page is still mounted (normal end, stop, error) — not on reload
  assert.match(lab, /if\(mounted\.current\)\{setRunning\(false\);if\(flagKey\)localStorage\.removeItem\(flagKey\);\}/);
  assert.match(lab, /setResumePending\(\{scope:/);
  assert.match(lab, /startRef\.current\?\.\(\)/);
  assert.match(lab, /Test afgerond:/);
  assert.doesNotMatch(lab.slice(lab.indexOf("function start()"), lab.indexOf("useEffect(()=>{startRef.current=start;})")), /persist\(\[\]\)/);
});
test("audit store upgrades to v2 (creates missing store) and fails visibly when blocked", () => {
  assert.match(store, /indexedDB\.open\(DB,2\)/);
  assert.match(store, /if\(!request\.result\.objectStoreNames\.contains\(STORE\)\)request\.result\.createObjectStore/);
  assert.match(store, /request\.onblocked=/);
  assert.match(store, /onversionchange=\(\)=>db\.close\(\)/);
});
