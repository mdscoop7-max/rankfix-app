// Readable report lines for the AI sector check (owner request 7 Nov 2026):
// what the AI proposed, which sources were verified, and what RankFix decided.
export const QUOTE_RESULT_NL: Record<string, string> = {
  counted: "telt als bewijs",
  page_not_in_evidence: "pagina hoort niet bij het bewijs",
  too_short: "te kort",
  not_found_verbatim: "niet letterlijk op de pagina gevonden",
  template_text: "sjabloontekst (menu/footer, op 3+ pagina's)",
  no_activity_word: "noemt de activiteit niet",
};

type AnyRecord = Record<string, unknown>;
const obj = (v: unknown): AnyRecord => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : {});

const ROLE_NL: Record<string, string> = {
  eigen_dienstverlener: "voert de dienst zelf uit", eigen_verkoper: "verkoopt zelf", eigen_productie: "produceert zelf",
  bemiddelaar: "bemiddelaar", marktplaats_platform: "marktplaats/platform", vergelijker: "vergelijker",
  software_saas: "software/SaaS", uitgever_media: "uitgever/media", publieke_instantie: "publieke instantie", non_profit: "non-profit", onbekend: "onbekend",
};

const DECISION_NL: Record<string, string> = {
  disabled: "AI-controle uitgeschakeld",
  not_needed: "Niet nodig: de sectorregels bevestigden de branche",
  confirmed: "Branche bevestigd met door RankFix teruggevonden websitebewijs",
  conflict: "Tegenstrijdig bewijs: branche niet bevestigd",
  rejected: "AI-voorstel verworpen: bewijs niet teruggevonden op de website",
  unknown: "AI vond onvoldoende bewijs: branche blijft niet bevestigd",
  error: "AI-controle niet uitgevoerd: regeluitkomst behouden",
};

export function aiSectorReportLines(sectorProfile: unknown): string[] {
  const ai = obj(obj(sectorProfile).aiVerification);
  const status = String(ai.status || "");
  if (!status || status === "disabled") return [];
  const lines = ["AI-SECTORCONTROLE", `Beslissing: ${DECISION_NL[status] || status}`];
  const rule = obj(ai.ruleOutcome);
  if (rule.label) lines.push(`Sectorregels vooraf: ${String(rule.label)}${rule.sector === "unknown" ? "" : ` (zekerheid ${String(rule.confidenceScore ?? "?")}%)`}`);
  if (ai.reason) lines.push(`Reden: ${String(ai.reason)}`);
  const option = obj(ai.option), proposal = obj(ai.proposal);
  const proposedKey = String(option.label || proposal.key || "");
  if (proposedKey) lines.push(`AI-voorstel: ${proposedKey}${ai.role || proposal.role ? ` (rol: ${ROLE_NL[String(ai.role || proposal.role)] || String(ai.role || proposal.role)})` : ""}`);
  const quotes = Array.isArray(ai.quotes) ? ai.quotes.map(obj) : [];
  const checks = Array.isArray(ai.quoteChecks) ? ai.quoteChecks.map(obj) : [];
  if (checks.length) {
    lines.push("AI-citaten en controle door RankFix:");
    for (const c of checks) lines.push(`- ${String(c.url)}: "${String(c.quote)}" → ${QUOTE_RESULT_NL[String(c.result) as keyof typeof QUOTE_RESULT_NL] || String(c.result)}`);
  } else if (quotes.length) {
    lines.push("Gebruikte bronnen (letterlijk teruggevonden op de website):");
    for (const q of quotes) lines.push(`- ${String(q.url)}: "${String(q.quote)}"`);
  }
  const usage = obj(ai.usage);
  if (ai.model || usage.durationMs != null) {
    const tokens = usage.promptTokens != null ? `, ${Number(usage.promptTokens) + Number(usage.completionTokens || 0)} tokens` : "";
    lines.push(`Model: ${String(ai.model || "?")}${usage.durationMs != null ? `, ${usage.durationMs} ms` : ""}${tokens}`);
  }
  return lines;
}
