import test from "node:test";
import assert from "node:assert/strict";
import { assessRobots, parseRobotsGroups, selectGroupsForBot } from "../lib/robots-policy.ts";
import { classifySitemapResponse } from "../lib/sitemap-evidence.ts";
import { normalizeSchemaType, schemaAdviceForSector } from "../lib/schema-advice.ts";
import { hasOrganizationSchema } from "../lib/sector-identity.ts";
import { scoreApplicableChecks } from "../lib/audit-score.ts";

// Neutral fixture shaped like the QA finding: wildcard blocks everything, the
// Googlebot group has its own narrow rules.
const WILDCARD_BLOCK_GOOGLE_ALLOW = `
User-agent: *
Disallow: /

User-agent: GoogleBot
Disallow: /aspx/
Disallow: /*?*appidt=*
`;

test("robots: a bot-specific group replaces the wildcard group instead of merging with it", () => {
  const verdict = assessRobots(WILDCARD_BLOCK_GOOGLE_ALLOW, "/");
  assert.equal(verdict.blockedForGoogle, false, "Googlebot's own group does not block /");
  assert.equal(verdict.google.matchedAgent, "googlebot");
  assert.equal(verdict.wildcardOnlyBlock, true, "the wildcard still blocks other crawlers");
  assert.equal(verdict.rankfix.blocked, true, "RankFixBot has no own group, so * applies");
});

test("robots: Googlebot is still blocked on paths its own group disallows", () => {
  const verdict = assessRobots(WILDCARD_BLOCK_GOOGLE_ALLOW, "/aspx/page");
  assert.equal(verdict.blockedForGoogle, true);
  assert.equal(verdict.google.rule?.path, "/aspx/");
});

test("robots: wildcard-only Disallow / blocks Googlebot when no specific group exists", () => {
  const verdict = assessRobots("User-agent: *\nDisallow: /", "/");
  assert.equal(verdict.blockedForGoogle, true);
  assert.equal(verdict.wildcardOnlyBlock, false);
});

test("robots: longest match wins and Allow wins a tie; empty Disallow allows everything", () => {
  assert.equal(assessRobots("User-agent: *\nDisallow: /private\nAllow: /private/open", "/private/open/x").blockedForGoogle, false);
  assert.equal(assessRobots("User-agent: *\nDisallow: /a\nAllow: /a", "/a").blockedForGoogle, false);
  assert.equal(assessRobots("User-agent: *\nDisallow:", "/anything").blockedForGoogle, false);
  assert.equal(assessRobots("User-agent: *\nDisallow: /*.pdf$", "/doc.pdf").blockedForGoogle, true);
  assert.equal(assessRobots("User-agent: *\nDisallow: /*.pdf$", "/doc.pdf?x=1").blockedForGoogle, false);
});

test("robots: stacked user-agent lines share one group; comments and CRLF are tolerated", () => {
  const groups = parseRobotsGroups("User-agent: a\r\nUser-agent: googlebot # main\r\nDisallow: /x\r\n\r\nUser-agent: *\r\nDisallow: /");
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].agents, ["a", "googlebot"]);
  assert.equal(selectGroupsForBot(groups, "googlebot").matchedAgent, "googlebot");
  assert.equal(selectGroupsForBot(groups, "bingbot").matchedAgent, "*");
});

test("robots: the most specific agent token wins (googlebot-image does not use the googlebot group by accident)", () => {
  const txt = "User-agent: googlebot\nDisallow: /g\n\nUser-agent: googlebot-image\nDisallow: /img";
  assert.equal(selectGroupsForBot(parseRobotsGroups(txt), "googlebot-image").matchedAgent, "googlebot-image");
  assert.equal(selectGroupsForBot(parseRobotsGroups(txt), "googlebot").matchedAgent, "googlebot");
});

test("sitemap: crawler blocks and server errors are never classified as a broken sitemap", () => {
  assert.equal(classifySitemapResponse({ status: 403, contentType: "text/html" }), "crawler_blocked");
  assert.equal(classifySitemapResponse({ status: 429, contentType: "" }), "crawler_blocked");
  assert.equal(classifySitemapResponse({ status: 503, contentType: "text/html" }), "server_error");
  assert.equal(classifySitemapResponse({ status: 404, contentType: "text/html" }), "missing");
  assert.equal(classifySitemapResponse({ status: 410, contentType: "" }), "missing");
});

