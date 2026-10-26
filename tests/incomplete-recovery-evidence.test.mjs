import test from "node:test";
import assert from "node:assert/strict";
import { applyIncompleteRecoveryUncertainty } from "../lib/scan-feedback.ts";

const check = (key, status, found=null) => ({
  key, status, issue_status: status.toUpperCase(), points: 0, maxPoints: 10,
  message: "missing", fix: "fix", evidence: { url:"https://example.test/", found, details:"missing" },
});

test("blocked partial browser recovery never scores missing DOM elements as site errors", () => {
  const items=[check("description","fail"),check("canonical","warning"),check("schema","warning"),check("status","fail")];
  assert.equal(applyIncompleteRecoveryUncertainty(items,{incompleteRecovery:true,url:"https://example.test/"}),3);
  for(const item of items.slice(0,3)){
    assert.equal(item.status,"unable_to_confirm");
    assert.equal(item.reasonCode,"incomplete_recovery");
    assert.equal(item.evidence.found,null);
  }
  assert.equal(items[3].status,"fail");
});

test("complete pages and confirmed positive signals are preserved", () => {
  const confirmed=check("h1","warning",true);
  const normal=check("description","fail");
  assert.equal(applyIncompleteRecoveryUncertainty([confirmed],{incompleteRecovery:true,url:"https://example.test/"}),0);
  assert.equal(confirmed.status,"warning");
  assert.equal(applyIncompleteRecoveryUncertainty([normal],{incompleteRecovery:false,url:"https://example.test/"}),0);
  assert.equal(normal.status,"fail");
});
