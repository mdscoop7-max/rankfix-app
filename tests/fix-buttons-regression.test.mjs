import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publicFixProposalType,canOfferPublicFixProposal } from "../lib/public-fix-actions.ts";
test("fix proposals cannot guess unknown issue types",()=>{
 assert.equal(publicFixProposalType("META_TITLE_MISSING","title"),"meta_title");
 assert.equal(publicFixProposalType("ORGANIZATION_WEBSITE_SCHEMA","schema"),"structured_data");
 assert.equal(publicFixProposalType("H1_MULTIPLE","h1"),null);
 assert.equal(publicFixProposalType("UNKNOWN","title"),null);
});
test("fix proposal buttons require a real supported problem",()=>{
 const item={issue_id:"META_TITLE_MISSING",status:"fail",issue_status:"FAIL"};
 assert.equal(canOfferPublicFixProposal(item),true);
 for(const status of ["pass","not_applicable","unable_to_confirm"])assert.equal(canOfferPublicFixProposal({...item,status}),false);
 assert.equal(canOfferPublicFixProposal({...item,issue_status:"UNABLE_TO_CONFIRM"}),false);
});
test("GitHub button route requires persisted scan and truthful plan state",async()=>{
 const home=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
 const scan=await readFile(new URL("../app/dashboard/scan/page.tsx",import.meta.url),"utf8");
 const github=await readFile(new URL("../app/dashboard/github/page.tsx",import.meta.url),"utf8");
 const api=await readFile(new URL("../app/api/github/fix/route.ts",import.meta.url),"utf8");
 assert.match(home,/dashboard\/scan\?url=/);
 assert.doesNotMatch(home,/async function createGithubFix/);
 assert.doesNotMatch(home,/fetch\("\/api\/github\/fix"/);
 assert.match(home,/canOfferPublicFixProposal\(item\)/);
 assert.match(scan,/verificationUrl=searchParams\.get\("url"\)/);
 assert.match(github,/scan_id:activeScanId,issue_id:activeIssueId/);
 assert.match(github,/plan==="free" \? <div/);
 assert.match(api,/!issueId\|\|!scanId/);
});
