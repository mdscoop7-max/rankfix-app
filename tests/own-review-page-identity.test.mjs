// 2 Nov 2026 (TestLab 144 replay): a page with reviews of the organisation ITSELF is
// not an independent publishing activity. Real blogs, news organisations and
// independent review platforms keep their sector. Generic hosts only.
import test from "node:test";
import assert from "node:assert/strict";
import { isOwnReviewPage, sectorPageEvidence } from "../lib/sector-page-evidence.ts";

const page = (url, title, description = "", h1 = [], type = "corporate", schemaTypes = ["organization"]) =>
  ({ url, type, status: "audited", title, description, identityHeadings: h1, schemaTypes });
const own = (url, title, description = "") => isOwnReviewPage({ url, title, description }, new URL(url).hostname);

test("reviews and experiences of the own brand are recognised in several EU languages", () => {
  assert.equal(own("https://betaal.test/gb/about/betaal-reviews", "Betaal (formerly PayFast) Reviews | Read our Customer Reviews - Betaal", "Read what our customers have to say."), true);
  assert.equal(own("https://www.voorbeeld.test/ervaringen", "Ervaringen met Voorbeeld | Klanten vertellen"), true);
  assert.equal(own("https://www.beispiel.test/bewertungen", "Beispiel Kundenbewertungen"), true);
  assert.equal(own("https://www.exemple.test/avis", "Avis clients sur Exemple"), true);
  assert.equal(own("https://www.firma.test/klanten", "Lees de ervaringen van onze klanten"), true);
});

test("review pages about OTHER brands, review blogs and news are not own-review pages", () => {
  assert.equal(own("https://www.reviewplatform.test/review/winkel.nl", "Winkel Reviews | Read Customer Service Reviews of winkel.nl | Reviewplatform"), false);
  assert.equal(own("https://www.techblog.test/reviews/laptops", "Laptop reviews 2026: de beste laptops getest | Techblog"), false);
  assert.equal(own("https://www.techblog.test/", "Techblog | Reviews en nieuws over gadgets"), false);
  assert.equal(own("https://www.krant.test/economie", "Economie | Het laatste nieuws"), false);
});

test("an own-review page does not veto two agreeing pages of a financial provider", () => {
  const pages = [
    page("https://betaal.test/platform/", "Betaal Platform | Payments infrastructure to power the world's money", "Explore how banks, financial institutions and enterprises can connect seamlessly to our global payment solutions. Deliver fast, reliable, transparent cross-border payments from within your own product", ["infrastructure to power the world's money"], "service"),
    page("https://betaal.test/platform/spend-management/", "Global payments infrastructure for cross-border business payments", "Simplify employee reimbursements and vendor bill payments. Seamlessly integrate Betaal Platform's payments infrastructure into your business operations.", ["FAST, SEAMLESS GLOBAL BUSINESS PAYMENTS"], "other"),
  ];
  const review = page("https://betaal.test/gb/about/betaal-reviews", "Betaal (formerly PayFast) Reviews | Read our Customer Reviews - Betaal", "Is Betaal safe? Don't take our word for it - read what our customers have to say in this compilation of Betaal reviews.", ["Betaal Reviews"]);
  const base = sectorPageEvidence("https://betaal.test/", pages);
  assert.equal(base.decision?.sector, "financial_services", "fixture: the two platform pages corroborate a financial provider");
  const r = sectorPageEvidence("https://betaal.test/", [...pages, review]);
  assert.equal(r.reason, "corroborated_pages", JSON.stringify(r.candidates));
  assert.equal(r.decision?.sector, "financial_services");
  assert.ok(!r.candidates.some((c) => c.sector === "news_media"));
});

test("the same review wording about ANOTHER brand still counts as a publishing page", () => {
  const pages = [
    page("https://betaal.test/platform/", "Betaal Platform | Payments infrastructure to power the world's money", "Explore how banks, financial institutions and enterprises can connect seamlessly to our global payment solutions. Deliver fast, reliable, transparent cross-border payments from within your own product", ["infrastructure to power the world's money"], "service"),
    page("https://betaal.test/platform/spend-management/", "Global payments infrastructure for cross-border business payments", "Simplify employee reimbursements and vendor bill payments. Seamlessly integrate Betaal Platform's payments infrastructure into your business operations.", ["FAST, SEAMLESS GLOBAL BUSINESS PAYMENTS"], "other"),
    page("https://betaal.test/gb/guides/other-bank-review", "Andere Bank Reviews | Independent guide comparing banks", "Our independent magazine compares and reviews banks and money apps.", ["Andere Bank review"]),
  ];
  const r = sectorPageEvidence("https://betaal.test/", pages);
  // Not silently dropped: an unrelated review page remains counterevidence when detected as a publisher.
  assert.ok(r.candidates.some((c) => c.sector === "news_media"), JSON.stringify(r.candidates));
  assert.equal(r.reason, "conflicting_page_identities");
});

test("real publishing sites keep their publisher votes", () => {
  const blog = sectorPageEvidence("https://www.techblog.test/", [
    page("https://www.techblog.test/", "Techblog | Reviews en nieuws over gadgets", "Onafhankelijk blog met reviews, tests en nieuws over smartphones en laptops.", [], "homepage"),
    page("https://www.techblog.test/over-ons", "Over Techblog | Onafhankelijk techblog", "Techblog is een onafhankelijk blog dat gadgets test en reviewt.", ["Over ons"]),
    page("https://www.techblog.test/redactie", "De redactie van Techblog | Onafhankelijk blog", "Ons blog schrijft reviews en gidsen over technologie.", ["Redactie"]),
  ]);
  assert.equal(blog.decision?.sector, "news_media", JSON.stringify(blog.candidates));
  assert.equal(blog.candidates[0].pages.length, 3, "own 'reviews' wording of a blog does not remove its publisher votes");
  const platform = sectorPageEvidence("https://www.reviewplatform.test/", [
    page("https://www.reviewplatform.test/", "Reviewplatform | Reviews van winkels", "Lees en schrijf onafhankelijke reviews over winkels.", [], "homepage"),
    page("https://www.reviewplatform.test/review/winkel.nl", "Winkel Reviews | Read Customer Service Reviews of winkel.nl | Reviewplatform", "Independent review platform: customers compare and review shops.", ["Winkel"]),
  ]);
  for (const c of platform.candidates) assert.notEqual(c.sector, "financial_services");
});
