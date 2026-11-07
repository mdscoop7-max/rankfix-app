import { formatSpeedField, formatSpeedLab, speedAdviceMessage, speedFailureMessage } from "@/lib/speed-display";
import type { Locale } from "@/lib/locales";
import type { SpeedDevice, WebsiteSpeed } from "@/lib/pagespeed";

const copy: Record<Locale, {
  title: string; description: string; mobile: string; desktop: string;
  missing: string; why: string; lab: string; field: string; noInp: string;
}> = {
  nl: {
    title: "Website Speed", description: "Snelheidsmetingen voor mobiel en desktop binnen dezelfde audit, indien beschikbaar.",
    mobile: "Mobiel", desktop: "Desktop", missing: "Niet gemeten",
    why: "Niet gemeten is geen bewezen traagheidsprobleem. Snelheid verandert de SEO/GEO-score niet; een fix vereist aparte beoordeling.",
    lab: "Labmeting", field: "Echte gebruikers (LCP, CLS en INP)", noInp: "geen veldgegevens",
  },
  en: {
    title: "Website Speed", description: "Mobile and desktop performance measurements within this audit, when available.",
    mobile: "Mobile", desktop: "Desktop", missing: "Not measured",
    why: "An unavailable measurement is not proof of a slow website. Speed does not change SEO/GEO scores; fixes require separate review.",
    lab: "Lab measurement", field: "Real users (LCP, CLS, INP)", noInp: "no field data",
  },
  de: {
    title: "Website Speed", description: "Mobil- und Desktop-Messungen innerhalb desselben Audits, sofern verfügbar.",
    mobile: "Mobil", desktop: "Desktop", missing: "Nicht gemessen",
    why: "Eine fehlende Messung beweist keine langsame Website. Die SEO/GEO-Werte bleiben unverändert; Fixes benötigen eine gesonderte Prüfung.",
    lab: "Labormessung", field: "Echte Nutzer (LCP, CLS, INP)", noInp: "keine Felddaten",
  },
  fr: {
    title: "Website Speed", description: "Mesures mobile et ordinateur dans cet audit, si disponibles.",
    mobile: "Mobile", desktop: "Ordinateur", missing: "Non mesuré",
    why: "Une mesure indisponible ne prouve pas un site lent. Les scores SEO/GEO restent inchangés ; tout correctif exige un examen.",
    lab: "Mesure labo", field: "Utilisateurs réels (LCP, CLS, INP)", noInp: "pas de données terrain",
  },
  it: {
    title: "Website Speed", description: "Misurazioni mobile e desktop nella stessa analisi, se disponibili.",
    mobile: "Mobile", desktop: "Desktop", missing: "Non misurato",
    why: "Una misura mancante non dimostra che il sito sia lento. I punteggi SEO/GEO restano invariati; le correzioni richiedono revisione.",
    lab: "Misura laboratorio", field: "Utenti reali (LCP, CLS, INP)", noInp: "dati sul campo non disponibili",
  },
  es: {
    title: "Website Speed", description: "Mediciones móviles y de escritorio en esta auditoría, cuando estén disponibles.",
    mobile: "Móvil", desktop: "Escritorio", missing: "Sin medir",
    why: "Una medición no disponible no demuestra que el sitio sea lento. SEO/GEO no cambia; las correcciones requieren revisión.",
    lab: "Medición de laboratorio", field: "Usuarios reales (LCP, CLS, INP)", noInp: "sin datos de campo",
  },
};


const fieldSource: Record<Locale, {url:string;origin:string}> = {
  nl:{url:"Echte gebruikers op deze URL (28 dagen)",origin:"Echte gebruikers van het hele domein (28 dagen; niet specifiek deze pagina)"},
  en:{url:"Real users on this URL (28 days)",origin:"Real users across the origin (28 days; not page-specific)"},
  de:{url:"Echte Nutzer auf dieser URL (28 Tage)",origin:"Echte Nutzer der gesamten Domain (28 Tage; nicht seitenspezifisch)"},
  fr:{url:"Utilisateurs réels sur cette URL (28 jours)",origin:"Utilisateurs réels du domaine entier (28 jours ; pas uniquement cette page)"},
  it:{url:"Utenti reali di questo URL (28 giorni)",origin:"Utenti reali dell’intero dominio (28 giorni; non della sola pagina)"},
  es:{url:"Usuarios reales de esta URL (28 días)",origin:"Usuarios reales de todo el dominio (28 días; no solo esta página)"},
};

function DeviceCard({
  value, label, dark, unavailable, lab, field, noInp, locale,
}: {
  value?: SpeedDevice | null; label: string; dark: boolean; locale: Locale;
  unavailable: string; lab: string; field: string; noInp: string;
}) {
  const measured = value?.status === "measured" && value.score !== null;
  const hasField = value?.field && [value.field.lcpMs, value.field.cls, value.field.inpMs].some(x => x != null);
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${dark ? "border-slate-600 bg-[#0B2038]" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-sm font-bold">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">
        {measured ? `${value.score}/100` : unavailable}
      </div>
      {measured ? (
        <div className="mt-2 space-y-1 text-xs leading-5">
          <p><b>{lab}</b>: {formatSpeedLab(value?.lab)}</p>
          <p><b>{field}</b>: {hasField ? formatSpeedField(value?.field) : noInp}</p>
          {hasField && <p>{fieldSource[locale][value?.field?.scope === "origin" ? "origin" : "url"]}</p>}
          {Boolean(value?.advice?.length) && <div className="mt-2 border-t border-current/15 pt-2">
            <b>Lighthouse</b>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {value?.advice?.map((tip, index) => <li key={tip.auditId + index}>
                {speedAdviceMessage(tip.kind, locale)}
                {tip.target && <span className="break-all"> — {tip.target}</span>}
                <span className="opacity-70"> ({tip.auditId})</span>
              </li>)}
            </ul>
          </div>}
        </div>
      ) : (
        <p className={`mt-2 text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>{speedFailureMessage(value, locale)}</p>
      )}
    </div>
  );
}

/** Renders existing /api/scan evidence; it does not start a separate scan. */
export default function SpeedAudit({
  locale, speed, dark = false,
}: {
  locale: Locale; speed?: WebsiteSpeed | null; dark?: boolean;
}) {
  const t = copy[locale];
  return (
    <section aria-label={t.title} className={`my-4 rounded-2xl border p-4 text-left sm:p-5 ${dark ? "border-cyan-300/20 bg-[#102A46] text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
      <div className="mb-3">
        <h2 className="text-lg font-extrabold">{t.title}</h2>
        <p className={`mt-1 text-xs leading-5 ${dark ? "text-slate-300" : "text-slate-600"}`}>{t.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DeviceCard locale={locale} value={speed?.mobile} label={t.mobile} dark={dark} unavailable={t.missing} lab={t.lab} field={t.field} noInp={t.noInp} />
        <DeviceCard locale={locale} value={speed?.desktop} label={t.desktop} dark={dark} unavailable={t.missing} lab={t.lab} field={t.field} noInp={t.noInp} />
      </div>
      <p className={`mt-3 text-xs leading-5 ${dark ? "text-slate-300" : "text-slate-600"}`}>{t.why}</p>
    </section>
  );
}
