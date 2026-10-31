// PDF P10: "Beveiliging en toegankelijkheid" action block, sorted by impact.
// Shows only proven findings (warning/fail) with their evidence and examples.
import type { SecurityAccessAction } from "@/lib/security-access-actions";

const T: Record<string, { title: string; intro: string; impact: Record<string, string>; evidence: string; action: string; example: string; none: string }> = {
  nl: { title: "Beveiliging en toegankelijkheid", intro: "Acties op basis van openbaar zichtbare instellingen in de response en de HTML, gesorteerd op impact. Telt niet mee in de SEO/GEO-score. Geen actieve kwetsbaarheidstest.", impact: { high: "Hoge impact", medium: "Middelhoge impact", low: "Lage impact" }, evidence: "Bewijs", action: "Actie", example: "Voorbeeldconfiguratie", none: "Geen bewezen beveiligings- of toegankelijkheidsacties in de gecontroleerde response en HTML." },
  en: { title: "Security and accessibility", intro: "Actions based on publicly visible settings in the response and HTML, sorted by impact. Not included in the SEO/GEO score. No active vulnerability testing.", impact: { high: "High impact", medium: "Medium impact", low: "Low impact" }, evidence: "Evidence", action: "Action", example: "Example configuration", none: "No proven security or accessibility actions in the checked response and HTML." },
  de: { title: "Sicherheit und Barrierefreiheit", intro: "Maßnahmen auf Basis öffentlich sichtbarer Einstellungen in Antwort und HTML, nach Wirkung sortiert. Fließt nicht in den SEO/GEO-Score ein. Kein aktiver Schwachstellentest.", impact: { high: "Hohe Wirkung", medium: "Mittlere Wirkung", low: "Geringe Wirkung" }, evidence: "Nachweis", action: "Maßnahme", example: "Beispielkonfiguration", none: "Keine nachgewiesenen Sicherheits- oder Barrierefreiheitsmaßnahmen in der geprüften Antwort und HTML." },
  fr: { title: "Sécurité et accessibilité", intro: "Actions fondées sur les paramètres publiquement visibles dans la réponse et le HTML, triées par impact. Non incluses dans le score SEO/GEO. Aucun test actif de vulnérabilité.", impact: { high: "Impact élevé", medium: "Impact moyen", low: "Impact faible" }, evidence: "Preuve", action: "Action", example: "Exemple de configuration", none: "Aucune action de sécurité ou d’accessibilité prouvée dans la réponse et le HTML contrôlés." },
  it: { title: "Sicurezza e accessibilità", intro: "Azioni basate sulle impostazioni pubblicamente visibili nella risposta e nell’HTML, ordinate per impatto. Non incluse nel punteggio SEO/GEO. Nessun test attivo di vulnerabilità.", impact: { high: "Impatto alto", medium: "Impatto medio", low: "Impatto basso" }, evidence: "Prova", action: "Azione", example: "Configurazione di esempio", none: "Nessuna azione di sicurezza o accessibilità dimostrata nella risposta e nell’HTML controllati." },
  es: { title: "Seguridad y accesibilidad", intro: "Acciones basadas en la configuración visible públicamente en la respuesta y el HTML, ordenadas por impacto. No cuentan en la puntuación SEO/GEO. Sin pruebas activas de vulnerabilidades.", impact: { high: "Impacto alto", medium: "Impacto medio", low: "Impacto bajo" }, evidence: "Prueba", action: "Acción", example: "Configuración de ejemplo", none: "No hay acciones de seguridad o accesibilidad demostradas en la respuesta y el HTML revisados." },
};

export function SecurityAccessActions({ actions, language }: { actions?: SecurityAccessAction[]; language: string }) {
  if (!Array.isArray(actions)) return null;
  const t = T[language] || T.en;
  return (
    <section>
      <h2>{t.title}</h2>
      <div className="box">
        <p className="meta">{t.intro}</p>
        {actions.length === 0 ? <p>{t.none}</p> : actions.map((a, i) => (
          <div className="diagnostic-block" key={a.key + i}>
            <p><b>{i + 1}. {a.title}</b> · {t.impact[a.impact]}</p>
            <p><b>{t.evidence}:</b> {a.evidence}</p>
            {a.action && <p><b>{t.action}:</b> {a.action}</p>}
            {a.examples.length > 0 && <><p><b>{t.example}:</b></p><pre>{a.examples.join("\n")}</pre></>}
          </div>
        ))}
      </div>
    </section>
  );
}
