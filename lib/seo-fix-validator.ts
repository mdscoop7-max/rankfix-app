import { getFixPolicy, FixCategory } from "./fix-policy";

export type FixValidation = { valid: boolean; errors: string[]; warnings: string[] };

export type NormalizedFix = {
  issue_id: string;
  category: FixCategory;
  safe_type: string | null;
  proposed: string;
  validation: FixValidation;
  source: "deterministic" | "ai";
  approved: boolean;
  scan_id: string | null;
  generated_at: string;
};

function hasPlaceholder(value: string): boolean {
  return /(?:\{\{[^}]+\}\}|\[YOUR_|\bTODO\b)/i.test(value);
}

function validateStructuredData(value: string, expectedSchema?: string): string[] {
  const errors: string[] = [];
  const match = value.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  const raw = match?.[1]?.trim() || value.trim();
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { errors.push("Structured data bevat geen geldige JSON."); return errors; }
  const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
  const list = Array.isArray(items) ? items : [items];
  const localTypes = new Set(["localbusiness","hairdresser","beautysalon","restaurant","bakery","barorcafe","dayspa","dentist","electrician","generalcontractor","homeandconstructionbusiness","locksmith","medicalclinic","plumber","roofingcontractor","store","automotivebusiness","realestateagent","legalservice","accountingservice","travelagency","hotel"]);
  const foundTypes = list.flatMap((item: any) => {
    const t = item?.["@type"];
    return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
  });
  if (!foundTypes.length) errors.push("Structured data bevat geen @type.");
  if (expectedSchema && expectedSchema !== "LocalBusiness" && !foundTypes.some(t => t.toLowerCase() === expectedSchema.toLowerCase())) {
    errors.push(`Structured data gebruikt niet het aanbevolen type: ${expectedSchema}.`);
  }
  if (expectedSchema && localTypes.has(expectedSchema.toLowerCase())) {
    const localItem = list.find((item: any) => {
      const t = item?.["@type"];
      return (Array.isArray(t) ? t : [t]).some((x: any) => String(x).toLowerCase() === expectedSchema.toLowerCase());
    });
    if (!localItem?.name) errors.push("LocalBusiness structured data mist name.");
    if (!localItem?.address) errors.push("LocalBusiness structured data mist address.");
  }
  return errors;
}

