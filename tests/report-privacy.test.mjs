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
  assert.ok(fullPage.includes('["consent_mode_readiness","ads_readiness","trust_legal_signals"].includes(c.key||"")'));
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

test("representative-page metadata uses the same single-pass entity decoding as the main scan", async () => {
  const source=await readFile(new URL("../app/api/scan/route.ts",import.meta.url),"utf8");
  assert.ok(source.includes("const pageQualityDescription = pageDescriptionContent ? decode(stripHtml(pageDescriptionContent[2])) : \"\";"));
  const { decodeHtmlEntities } = await import("../lib/html-entities.ts");
  const raw="Entdecke Schuhe für Damen &amp; Herren";
  const expected="Entdecke Schuhe für Damen & Herren";
  assert.equal(decodeHtmlEntities(raw),expected);
  assert.equal(decodeHtmlEntities(raw).length,raw.length-4);
  assert.equal(decodeHtmlEntities("Damen &amp;amp; Herren"),"Damen &amp; Herren","double escaping remains visible after one decoding pass");
});

test("report preserves privacy evidence and uses singular N/A labels", async () => {
  const fullPage=await readFile(new URL("../app/dashboard/audit/[id]/report/page.tsx",import.meta.url),"utf8");
  assert.ok(fullPage.includes('"trust_legal_signals"].includes(c.key||"")'));
  assert.ok(fullPage.includes('group.items.length===1?"controle overgeslagen":"controles overgeslagen"'));
  assert.ok(fullPage.includes('group.items.length===1?"controle":"controles"'));
  assert.ok(fullPage.includes('group.items.length===1?"check skipped":"checks skipped"'));
});

test("short public scan export discloses actual HTTP and browser identities, never invents old metadata", async () => {
  const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(source,/const agents = result\.rendering\.userAgents/);
  assert.match(source,/if \(agents\?\.httpFetch\)/);
  assert.match(source,/if \(agents\.browserRender\)/);
  assert.match(source,/HTTP user-agent \(HTML fetch\)/);
  assert.match(source,/Browser user-agent \(JavaScript rendering\)/);
  assert.match(source,/RankFix is not Googlebot/);
  assert.ok(source.indexOf('if (result.rendering.note)')<source.indexOf('const agents = result.rendering.userAgents'));
});
