import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { qaPreviewAuditText } from "../lib/qa-preview-report.ts";

test("QA copy includes full sector evidence and all checks with honest statuses", () => {
  const audit = qaPreviewAuditText({
    finalUrl:"https://www.kpn.com/",
    httpStatus:200, responseTime:589, overallScore:90, grade:"A",
    sectorProfile:{key:"telecom_technology",label:"Telecom & Technologie",confidenceScore:96,evidence:["Primaire telecomdienst"],applicableModules:["core_seo","geo","technical"]},
    technologyProfile:{siteType:"Telecomprovider",framework:"Nuxt"},
    seo:{score:99,checks:[
      {key:"h1",title:"H1",status:"pass",message:"Correcte H1",points:8,maxPoints:8,evidence:{found:'Het beste van KPN',url:"https://www.kpn.com/"}},
      {key:"contact",title:"Contact",status:"unable_to_confirm",message:"Niet bewezen"},
    ]},
    geo:{score:72,checks:[{key:"schema",title:"Structured data",status:"warning",message:"Geen JSON-LD bevestigd",fix:"Controleer relevante markup"}]},
    metrics:{title:"Welkom bij KPN",h1s:["Het beste van KPN"]},
  });
  assert.match(audit,/SECTOR: Telecom & Technologie/);
  assert.match(audit,/Type: Telecomprovider/);
  assert.match(audit,/Found: Het beste van KPN/);
  assert.match(audit,/Unable to confirm: 1/);
  assert.match(audit,/1\. Structured data \[warning\]/);
  assert.match(audit,/Kopieer|QA-preview/);
});

test("Only Vercel QA previews show the full anonymous audit; production stays unchanged", async () => {
  const page = await readFile("app/[locale]/scan/page.tsx","utf8");
  const client = await readFile("app/[locale]/scan/scan-client.tsx","utf8");
  assert.match(page,/qaPreview=\{process\.env\.VERCEL_ENV === "preview"\}/);
  assert.match(client,/qaPreview && <section/);
  assert.match(client,/Kopieer volledige testaudit/);
  assert.match(client,/qaPreviewAuditText\(result\)/);
  assert.doesNotMatch(client,/dashboard:\s*true/);
});