function validateOpenGraph(value: string): string[] {
  const errors: string[] = [];
  const tags = [...value.matchAll(/<meta\\b[^>]*>/gi)].map((m) => m[0]);
  if (!tags.length) return ["Open Graph-fix bevat geen meta-tags."];
  const properties = tags.map((tag) => tag.match(/property=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "");
  const contents = tags.map((tag) => tag.match(/content=["']([^"']*)["']/i)?.[1] || "");
  if (properties.includes("og:title") && !contents[properties.indexOf("og:title")]) errors.push("og:title heeft geen content.");
  if (properties.includes("og:description") && !contents[properties.indexOf("og:description")]) errors.push("og:description heeft geen content.");
  if (properties.includes("og:image") && !contents[properties.indexOf("og:image")]) errors.push("og:image heeft geen content.");
  if (!properties.some((p) => p === "og:title") && !properties.some((p) => p === "og:description")) errors.push("Open Graph-fix bevat geen bruikbare titel of beschrijving.");
  return errors;
}

function validateBreadcrumb(value: string): string[] {
  return validateStructuredData(value, "BreadcrumbList");
}

export function validateFix(input: {
  issue_id: string;
  rule_id?: string;
  proposed: unknown;
  source: "deterministic" | "ai";
  currentIssue?: { issue_id: string; status?: string; rule_id?: string } | null;
  currentValue?: string | null;
  scanId?: string | null;
  expectedSchema?: string | null;
}): NormalizedFix {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issue = input.currentIssue;
  const ruleId = input.rule_id || issue?.rule_id || input.issue_id;
  const policy = getFixPolicy(ruleId);

  if (!input.issue_id) errors.push("issue_id ontbreekt.");
  if (!issue || issue.issue_id !== input.issue_id) {
    errors.push("Issue bestaat niet meer in het actuele rapport.");
  }
  if (issue?.status === "PASS" || issue?.status === "NOT_APPLICABLE") {
    errors.push("Issue is niet meer actief.");
  }
  if (typeof input.proposed !== "string" || !input.proposed.trim()) {
    errors.push("Fix bevat geen bruikbare output.");
  }

  const proposed = typeof input.proposed === "string" ? input.proposed.trim() : "";

  if (proposed.length > 0 && hasPlaceholder(proposed)) {
    errors.push("Fix bevat placeholders.");
  }

  if (
    ["meta_title", "meta_description", "h1"].includes(policy.safe_type || "") &&
    /<[^>]+>/.test(proposed)
  ) {
    errors.push("Tekstfix bevat HTML-markup.");
  }

  if (policy.safe_type === "meta_title" && proposed.length > 60) {
    errors.push("Meta title is langer dan 60 tekens.");
  }

  if (policy.safe_type === "meta_description" && proposed.length > 160) {
    errors.push("Meta description is langer dan 160 tekens.");
  }

  if ((policy.safe_type === "structured_data" || policy.safe_type === "breadcrumb") && proposed) {
    errors.push(...(policy.safe_type === "breadcrumb"
      ? validateBreadcrumb(proposed)
      : validateStructuredData(proposed, input.expectedSchema || undefined)));
  }

  if (policy.safe_type === "canonical" && proposed && !/^<link\s+rel=["']canonical["']\s+href=["'][^"']+["']\s*\/?>$/i.test(proposed)) {
    errors.push("Canonical-fix bevat geen geldige canonical link.");
  }

  if (policy.safe_type === "heading_structure" && proposed && !/<h[23]\b/i.test(proposed)) {
    errors.push("Heading-fix bevat geen H2/H3.");
  }

  if (policy.safe_type === "alt_text" && proposed && !/<img\b[^>]*\balt=["'][^"']+["']/i.test(proposed)) {
    errors.push("Alt-fix bevat geen bruikbare alt-tekst.");
  }

  if (policy.safe_type === "social_metadata" && proposed) {
    errors.push(...validateOpenGraph(proposed));
  }

  if (
    input.currentValue &&
    policy.safe_type !== "structured_data" &&
    proposed === input.currentValue.trim()
  ) {
    errors.push("Fix is identiek aan de huidige waarde.");
  }

  if (input.source === "ai") { warnings.push("AI-output kan nooit automatisch worden toegepast."); if (input.currentIssue?.status !== "FAIL" && input.currentIssue?.status !== "WARNING") errors.push("AI-fix mag alleen worden gegenereerd voor een actief FAIL- of WARNING-issue."); }

  if (policy.category === "C") {
    warnings.push("Deze fix vereist menselijke controle.");
  }

  return {
    issue_id: input.issue_id,
    category: policy.category,
    safe_type: policy.safe_type,
    proposed,
    validation: { valid: errors.length === 0, errors, warnings },
    source: input.source,
    approved: false,
    scan_id: input.scanId || null,
    generated_at: new Date().toISOString(),
  };
}

export function isFixStale(fix: NormalizedFix, currentScanId: string | null): boolean { return !!fix.scan_id && !!currentScanId && fix.scan_id !== currentScanId; }

export function canApplyFix(fix: NormalizedFix, currentScanId: string | null): { valid: boolean; errors: string[] } { const errors=[...fix.validation.errors]; if(!fix.approved) errors.push("Fix is nog niet handmatig goedgekeurd."); if(isFixStale(fix,currentScanId)) errors.push("Fix hoort bij een verouderde scan."); if(fix.source==="ai") errors.push("AI-fixes mogen niet automatisch worden toegepast."); return {valid:errors.length===0,errors}; }
