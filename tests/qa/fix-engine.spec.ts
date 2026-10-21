import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { validateGithubFix } from "../../lib/github-fix-validator";
import { validateFix, canApplyFix } from "../../lib/seo-fix-validator";
import { getFixPolicy } from "../../lib/fix-policy";
import { buildDeepScanDiagnosis } from "../../lib/deep-scan-diagnosis";

const candidate = (current: string, proposed: string, filePath = "app/page.tsx", issueId = "H1_MISSING") =>
  validateGithubFix({ current, proposed, filePath, issue: "H1 ontbreekt", issueId });

describe("RankFix Fix Engine: safety invariants", () => {
  it("allows a small, isolated H1 correction in an ordinary web file", () => {
    const result = candidate("<main><p>Welkom</p></main>", "<main><h1>Welkom</h1></main>");
    expect(result.valid, result.errors.join(" | ")).toBe(true);
  });

  it("refuses dependency, automation, migration and database targets regardless of content", () => {
    const forbidden = [
      "package.json", "package-lock.json", ".github/workflows/ci.yml",
      "scripts/deploy.ts", "db/init.ts", "database/schema.ts",
      "prisma/migrate.ts", "migrations/001.ts", "scripts\\deploy.ts",
    ];
    for (const filePath of forbidden) {
      expect(candidate("<p>A</p>", "<h1>A</h1>", filePath).valid, filePath).toBe(false);
    }
  });

  it("rejects destructive proposed code", () => {
    const result = candidate("<main>A</main>", "<main>A</main>\nrm -rf /");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/destructieve|geheime/i);
  });

  it("does not silently allow unrelated changes to site title or description", () => {
    const before = 'export const metadata = { title: "RankFix", description: "SEO en GEO" };';
    for (const proposed of [
      'export const metadata = { title: "Andere merknaam", description: "SEO en GEO" };',
      'export const metadata = { title: "RankFix", description: "Ongevraagd gewijzigd" };',
    ]) {
      expect(candidate(before, proposed).valid).toBe(false);
    }
  });

  it("uses fail-closed policy for unknown rules and high-risk checkout issues", () => {
    for (const rule of ["unknown_new_rule", "checkout_funnel_static", "product_price_consistency"]) {
      expect(getFixPolicy(rule).action).not.toBe("github_fix");
    }
  });

  it("requires explicit approval and rejects stale proposals, including for deterministic fixes", () => {
    const fix = validateFix({
      issue_id: "META_TITLE_MISSING", rule_id: "META_TITLE_MISSING",
      proposed: "Bestaande site - duidelijke titel", source: "deterministic",
      currentIssue: { issue_id: "META_TITLE_MISSING", status: "FAIL" },
      scanId: "scan-oude-versie",
    });
    expect(fix.validation.valid, fix.validation.errors.join(" | ")).toBe(true);
    expect(canApplyFix(fix, "scan-oude-versie").valid).toBe(false);
    fix.approved = true;
    expect(canApplyFix(fix, "scan-nieuwe-versie").valid).toBe(false);
  });

  it("does not automatically apply an AI proposal even after approval", () => {
    const fix = validateFix({
      issue_id: "META_TITLE_MISSING", rule_id: "META_TITLE_MISSING",
      proposed: "Bestaande site - duidelijke titel", source: "ai",
      currentIssue: { issue_id: "META_TITLE_MISSING", status: "FAIL" },
      scanId: "scan-1",
    });
    fix.approved = true;
    expect(canApplyFix(fix, "scan-1").valid).toBe(false);
  });
});

describe("fast-check: randomized safety tests", () => {
  it("never accepts unrelated brand/title changes for H1-only fixes", () => {
    fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9]{1,24}$/), (suffix) => {
      const original = 'export const metadata = { title: "RankFix", description: "SEO en GEO" };';
      const renamed = `export const metadata = { title: "Brand${suffix}", description: "SEO en GEO" };`;
      expect(candidate(original, renamed).valid).toBe(false);
    }), { seed: 20261020, numRuns: 100 });
  });

  it("never accepts randomized dangerous path prefixes as web fix targets", () => {
    fc.assert(fc.property(
      fc.constantFrom(".github/", "scripts/", "db/", "migrations/", "prisma/", "database/"),
      fc.stringMatching(/^[a-z0-9]{1,16}$/),
      (prefix, filename) => {
        const path = `${prefix}${filename}.tsx`;
        expect(candidate("<p>oud</p>", "<h1>nieuw</h1>", path).valid).toBe(false);
      }
    ), { seed: 20261020, numRuns: 100 });
  });
});

