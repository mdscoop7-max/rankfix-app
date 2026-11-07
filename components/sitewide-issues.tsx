import type { Locale } from "@/lib/locales";
import type { SitewideIssue } from "@/lib/sitewide-issues";

type ScopeLike = { caution?: string | null; sectorDistinction?: string | null; notes?: string[] } | null | undefined;

const T: Record<Locale, { title: string; intro: string; toConfirm: string; evidence: string; fix: string; none: string; page: string }> = {
  nl: { title: "Verbeterpunten op andere pagina's (steekproef)", intro: "Deze punten zijn gevonden op andere beoordeelde pagina's van dezelfde website. Ze tellen niet mee in de score van de ingevoerde pagina.", toConfirm: "Nog te bevestigen in een browser", evidence: "Bewijs", fix: "Herstel", none: "Geen bevestigde aandachtspunten op de andere beoordeelde pagina's.", page: "Pagina" },
  en: { title: "Improvement points on other pages (sample)", intro: "Found on other assessed pages of the same website. They do not count towards the score of the entered page.", toConfirm: "To be confirmed in a browser", evidence: "Evidence", fix: "Fix", none: "No confirmed issues on the other assessed pages.", page: "Page" },
  de: { title: "Verbesserungspunkte auf anderen Seiten (Stichprobe)", intro: "Auf anderen geprüften Seiten derselben Website gefunden. Sie zählen nicht zum Score der eingegebenen Seite.", toConfirm: "Im Browser noch zu bestätigen", evidence: "Beleg", fix: "Behebung", none: "Keine bestätigten Punkte auf den anderen geprüften Seiten.", page: "Seite" },
  fr: { title: "Points à améliorer sur d'autres pages (échantillon)", intro: "Trouvés sur d'autres pages évaluées du même site. Ils ne comptent pas dans le score de la page saisie.", toConfirm: "À confirmer dans un navigateur", evidence: "Preuve", fix: "Correction", none: "Aucun point confirmé sur les autres pages évaluées.", page: "Page" },
  it: { title: "Miglioramenti su altre pagine (campione)", intro: "Trovati su altre pagine valutate dello stesso sito. Non contano nel punteggio della pagina inserita.", toConfirm: "Da confermare in un browser", evidence: "Prova", fix: "Correzione", none: "Nessun problema confermato sulle altre pagine valutate.", page: "Pagina" },
  es: { title: "Puntos de mejora en otras páginas (muestra)", intro: "Encontrados en otras páginas evaluadas del mismo sitio. No cuentan en la puntuación de la página introducida.", toConfirm: "Por confirmar en un navegador", evidence: "Evidencia", fix: "Solución", none: "Sin puntos confirmados en las otras páginas evaluadas.", page: "Página" },
};

/** Sitewide sample issues: exact URL, check, severity, evidence and fix. */
export function SitewideIssues({ issues, locale }: { issues: SitewideIssue[] | null | undefined; locale: Locale }) {
  const t = T[locale] || T.nl;
  const list = issues || [];
  if (!list.length) return null;
  return (
    <section className="rf-audit-list rf-sitewide-issues" id="rankfix-sitewide-issues" data-count={list.length}>
      <h2>{t.title} ({list.filter((i) => i.certainty === "confirmed").length})</h2>
      <p className="rf-empty" style={{ marginTop: 4 }}>{t.intro}</p>
      <div className="mt-3 space-y-3">
        {list.map((issue) => (
          <article key={issue.issueId} className="rf-audit-issue" data-certainty={issue.certainty}>
            <div className="rf-audit-row">
              <h3>{issue.checkLabel}</h3>
              <span className={issue.certainty === "confirmed" && issue.severity === "warning" ? "rf-badge warning" : "rf-badge"}>{issue.certainty === "confirmed" ? (issue.severity === "warning" ? "⚠" : "i") : t.toConfirm}</span>
            </div>
            <p className="break-all"><strong>{t.page}:</strong> <a href={issue.url} target="_blank" rel="noopener noreferrer">{issue.url}</a></p>
            <p><strong>{t.evidence}:</strong> {issue.evidence}</p>
            <p><strong>{t.fix}:</strong> {issue.recommendation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** One prominent line next to a high headline score; null when nothing to qualify. */
export function ScoreCaution({ scope }: { scope: ScopeLike }) {
  if (!scope?.caution && !scope?.sectorDistinction) return null;
  return <>
    {scope?.caution ? <p className="rf-score-caution" role="note" style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 600, color: "#b45309" }}>{scope.caution}</p> : null}
    {/* A technical score is never presented as a sector confirmation. */}
    {scope?.sectorDistinction ? <p className="rf-score-sector-distinction" role="note" style={{ margin: "4px 0 0", fontSize: 13 }}>{scope.sectorDistinction}</p> : null}
  </>;
}
