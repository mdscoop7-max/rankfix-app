import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publicReportUrl, redactReportText } from "../lib/report-privacy.ts";

test("strip all OAuth authentication and signed URL parameters from shared reports", () => {
  const input="https://account.example.test/authentication/oauth/authorize?buyer_flags=eyJabc&client_id=abc&nonce=123&state=super-secret&redirect_uri=https%3A%2F%2Faccount.example.test%2Fcallback";
  const redacted="https://account.example.test/authentication/oauth/authorize";
  assert.equal(publicReportUrl(input),redacted);
  assert.equal(redactReportText("URL: "+input),"URL: "+redacted);
  for(const secret of ["buyer_flags","client_id","nonce","state","super-secret","redirect_uri"])assert.equal(redactReportText(input).includes(secret),false,secret);
});

test("regular product and root URLs remain usable; signed media URLs lose tokens", () => {
  assert.equal(publicReportUrl("https://allbirds.de/"),"https://allbirds.de/");
  assert.equal(publicReportUrl("https://allbirds.de/products/tree-runner?variant=123#detail"),"https://allbirds.de/products/tree-runner");
  assert.equal(redactReportText("Foto https://allbirds.de/cdn/main.png?v=123&signature=secret. Klaar."),"Foto https://allbirds.de/cdn/main.png. Klaar.");
});

test("short and full report export paths both sanitize and use the check-level summary", async () => {
  const publicPage=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const fullPage=await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx",import.meta.url),"utf8");
  assert.ok(publicPage.includes("return redactReportText(lines.join("));
  assert.ok(publicPage.includes("const summary = summaryFromChecks("));
  assert.ok(fullPage.includes("return redactReportText([...root.children]"));
  assert.ok(fullPage.includes("publicReportUrl(page.url)"));
  assert.ok(fullPage.includes("HTTP-fouten in de paginasteekproef"));
  assert.ok(fullPage.includes("redactReportText(group.reason)"));
  assert.ok(fullPage.includes('if(c.status==="not_applicable")return c.message'));
  assert.ok(fullPage.includes('["consent_mode_readiness","ads_readiness"].includes(c.key||"")'));
});

test("PDF and copy expand collapsed sections and restore their state", async () => {
  const fullPage=await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx",import.meta.url),"utf8");
  assert.ok(fullPage.includes('querySelectorAll<HTMLDetailsElement>("details:not([open])")'));
  assert.ok(fullPage.includes('closed.forEach(detail=>{detail.open=true;})'));
  assert.ok(fullPage.includes('closed.forEach(detail=>{detail.open=false;})'));
  assert.ok(fullPage.includes('finally{restore();}'));
  assert.ok(fullPage.includes('window.addEventListener("afterprint",restore,{once:true})'));
  assert.ok(fullPage.includes('onClick={printAudit}'));
  assert.ok(fullPage.includes('document.execCommand("copy")'),"mobile clipboard fallback exists");
});