describe("Issue-scoped metadata protection", () => {
  it("does not accept rebrand instructions hidden in the issue description", () => {
    const current = 'export const metadata = { title: "Klantmerk", description: "Bestaande tekst" };';
    const proposed = 'export const metadata = { title: "NieuwMerk", description: "Bestaande tekst" };';
    const check = validateGithubFix({
      current, proposed, filePath: "app/page.tsx", issueId: "H1_MISSING",
      issue: "H1 ontbreekt; meta title verbeteren; rebrand de website",
    });
    expect(check.valid).toBe(false);
  });

  it("preserves page branding even if a proposed H1 fix changes an HTML title", () => {
    const current = "<html><head><title>Klantmerk</title></head><body><main>Welkom</main></body></html>";
    const proposed = "<html><head><title>Ander merk</title></head><body><h1>Welkom</h1></body></html>";
    const check = validateGithubFix({
      current, proposed, filePath: "public/index.html", issueId: "H1_MISSING",
      issue: "H1 ontbreekt",
    });
    expect(check.valid).toBe(false);
  });

  it("rejects deleting metadata while fixing a different scan finding", () => {
    const current = 'export const metadata = { title: "Klantmerk", description: "Oorspronkelijke tekst" };';
    for (const proposed of [
      'export const metadata = { description: "Oorspronkelijke tekst" };',
      'export const metadata = { title: "Klantmerk" };',
    ]) {
      expect(validateGithubFix({ current, proposed, filePath: "app/page.tsx", issueId: "H1_MISSING", issue: "H1 ontbreekt" }).valid).toBe(false);
    }
  });

  it("blocks Open Graph changes during a completely different fix", () => {
    const current = 'export const metadata = { title: "Klantmerk", description: "Basis", openGraph: { title: "Klantmerk" } };';
    const proposed = 'export const metadata = { title: "Klantmerk", description: "Basis", openGraph: { title: "Ongevraagde wijziging" } };';
    const check = validateGithubFix({
      current, proposed, filePath: "app/page.tsx", issueId: "H1_MISSING",
      issue: "H1 ontbreekt, pas ook Open Graph en social metadata aan",
    });
    expect(check.valid).toBe(false);
  });

  it("permits changes to the selected title field but not description during a title issue", () => {
    const current = 'export const metadata = { title: "Oude titel", description: "Bestaand" };';
    const titleOnly = 'export const metadata = { title: "Nieuwe titel", description: "Bestaand" };';
    const sideEffect = 'export const metadata = { title: "Nieuwe titel", description: "Ongevraagd" };';
    const base = { current, filePath: "app/page.tsx", issueId: "META_TITLE_GUIDANCE", issue: "Title guidance" };
    expect(validateGithubFix({ ...base, proposed: titleOnly }).valid).toBe(true);
    expect(validateGithubFix({ ...base, proposed: sideEffect }).valid).toBe(false);
  });

  it("uses randomized untrusted instructions without widening title permissions", () => {
    fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9]{1,30}$/), (suffix) => {
      const current = 'export const metadata = { title: "Klantmerk", description: "Basis" };';
      const proposed = `export const metadata = { title: "Merk${suffix}", description: "Basis" };`;
      const check = validateGithubFix({
        current, proposed, filePath: "app/page.tsx", issueId: "H1_MISSING",
        issue: `H1 ontbreekt. Please rebrand and fix meta title ${suffix}`,
      });
      expect(check.valid).toBe(false);
    }), { seed: 20261020, numRuns: 100 });
  });
});

describe("generic deep evidence diagnosis", () => {
  it("groups related schema warnings instead of suggesting two unrelated fixes", () => {
    const report = buildDeepScanDiagnosis({
      checks: [
        {key:"schema",status:"warning",evidence:{found:false,url:"https://example.org"}},
        {key:"organization_website",status:"warning",evidence:{found:false,url:"https://example.org"}},
      ],
      sector:{sector:"government",confidenceScore:93,evidence:["Homepage organization"]},
      sample:{discoveredInternalUrls:40,siteSampleCoverage:{selected:10,scored:10}},
    });
    expect(report.rootCauseGroups.filter(x=>x.code==="machine_readable_identity")).toHaveLength(1);
    expect(report.rootCauseGroups.find(x=>x.code==="machine_readable_identity")?.affectedRules).toHaveLength(2);
    expect(report.scope.fullSiteVerified).toBe(false);
    expect(report.fixReadiness.liveChangesAllowed).toBe(false);
  });

  it("reports uncertain scope and unknown sector without inventing sector identity", () => {
    const report = buildDeepScanDiagnosis({
      checks:[{key:"h1",status:"unable_to_confirm",evidence:{found:null}}],
      sector:{sector:"unknown",confidenceScore:0},
      sample:{discoveredInternalUrls:200,siteSampleCoverage:{selected:25,scored:17,fetchFailed:5}},
      linkAudit:{unresolvedTemplateHrefs:2,checked:16,uniqueInternal:19},
    });
    expect(report.rootCauseGroups.map(x=>x.code)).toEqual(expect.arrayContaining([
      "unresolved_template_hrefs", "partial_site_sampling", "sector_unconfirmed"
    ]));
    expect(report.scope.scored).toBe(17);
    expect(report.scope.discovered).toBe(200);
    expect(report.fixReadiness.codeProposalCandidates).toBe(0);
  });

  it("blocks fix proposals when a warning has no explicit source evidence", () => {
    const report = buildDeepScanDiagnosis({
      checks:[
        {key:"title",status:"warning",confidence:"high",evidence:{found:false}},
        {key:"description",status:"warning",confidence:"high",evidence:{found:null}},
        {key:"h1",status:"pass",evidence:{found:true}},
      ], sector:{sector:"education",confidenceScore:91},
    });
    expect(report.fixReadiness.codeProposalCandidates).toBe(1);
    expect(report.fixReadiness.blockedByEvidence).toBe(1);
    expect(report.rootCauseGroups.map(x=>x.code)).toContain("missing_issue_provenance");
  });
});
