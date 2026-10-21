import type { Locale } from "@/lib/locales";

// Informational preview only. The current SEO/GEO scan does not measure
// separate mobile/desktop Lighthouse scores or Core Web Vitals.
const messages: Record<Locale, {
  eyebrow: string;
  comingSoon: string;
  description: string;
  currentLimit: string;
  mobile: string;
  desktop: string;
  unavailable: string;
}> = {
  nl: {
    eyebrow: "Extra dienst",
    comingSoon: "Binnenkort",
    description: "Een aparte snelheidscontrole voor mobiel en desktop, met Core Web Vitals en praktische verbeteradviezen.",
    currentLimit: "Nog in ontwikkeling: de gratis scan hierboven voert deze snelheidsmeting nog niet uit.",
    mobile: "Mobiel",
    desktop: "Desktop",
    unavailable: "Nog niet gemeten",
  },
  en: {
    eyebrow: "Additional service",
    comingSoon: "Coming soon",
    description: "A separate mobile and desktop speed check, with Core Web Vitals and practical recommendations.",
    currentLimit: "In development: the free scan above does not yet run these speed measurements.",
    mobile: "Mobile",
    desktop: "Desktop",
    unavailable: "Not measured yet",
  },
  de: {
    eyebrow: "Zusatzdienst",
    comingSoon: "Demnächst",
    description: "Eine separate Geschwindigkeitsprüfung für Mobilgeräte und Desktop mit Core Web Vitals und praktischen Empfehlungen.",
    currentLimit: "In Entwicklung: Der kostenlose Scan oben führt diese Geschwindigkeitsmessung noch nicht durch.",
    mobile: "Mobil",
    desktop: "Desktop",
    unavailable: "Noch nicht gemessen",
  },
  fr: {
    eyebrow: "Service supplémentaire",
    comingSoon: "Bientôt",
    description: "Une analyse de vitesse distincte sur mobile et ordinateur, avec Core Web Vitals et conseils pratiques.",
    currentLimit: "En cours de développement : l’analyse gratuite ci-dessus ne mesure pas encore ces performances.",
    mobile: "Mobile",
    desktop: "Ordinateur",
    unavailable: "Pas encore mesuré",
  },
  it: {
    eyebrow: "Servizio aggiuntivo",
    comingSoon: "Prossimamente",
    description: "Un controllo separato della velocità su mobile e desktop, con Core Web Vitals e consigli pratici.",
    currentLimit: "In sviluppo: la scansione gratuita qui sopra non esegue ancora queste misurazioni.",
    mobile: "Mobile",
    desktop: "Desktop",
    unavailable: "Non ancora misurato",
  },
  es: {
    eyebrow: "Servicio adicional",
    comingSoon: "Próximamente",
    description: "Una prueba de velocidad independiente para móvil y escritorio, con Core Web Vitals y recomendaciones prácticas.",
    currentLimit: "En desarrollo: el análisis gratuito anterior todavía no realiza estas mediciones.",
    mobile: "Móvil",
    desktop: "Escritorio",
    unavailable: "Aún sin medir",
  },
};

export default function SpeedPromo({
  locale,
  variant = "light",
}: {
  locale: Locale;
  variant?: "light" | "dark";
}) {
  const t = messages[locale];
  const dark = variant === "dark";
  return (
    <section
      aria-label={`RankFix Speed — ${t.comingSoon}`}
      className={`mx-auto mt-5 w-full max-w-3xl rounded-2xl border p-4 text-left sm:p-5 ${dark ? "border-cyan-300/20 bg-[#102A46] text-white" : "border-slate-200 bg-white text-slate-900 shadow-sm"}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${dark ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
            {t.eyebrow} · {t.comingSoon}
          </span>
          <h2 className="mt-2 text-lg font-extrabold tracking-tight">RankFix Speed</h2>
          <p className={`mt-1 text-sm leading-6 ${dark ? "text-slate-200" : "text-slate-600"}`}>{t.description}</p>
          <p className={`mt-2 text-xs leading-5 ${dark ? "text-slate-300" : "text-slate-500"}`}>{t.currentLimit}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-[226px] sm:shrink-0">
          {[
            { symbol: "📱", label: t.mobile },
            { symbol: "🖥️", label: t.desktop },
          ].map(({ symbol, label }) => (
            <div key={label} className={`rounded-xl border px-2 py-3 text-center ${dark ? "border-slate-500/30 bg-[#081A30]" : "border-slate-200 bg-slate-50"}`}>
              <div aria-hidden="true" className="text-lg">{symbol}</div>
              <div className="text-xs font-bold">{label}</div>
              <div className={`mt-1 text-[10px] leading-4 ${dark ? "text-slate-300" : "text-slate-500"}`}>{t.unavailable}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