test("sitemap: an HTML bot-challenge with HTTP 200 is unconfirmed, a plain HTML page is invalid", () => {
  assert.equal(classifySitemapResponse({ status: 200, contentType: "text/html", body: "<html><title>Just a moment...</title>cf-chl</html>" }), "crawler_blocked");
  assert.equal(classifySitemapResponse({ status: 200, contentType: "text/html", body: "<html><h1>Welkom</h1></html>" }), "invalid");
  assert.equal(classifySitemapResponse({ status: 200, contentType: "text/plain", body: "not xml" }), "invalid");
});

test("schema: full-URL and prefixed @type values normalise to the schema.org name", () => {
  assert.equal(normalizeSchemaType("https://schema.org/Organization"), "Organization");
  assert.equal(normalizeSchemaType("http://schema.org/WebSite"), "WebSite");
  assert.equal(normalizeSchemaType("schema:CollegeOrUniversity"), "CollegeOrUniversity");
  assert.equal(normalizeSchemaType("Hospital"), "Hospital");
  assert.equal(normalizeSchemaType(undefined), "");
  assert.equal(hasOrganizationSchema([normalizeSchemaType("https://schema.org/Organization")]), true);
});

test("schema: hospitals and schools count as Organization subtypes", () => {
  for (const type of ["Hospital", "MedicalBusiness", "HighSchool", "CollegeOrUniversity", "GovernmentOffice"]) {
    assert.equal(hasOrganizationSchema([type]), true, type);
  }
  assert.equal(hasOrganizationSchema(["BreadcrumbList", "WebPage"]), false);
});

test("schema advice: a university hospital gets Hospital, never LocalBusiness", () => {
  const advice = schemaAdviceForSector({ sector: "health_wellness", key: "healthcare_academic", label: "Zorg & Gezondheid · universitair medisch centrum", isHomepage: true });
  assert.ok(advice);
  assert.equal(advice.recommended, "Hospital + WebSite");
  assert.equal(advice.accepted.has("hospital"), true);
  assert.equal(advice.accepted.has("localbusiness"), false);
  assert.equal(advice.suppressLocalBusiness, true);
});

test("schema advice: a university gets CollegeOrUniversity, a school EducationalOrganization", () => {
  const university = schemaAdviceForSector({ sector: "education", key: "education", label: "Onderwijs & Opleiding", ownIdentityText: "Universiteit | studeren en onderzoek", isHomepage: true });
  assert.equal(university?.recommended, "CollegeOrUniversity + WebSite");
  assert.equal(university?.accepted.has("collegeoruniversity"), true);
  const school = schemaAdviceForSector({ sector: "education", key: "education", label: "Onderwijs & Opleiding", ownIdentityText: "Basisschool De Regenboog", isHomepage: true });
  assert.equal(school?.recommended, "EducationalOrganization + WebSite");
  assert.equal(schemaAdviceForSector({ sector: "education", key: "education", label: "Onderwijs", ownIdentityText: "Universiteit", isHomepage: false })?.recommended, "CollegeOrUniversity / WebPage");
});

test("schema advice: other sectors and small practices keep the existing logic", () => {
  assert.equal(schemaAdviceForSector({ sector: "ecommerce", key: "ecommerce", label: "Webshop", isHomepage: true }), null);
  assert.equal(schemaAdviceForSector({ sector: "health_wellness", key: "health_wellness", label: "Zorg & Gezondheid", ownIdentityText: "Fysiotherapie Jansen", isHomepage: true }), null);
  assert.equal(schemaAdviceForSector({ sector: "unknown", key: "unknown", label: "Sector niet vastgesteld", isHomepage: true }), null);
});

test("score: one root cause (robots block) is deducted once, not under both checks", () => {
  const base = { issue_status: "WARNING", severity: "MEDIUM", confidence: "high" };
  const pass = (n) => ({ issue_status: "PASS", points: 4, maxPoints: 4, key: `p${n}` });
  const filler = Array.from({ length: 10 }, (_, i) => pass(i));
  const indexability = { ...base, points: 0, maxPoints: 6, rootCause: "robots_txt_block" };
  const robots = { ...base, points: 1, maxPoints: 4, rootCause: "robots_txt_block" };
  const both = scoreApplicableChecks([...filler, indexability, robots]);
  const onlyIndexability = scoreApplicableChecks([...filler, indexability, { issue_status: "PASS", points: 4, maxPoints: 4 }]);
  const unrelatedTwice = scoreApplicableChecks([...filler, { ...indexability, rootCause: "a" }, { ...robots, rootCause: "b" }]);
  assert.ok(both > unrelatedTwice, "shared root cause costs less than two independent problems");
  assert.ok(both >= onlyIndexability - 8, "shared root cause is bounded by the larger penalty");
});
