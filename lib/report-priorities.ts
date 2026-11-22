// The short report: the few improvements that matter most, each with its
// severity, the problem in one sentence and a concrete fix. Only proven issues
// (fail/warning) qualify; unconfirmed checks are never presented as problems.

export type PriorityCheck = {
  key?: string;
  title: string;
  status: string;
  severity?: string;
  message?: string;
  fix?: string;
  points?: number;
  maxPoints?: number;
};
export type Severity = "Hoog" | "Middel" | "Laag";
export type Improvement = { title: string; severity: Severity; problem: string; fix: string; key: string | null };

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

function severityOf(check: PriorityCheck): Severity {
  const s = String(check.severity || "").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return "Hoog";
  if (s === "MEDIUM") return "Middel";
  if (s === "LOW" || s === "INFO") return "Laag";
  return check.status === "fail" ? "Hoog" : "Middel";
}

const SEVERITY_ORDER: Record<Severity, number> = { Hoog: 0, Middel: 1, Laag: 2 };

/** First sentence, trimmed to a readable length. */
export function oneSentence(text: string | undefined, max = 180): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const first = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] || clean;
  return first.length > max ? `${first.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : first;
}

export function topImprovements(checks: PriorityCheck[], extra: Improvement[] = [], limit = 5): Improvement[] {
  const seen = new Set<string>();
  const ranked = checks
    .filter((check) => check.status === "fail" || check.status === "warning")
    .map((check) => ({
      check,
      severity: severityOf(check),
      lost: Math.max(0, (check.maxPoints ?? 0) - (check.points ?? 0)),
      statusRank: check.status === "fail" ? 0 : 1,
      severityRank: SEVERITY_RANK[String(check.severity || "").toUpperCase()] ?? (check.status === "fail" ? 1 : 2),
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.statusRank - b.statusRank || a.severityRank - b.severityRank || b.lost - a.lost)
    .map(({ check, severity }): Improvement => ({
      title: check.title,
      severity,
      problem: oneSentence(check.message),
      fix: oneSentence(check.fix) || "Bekijk de details van deze controle in het volledige rapport.",
      key: check.key || null,
    }));
  const merged = [...ranked, ...extra].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const out: Improvement[] = [];
  for (const item of merged) {
    const id = item.title.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const FACT_FIX: Record<string, string> = {
  company_registration: "Vermeld het KvK- en btw-nummer in de footer of op de contact- of voorwaardenpagina.",
  contact: "Toon een telefoonnummer, e-mailadres of contactformulier op een vindbare contactpagina.",
  stock: "Toon op elke productpagina een duidelijke voorraadstatus die gelijk is aan de productgegevens.",
  checkout: "Zorg dat winkelwagen en checkout vanaf elke productpagina bereikbaar zijn.",
};

/** Proven-missing essential facts become improvements; unconfirmed ones do not. */
export function factImprovements(facts: Array<{ key: string; label: string; state: string; detail: string }>): Improvement[] {
  return facts.filter((fact) => fact.state === "missing").map((fact) => ({
    title: `${fact.label} ontbreekt`,
    severity: "Middel" as const,
    problem: oneSentence(fact.detail),
    fix: FACT_FIX[fact.key] || "Vul deze gegevens aan.",
    key: fact.key,
  }));
}
