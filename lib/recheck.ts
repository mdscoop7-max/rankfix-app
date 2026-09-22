import { NormalizedIssue } from "./seo-rules";

export type RecheckResult = {
  success: boolean;
  status: "PASS" | "FAIL" | "UNABLE_TO_CONFIRM";
  evidence: { url: string; details: string; found?: string | number | boolean | null };
};

type PageData = { title: string; description: string; h1s: string[]; url: string };

export function isRecheckSupported(issue: Pick<NormalizedIssue, "rule_id">) {
  return ["META_TITLE_MISSING","META_TITLE_GUIDANCE","META_DESCRIPTION_MISSING","META_DESCRIPTION_GUIDANCE","H1_MISSING","H1_MULTIPLE"].includes(issue.rule_id);
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
