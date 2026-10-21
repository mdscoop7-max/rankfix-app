import { getFixPolicy } from "./fix-policy";

export type DeepDiagnosticCheck = {
  key?: string; rule_id?: string; issue_id?: string; title?: string;
  status?: string; confidence?: string; fix_category?: string;
  evidence?: { found?: unknown; url?: string; details?: string };
};
export type DeepDiagnosticIssue = {
  code: string; status: "needs_review" | "unconfirmed";
  affectedRules: string[]; finding: string; nextStep: string;
};
export type DeepScanDiagnosis = {
  version: "1.0";
  scope: { mode: "representative_sample"; sampled: number; scored: number; discovered: number; fullSiteVerified: false };
  evidence: { issues: number; unconfirmed: number; unresolvedTemplateLinks: number; missingProofOnIssues: number };
  fixReadiness: { codeProposalCandidates: number; manualOrAdviceOnly: number; blockedByEvidence: number; liveChangesAllowed: false };
  rootCauseGroups: DeepDiagnosticIssue[];
};

const GROUPS: ReadonlyArray<{ code: string; keys: RegExp; finding: string; nextStep: string }> = [
  { code: "technical_links", keys: /^(?:broken_links|internal_redirects|links|redirects)$/, finding: "Interne URL-verwijzingen vragen controle van bronhref en de echte bestemming.", nextStep: "Vergelijk raw HTML, gerenderde DOM en HTTP-respons; adviseer alleen bij bewezen foutieve bestemmingen." },
  { code: "machine_readable_identity", keys: /^(?:schema|organization_website|entity|structured_data)$/, finding: "Machineleesbare organisatie-/paginagegevens kunnen één gedeelde oorzaak hebben.", nextStep: "Controleer bestaande JSON-LD en paginatype voordat je één samenhangend schema-voorstel maakt." },
  { code: "head_metadata", keys: /^(?:title|description|canonical|social|twitter_card|hreflang)$/, finding: "Metadata of canonieke paginaverwijzingen vragen bron- en contextcontrole.", nextStep: "Controleer de daadwerkelijke paginakop, URL-varianten en taalstructuur vóór het aanpassen." },
  { code: "content_structure", keys: /^(?:h1|headings|content|alt|faq|answer|breadcrumbs)$/, finding: "Zichtbare inhoud, koppen of toegankelijkheidsdetails vragen inhoudelijke beoordeling.", nextStep: "Vergelijk gerenderde pagina met de bron; geen tekst of betekenis verzinnen." },
  { code: "trust_signals", keys: /^(?:trust|trust_legal_signals|business_details|privacy|consent)$/, finding: "Vertrouwens- en wettelijke signalen zijn mogelijk incompleet of verspreid over meerdere pagina's.", nextStep: "Controleer feitelijke eerste-partijcontact- en beleidspagina's; vul geen bedrijfsgegevens in zonder bewijs." },
];

export function buildDeepScanDiagnosis(input: {
  checks: DeepDiagnosticCheck[];
  sector?: { sector?: string; key?: string; evidence?: string[]; confidenceScore?: number };
  sample?: { discoveredInternalUrls?: number; siteSampleCoverage?: { selected?: number; scored?: number; checked?: number; fetchFailed?: number } };
  linkAudit?: { unresolvedTemplateHrefs?: number; checked?: number; uniqueInternal?: number };
}): DeepScanDiagnosis {
  const checks = input.checks || [];
  const issues = checks.filter(c => ["warning", "fail"].includes(c.status || ""));
  const unconfirmed = checks.filter(c => c.status === "unable_to_confirm");
  const knownEvidence = (c: DeepDiagnosticCheck) => c.evidence?.found !== null && c.evidence?.found !== undefined;
  const missingProof = issues.filter(c => !knownEvidence(c));
  const eligible = issues.filter(c => {
    const id = c.rule_id || c.issue_id || c.key || "";
    const p = getFixPolicy(id);
    return Boolean(id && p.action === "github_fix" && p.safe_type && knownEvidence(c)
      && c.confidence !== "low" && c.fix_category !== "C");
  });
  const groups: DeepDiagnosticIssue[] = [];
  const used = new Set<string>();
  for (const group of GROUPS) {
    const matches = issues.filter(c => group.keys.test(c.rule_id || c.key || c.issue_id || ""));
    if (!matches.length) continue;
    matches.forEach(c => used.add(c.rule_id || c.key || c.issue_id || ""));
    groups.push({
      code: group.code, status: "needs_review",
      affectedRules: matches.map(c => c.rule_id || c.key || c.issue_id || "").filter(Boolean),
      finding: group.finding, nextStep: group.nextStep,
    });
  }
  const unknown = issues.map(c => c.rule_id || c.key || c.issue_id || "").filter(k => k && !used.has(k));
  if (unknown.length) groups.push({
    code: "other_verified_issues", status: "needs_review", affectedRules: unknown,
    finding: "Overige waarschuwingen vragen een gerichte controle van hun eigen bewijs.",
    nextStep: "Beoordeel de betrokken bron en beperk een eventuele fix strikt tot het bewezen probleem.",
  });
  const templateCount = input.linkAudit?.unresolvedTemplateHrefs || 0;
  if (templateCount) groups.push({
    code: "unresolved_template_hrefs", status: "unconfirmed", affectedRules: ["broken_links"],
    finding: String(templateCount) + " HTML-linkexpressie(s) zijn nog geen bevestigde bezoekers-URL's.",
    nextStep: "Inspecteer de gehydrateerde DOM; tel kunstmatige 404-responses niet als bewezen broken links.",
  });
  const selected = input.sample?.siteSampleCoverage?.selected || 0;
  const scored = input.sample?.siteSampleCoverage?.scored || 0;
  if (selected > scored) groups.push({
    code: "partial_site_sampling", status: "unconfirmed", affectedRules: [],
    finding: String(selected - scored) + " van " + String(selected) + " geselecteerde pagina's leverden geen volledig scorende steekproef op.",
    nextStep: "Toon de niet-geverifieerde pagina's en hun ophaal-/renderreden; trek geen conclusies over de hele site.",
  });
  if (!input.sector?.sector || input.sector.sector === "unknown" || !input.sector.confidenceScore) groups.push({
    code: "sector_unconfirmed", status: "unconfirmed", affectedRules: [],
    finding: "De primaire organisatie-identiteit is niet onafhankelijk bewezen.",
    nextStep: "Vergelijk titel, H1, eigen organisatieomschrijving, navigatie en structured data; raad de sector niet op basis van domeinnaam alleen.",
  });
  if (missingProof.length) groups.push({
    code: "missing_issue_provenance", status: "unconfirmed",
    affectedRules: missingProof.map(c => c.rule_id || c.key || c.issue_id || "").filter(Boolean),
    finding: String(missingProof.length) + " waarschuwing(en) missen expliciet vastgelegd bronbewijs.",
    nextStep: "Behandel deze controles als onbevestigd; geef geen automatische Fix-actie vrij.",
  });
  return {
    version: "1.0",
    scope: { mode: "representative_sample", sampled: selected, scored,
      discovered: input.sample?.discoveredInternalUrls || 0, fullSiteVerified: false },
    evidence: { issues: issues.length, unconfirmed: unconfirmed.length,
      unresolvedTemplateLinks: templateCount, missingProofOnIssues: missingProof.length },
    fixReadiness: { codeProposalCandidates: eligible.length,
      manualOrAdviceOnly: Math.max(0, issues.length - eligible.length - missingProof.length),
      blockedByEvidence: missingProof.length, liveChangesAllowed: false },
    rootCauseGroups: groups,
  };
}
