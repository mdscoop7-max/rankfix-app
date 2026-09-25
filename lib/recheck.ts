import { NormalizedIssue } from "./seo-rules";

export type RecheckResult = {
  success: boolean;
  status: "PASS" | "FAIL" | "UNABLE_TO_CONFIRM";
  evidence: { url: string; details: string; found?: string | number | boolean | null };
};

type PageData = {
  title: string; description: string; h1s: string[]; url: string;
  canonical?: string; ogTitle?: string; ogDescription?: string; ogImage?: string;
  imageCount?: number; imagesMissingAlt?: number; jsonLdTypes?: string[];
};

export function isRecheckSupported(issue: Pick<NormalizedIssue, "rule_id">) {
  return ["META_TITLE_MISSING","META_TITLE_GUIDANCE","META_DESCRIPTION_MISSING","META_DESCRIPTION_GUIDANCE","H1_MISSING","H1_MULTIPLE","IMAGE_ALT_MISSING","SOCIAL_METADATA_INCOMPLETE","STRUCTURED_DATA_MISSING","canonical"].includes(issue.rule_id);
}

export function runRuleForUrl(issue: Pick<NormalizedIssue, "rule_id">, page: PageData): RecheckResult {
  const url = page.url;
  switch (issue.rule_id) {
    case "META_TITLE_MISSING": return page.title ? {success:true,status:"PASS",evidence:{url,details:"Meta title aanwezig.",found:page.title}} : {success:true,status:"FAIL",evidence:{url,details:"Meta title ontbreekt.",found:""}};
    case "META_TITLE_GUIDANCE": return page.title.length >= 30 && page.title.length <= 60 ? {success:true,status:"PASS",evidence:{url,details:"Meta title voldoet aan de richtwaarde.",found:page.title}} : {success:true,status:"FAIL",evidence:{url,details:"Meta title valt buiten de richtwaarde.",found:page.title}};
    case "META_DESCRIPTION_MISSING": return page.description ? {success:true,status:"PASS",evidence:{url,details:"Meta description aanwezig.",found:page.description}} : {success:true,status:"FAIL",evidence:{url,details:"Meta description ontbreekt.",found:""}};
    case "META_DESCRIPTION_GUIDANCE": return page.description.length >= 120 && page.description.length <= 160 ? {success:true,status:"PASS",evidence:{url,details:"Meta description voldoet aan de richtwaarde.",found:page.description}} : {success:true,status:"FAIL",evidence:{url,details:"Meta description valt buiten de richtwaarde.",found:page.description}};
    case "H1_MISSING": return page.h1s.length === 0 ? {success:true,status:"FAIL",evidence:{url,details:"Geen H1 gevonden.",found:0}} : {success:true,status:"PASS",evidence:{url,details:"H1 gevonden.",found:page.h1s.length}};
    case "H1_MULTIPLE": return page.h1s.length > 1 ? {success:true,status:"FAIL",evidence:{url,details:"Meerdere H1's gevonden.",found:page.h1s.length}} : {success:true,status:"PASS",evidence:{url,details:"Niet meerdere H1's gevonden.",found:page.h1s.length}};
    case "IMAGE_ALT_MISSING":
      if (typeof page.imagesMissingAlt !== "number") return {success:true,status:"UNABLE_TO_CONFIRM",evidence:{url,details:"Alt-teksten konden niet betrouwbaar opnieuw worden geteld."}};
      return page.imagesMissingAlt === 0 ? {success:true,status:"PASS",evidence:{url,details:"Alle gevonden afbeeldingen hebben nu een alt-attribuut.",found:0}} : {success:true,status:"FAIL",evidence:{url,details:"Er zijn nog afbeeldingen zonder alt-attribuut.",found:page.imagesMissingAlt}};
    case "SOCIAL_METADATA_INCOMPLETE": {
      const missing = [["og:title",page.ogTitle],["og:description",page.ogDescription]].filter(([,v])=>!v).map(([k])=>k);
      return missing.length === 0 ? {success:true,status:"PASS",evidence:{url,details:"De vereiste Open Graph metadata is live gevonden.",found:"og:title + og:description"}} : {success:true,status:"FAIL",evidence:{url,details:"Open Graph metadata is nog onvolledig.",found:missing.join(", ")}};
    }
    case "STRUCTURED_DATA_MISSING":
      return page.jsonLdTypes?.length ? {success:true,status:"PASS",evidence:{url,details:"Geldige JSON-LD met @type is live gevonden.",found:page.jsonLdTypes.join(", ")}} : {success:true,status:"FAIL",evidence:{url,details:"Nog geen geldige JSON-LD met @type gevonden.",found:0}};
    case "canonical": {
      if (!page.canonical) return {success:true,status:"FAIL",evidence:{url,details:"Canonical ontbreekt nog.",found:""}};
      try {
        const expected=new URL(url); const actual=new URL(page.canonical,url);
        expected.hash=""; actual.hash="";
        const same=expected.toString().replace(/\/$/,"")===actual.toString().replace(/\/$/,"");
        return same ? {success:true,status:"PASS",evidence:{url,details:"Self-referencing canonical is live bevestigd.",found:actual.toString()}} : {success:true,status:"FAIL",evidence:{url,details:"Canonical wijst nog niet naar de gecontroleerde URL.",found:actual.toString()}};
      } catch { return {success:true,status:"UNABLE_TO_CONFIRM",evidence:{url,details:"Canonical kon niet betrouwbaar worden geïnterpreteerd.",found:page.canonical}}; }
    }
    default: return {success:false,status:"UNABLE_TO_CONFIRM",evidence:{url,details:"Geen deterministische recheck voor deze rule."}};
  }
}

export function computeRecheckStatus(results: RecheckResult[], crawlComplete = true) {
  if (!results.length || !crawlComplete) return "UNABLE_TO_CONFIRM";
  if (results.some((r) => r.status === "UNABLE_TO_CONFIRM")) return "UNABLE_TO_CONFIRM";
  if (results.every((r) => r.status === "PASS")) return "RESOLVED";
  if (results.every((r) => r.status === "FAIL")) return "STILL_AFFECTED";
  return "PARTIALLY_RESOLVED";
}
