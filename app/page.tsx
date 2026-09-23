"use client";

import { useEffect, useMemo, useState } from "react";

type Check = {
  key: string;
  category: "seo" | "geo";
  title: string;
  status: "pass" | "warning" | "fail";
  message: string;
  fix: string;
  points: number;
  maxPoints: number;
  issue_id?: string;
  rule_id?: string;
  issue_status?: string;
  severity?: string;
  confidence?: string;
  evidence?: { url: string; found: unknown; details: string };
  fix_category?: "A" | "B" | "C";
};

type ScanResult = {
  mode: "seo" | "geo" | "both";
  scannedUrl: string;
  finalUrl: string;
  overallScore: number;
  grade: string;
  responseTime: number;
  httpStatus: number;
  seo: { score: number; grade: string; checks: Check[] };
  geo: { score: number; grade: string; checks: Check[] };
  metrics: {
    title: string;
    titleLength: number;
    description: string;
    descriptionLength: number;
    h1Count: number;
    h1s: string[];
    imageCount: number;
    imagesMissingAlt: number;
    wordCount: number;
    headingsCount: number;
    linksCount: number;
    internalLinks: number;
    canonical: string | null;
    lang: string | null;
    robots: string | null;
    openGraph: { title: string | null; description: string | null; image: string | null };
    imageAltCandidates?: { src: string }[];
    twitterCard: string | null;
    schemaTypes: string[];
    jsonLdBlocks: number;
    sitemapFound: boolean;
    robotsMentionsSitemap: boolean;
    recommendedSchema?: string;
    localBusinessDetails?: { name?: string | null; streetAddress?: string | null; postalCode?: string | null; addressLocality?: string | null; telephone?: string | null; email?: string | null; url?: string | null } | null;
  };
};

const statusIcon = { pass: "✓", warning: "!", fail: "×" };

const translations = {
  nl: {
    moreInfo:"Meer info", audit:"Audit", pricing:"Prijzen", resources:"Resources", contact:"Contact", login:"Inloggen", register:"Account aanmaken",
    badge:"SEO + GEO audit voor Google & AI Search", hero:"Vind wat je rankings blokkeert.", hero2:"Fix het met RankFix.",
    intro:"Eén snelle scan voor technische SEO, content, structured data en AI-search readiness. Eerst inzicht. Daarna concrete fixes — met AI wanneer jij dat activeert.",
    seoDesc:"Google & organische vindbaarheid", geoDesc:"AI Search & generatieve vindbaarheid", bothDesc:"Volledige analyse",
    start:"Gratis", auditStart:"audit starten →", scanning:"Scan wordt uitgevoerd…", noCard:"Geen creditcard", direct:"Direct rapport", both:"SEO + GEO",
    about:"Over RankFix", forWho:"Voor wie", company:"Bedrijf", product:"Product", language:"Taal",
    contactTitle:"Neem contact op.", contactText:"Vraag over RankFix, een samenwerking of hulp nodig? Stuur ons een bericht.",
    send:"Bericht versturen →", sending:"Verzenden…", thanks:"Bedankt! Je bericht is verzonden.",
    back:"← Terug naar RankFix AI"
  },
  en: {
    moreInfo:"More info", audit:"Audit", pricing:"Pricing", resources:"Resources", contact:"Contact", login:"Log in", register:"Create account",
    badge:"SEO + GEO audit for Google & AI Search", hero:"Find what is blocking your rankings.", hero2:"Fix it with RankFix.",
    intro:"One fast scan for technical SEO, content, structured data and AI-search readiness. Get insight first, then concrete fixes — with AI when you activate it.",
    seoDesc:"Google & organic visibility", geoDesc:"AI Search & generative visibility", bothDesc:"Full analysis",
    start:"Free", auditStart:"audit →", scanning:"Scan in progress…", noCard:"No credit card", direct:"Instant report", both:"SEO + GEO",
    about:"About RankFix", forWho:"Who it's for", company:"Company", product:"Product", language:"Language",
    contactTitle:"Get in touch.", contactText:"Questions about RankFix, a partnership or need help? Send us a message.",
    send:"Send message →", sending:"Sending…", thanks:"Thanks! Your message was sent.", back:"← Back to RankFix AI"
  },
  fr: {
    moreInfo:"En savoir plus", audit:"Audit", pricing:"Tarifs", resources:"Ressources", contact:"Contact", login:"Connexion", register:"Créer un compte",
    badge:"Audit SEO + GEO pour Google & AI Search", hero:"Trouvez ce qui bloque vos performances.", hero2:"Corrigez-le avec RankFix.",
    intro:"Un scan rapide du SEO technique, du contenu, des données structurées et de la visibilité dans l'IA. Analysez d'abord, corrigez ensuite.",
    seoDesc:"Google & visibilité organique", geoDesc:"AI Search & visibilité générative", bothDesc:"Analyse complète",
    start:"Audit", auditStart:"gratuit →", scanning:"Analyse en cours…", noCard:"Sans carte bancaire", direct:"Rapport immédiat", both:"SEO + GEO",
    about:"À propos de RankFix", forWho:"Pour qui", company:"Entreprise", product:"Produit", language:"Langue",
    contactTitle:"Contactez-nous.", contactText:"Une question sur RankFix, un partenariat ou besoin d'aide ? Envoyez-nous un message.",
    send:"Envoyer le message →", sending:"Envoi…", thanks:"Merci ! Votre message a été envoyé.", back:"← Retour à RankFix AI"
  },
  de: {
    moreInfo:"Mehr erfahren", audit:"Audit", pricing:"Preise", resources:"Ressourcen", contact:"Kontakt", login:"Anmelden", register:"Konto erstellen",
    badge:"SEO + GEO Audit für Google & AI Search", hero:"Finde, was deine Rankings blockiert.", hero2:"Behebe es mit RankFix.",
    intro:"Ein schneller Scan für technisches SEO, Inhalte, strukturierte Daten und AI-Search-Bereitschaft. Erst analysieren, dann konkrete Fixes umsetzen.",
    seoDesc:"Google & organische Sichtbarkeit", geoDesc:"AI Search & generative Sichtbarkeit", bothDesc:"Vollständige Analyse",
    start:"Kostenlos", auditStart:"Audit starten →", scanning:"Scan läuft…", noCard:"Keine Kreditkarte", direct:"Direkter Bericht", both:"SEO + GEO",
    about:"Über RankFix", forWho:"Für wen", company:"Unternehmen", product:"Produkt", language:"Sprache",
    contactTitle:"Kontakt aufnehmen.", contactText:"Fragen zu RankFix, eine Zusammenarbeit oder Hilfe nötig? Schreib uns.",
    send:"Nachricht senden →", sending:"Senden…", thanks:"Danke! Deine Nachricht wurde gesendet.", back:"← Zurück zu RankFix AI"
  },
  it: {
    moreInfo:"Scopri di più", audit:"Audit", pricing:"Prezzi", resources:"Risorse", contact:"Contatti", login:"Accedi", register:"Crea account",
    badge:"Audit SEO + GEO per Google & AI Search", hero:"Scopri cosa blocca il tuo ranking.", hero2:"Risolvilo con RankFix.",
    intro:"Una scansione rapida per SEO tecnico, contenuti, dati strutturati e visibilità nell'AI. Prima l'analisi, poi fix concreti.",
    seoDesc:"Google & visibilità organica", geoDesc:"AI Search & visibilità generativa", bothDesc:"Analisi completa",
    start:"Audit", auditStart:"gratuito →", scanning:"Scansione in corso…", noCard:"Nessuna carta", direct:"Report immediato", both:"SEO + GEO",
    about:"Chi è RankFix", forWho:"Per chi", company:"Azienda", product:"Prodotto", language:"Lingua",
    contactTitle:"Contattaci.", contactText:"Domande su RankFix, partnership o bisogno di aiuto? Inviaci un messaggio.",
    send:"Invia messaggio →", sending:"Invio…", thanks:"Grazie! Il messaggio è stato inviato.", back:"← Torna a RankFix AI"
  },
  es: {
    moreInfo:"Más información", audit:"Auditoría", pricing:"Precios", resources:"Recursos", contact:"Contacto", login:"Iniciar sesión", register:"Crear cuenta",
    badge:"Auditoría SEO + GEO para Google & AI Search", hero:"Descubre qué bloquea tus rankings.", hero2:"Arréglalo con RankFix.",
    intro:"Un escaneo rápido de SEO técnico, contenido, datos estructurados y preparación para búsquedas con IA. Primero analiza, después corrige.",
    seoDesc:"Google & visibilidad orgánica", geoDesc:"AI Search & visibilidad generativa", bothDesc:"Análisis completo",
    start:"Gratis", auditStart:"auditoría →", scanning:"Escaneo en curso…", noCard:"Sin tarjeta", direct:"Informe directo", both:"SEO + GEO",
    about:"Sobre RankFix", forWho:"Para quién", company:"Empresa", product:"Producto", language:"Idioma",
    contactTitle:"Contacta con nosotros.", contactText:"¿Preguntas sobre RankFix, colaboración o necesitas ayuda? Envíanos un mensaje.",
    send:"Enviar mensaje →", sending:"Enviando…", thanks:"¡Gracias! Tu mensaje ha sido enviado.", back:"← Volver a RankFix AI"
  }
} as const;

type Language = keyof typeof translations;

export default function Home() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [tab, setTab] = useState<"seo" | "geo">("seo");
  const [fixes, setFixes] = useState<Record<string, { title: string; content: string; reason: string }>>({});
  const [fixing, setFixing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [scanStep, setScanStep] = useState(0);
  const [auditMode, setAuditMode] = useState<"seo" | "geo" | "both">("both");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<Language>("nl");
  const t = translations[language];
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState("");


  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  }

  function startAudit(mode: "seo" | "geo" | "both") {
    setAuditMode(mode);
    setMobileMenuOpen(false);
    window.setTimeout(() => document.getElementById("scan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function handleContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setContactSending(true);
    setContactSent(false);
    setContactError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          company: form.get("company"),
          message: form.get("message"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bericht verzenden mislukt.");
      setContactSent(true);
      e.currentTarget.reset();
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Bericht verzenden mislukt.");
    } finally {
      setContactSending(false);
    }
  }

  const scanSteps = [
    "Meta tags controleren",
    "Laadsnelheid meten",
    "Content analyseren",
    "Mobile check uitvoeren",
    "Structured data controleren",
    "SEO & GEO signalen verwerken",
  ];

  useEffect(() => {
    if (!scanning) return;
    setScanStep(0);
    const timer = window.setInterval(() => setScanStep((step) => Math.min(step + 1, scanSteps.length - 1)), 850);
    return () => window.clearInterval(timer);
  }, [scanning]);

  function cleanFixContextValue(value: string) {
    return value.replace(/\s*\|\s*hide no longer\b/gi, "").replace(/\bhide no longer\b/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  async function generateFix(item: Check) {
    if (!result) return;
    setFixing(item.issue_id || item.key);
    try {
      const issueId = item.issue_id || item.rule_id || item.key;
      const type = issueId === "META_TITLE_MISSING" || issueId === "META_TITLE_GUIDANCE" || item.key === "title"
        ? "meta_title"
        : issueId === "META_DESCRIPTION_MISSING" || issueId === "META_DESCRIPTION_GUIDANCE" || item.key === "description"
          ? "meta_description"
          : issueId === "H1_MISSING" || issueId === "H1_MULTIPLE" || item.key === "h1"
            ? "h1"
            : issueId === "faq" || item.key === "faq"
              ? "faq"
              : issueId === "breadcrumbs" || item.key === "breadcrumbs"
                ? "breadcrumb"
                : issueId === "author" || item.key === "author"
                  ? "expertise"
                  : issueId === "SOCIAL_METADATA_INCOMPLETE" || item.key === "social"
                    ? "social_metadata"
                    : issueId === "headings" || item.key === "headings" || item.key === "heading_structure"
                      ? "heading_structure"
                      : issueId === "canonical" || item.key === "canonical" || item.key === "canonical_url"
                        ? "canonical"
                        : issueId === "IMAGE_ALT_MISSING" || item.key === "alt" || item.key === "IMAGE_ALT_MISSING"
                          ? "alt_text"
                          : "structured_data";
      // Social metadata is deterministic scan data; render the proposal immediately.
      if (type === "social_metadata") {
        const escapeAttr = (value: string) => {
          let decoded = value;
          for (let i = 0; i < 4; i++) {
            const next = decoded
              .replace(/&amp;/gi, "&")
              .replace(/&quot;/gi, '"')
              .replace(/&#39;/gi, "'")
              .replace(/&lt;/gi, "<")
              .replace(/&gt;/gi, ">")
              .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
                const point = code.toLowerCase().startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
                return Number.isFinite(point) ? String.fromCodePoint(point) : "";
              });
            if (next === decoded) break;
            decoded = next;
          }
          return decoded.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        const ogTitle = cleanFixContextValue(result.metrics.openGraph.title || result.metrics.title);
        const ogDescription = cleanFixContextValue(result.metrics.openGraph.description || result.metrics.description);
        const ogImage = cleanFixContextValue(result.metrics.openGraph.image || "");
        const content = [
          ogTitle ? `<meta property="og:title" content="${escapeAttr(ogTitle)}">` : "",
          ogDescription ? `<meta property="og:description" content="${escapeAttr(ogDescription)}">` : "",
          ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ""
        ].filter(Boolean).join("\n");
        setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
          title: "Open Graph metadata voorstel",
          content,
          reason: ogImage ? "Gebruikt bestaande paginatitel, beschrijving en gevonden Open Graph-afbeelding." : "Gebruikt bestaande paginatitel en beschrijving. Voeg og:image toe met een bestaande relevante pagina- of productafbeelding."
        }}));
        return;
      }
      const response = await fetch("/api/ai-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: result.finalUrl, issue_id: item.issue_id || item.key, request_id: crypto.randomUUID(), type, current: item.key === "title" ? result.metrics.title : item.key === "description" ? result.metrics.description : item.key === "h1" ? (result.metrics.h1s[0] || "") : "", context: { title: cleanFixContextValue(result.metrics.title), description: cleanFixContextValue(result.metrics.description), h1: cleanFixContextValue(result.metrics.h1s[0] || ""), canonical: cleanFixContextValue(result.metrics.canonical || ""), imageAltCandidates: result.metrics.imageAltCandidates || [], ogTitle: cleanFixContextValue(result.metrics.openGraph.title || ""), ogDescription: cleanFixContextValue(result.metrics.openGraph.description || ""), ogImage: cleanFixContextValue(result.metrics.openGraph.image || ""), ...(type === "structured_data" ? { recommendedSchema: result.metrics.recommendedSchema || "", ...(result.metrics.localBusinessDetails || {}) } : {}) }, issue_status: item.issue_status || (item.status === "warning" ? "WARNING" : item.status === "fail" ? "FAIL" : "PASS") }) });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Fix mislukt.");
      }
      setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: data.fix }));
    } catch (err) { setError(err instanceof Error ? err.message : "Fix mislukt."); }
    finally { setFixing(null); }
  }

  async function copyFix(key: string) {
    const content = fixes[key]?.content;
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setScanning(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode: auditMode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan mislukt.");
      setResult(data);
      setTab(auditMode === "geo" ? "geo" : "seo");
      setTimeout(() => document.getElementById("resultaat")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan mislukt.");
    } finally {
      setScanning(false);
    }
  }

  const activeChecks = result ? (tab === "seo" ? result.seo.checks : result.geo.checks) : [];
  const issues = useMemo(
    () => activeChecks.filter((item) => item.status !== "pass"),
    [activeChecks]
  );

  return (
    <main className="min-h-screen bg-[#050816] text-white selection:bg-cyan-400 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute right-[-180px] top-[520px] h-[420px] w-[420px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-50 mx-auto w-full border-b border-white/10 bg-[#050816]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-5 lg:px-8">
          <a href="#" className="flex shrink-0 items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 text-xs font-black text-slate-950 shadow-lg shadow-cyan-500/10">RF</span>
            <span className="text-lg font-bold tracking-tight">RankFix <span className="text-cyan-300">AI</span></span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-slate-400 lg:flex">
            <a href="#features" className="transition hover:text-white">{t.moreInfo}</a>
            <button type="button" onClick={() => scrollToSection("scan")} className="transition hover:text-white">{t.audit}</button>
            <a href="#prijzen" className="transition hover:text-white">{t.pricing}</a>
            <a href="#resources" className="transition hover:text-white">{t.resources}</a>
            <button type="button" onClick={() => setContactOpen(true)} className="transition hover:text-white">{t.contact}</button>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <label className="sr-only" htmlFor="language-desktop">Taal</label>
            <select id="language-desktop" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-xs font-medium text-white outline-none shadow-sm">
              <option value="nl" className="bg-slate-900 text-white">🇳🇱 Nederlands</option>
              <option value="en" className="bg-slate-900 text-white">🇬🇧 English</option>
              <option value="fr" className="bg-slate-900 text-white">🇫🇷 Français</option>
              <option value="de" className="bg-slate-900 text-white">🇩🇪 Deutsch</option>
              <option value="it" className="bg-slate-900 text-white">🇮🇹 Italiano</option>
              <option value="es" className="bg-slate-900 text-white">🇪🇸 Español</option>
            </select>
            <a href="/account?mode=login" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium transition hover:bg-white/10 sm:px-4 sm:text-sm">Inloggen</a>
            <a href="/account?mode=register" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-100 sm:px-4 sm:text-sm">Account aanmaken</a>
          </div>
          <button type="button" aria-label="Menu openen" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 lg:hidden">
            {mobileMenuOpen ? "×" : "☰"}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/10 px-4 pb-5 pt-3 lg:hidden">
            <div className="grid gap-1">
              {[[t.moreInfo,"#features"],[t.audit,"#scan"],[t.pricing,"#prijzen"],[t.resources,"#resources"],[t.contact,"#footer"]].map(([label,href]) => (
                label === "Contact" ? (
                  <button key={label} type="button" onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }} className="rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">{label}</button>
                ) : (
                  <a key={label} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">{label}</a>
                )
              ))}
            </div>
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
              <label className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500" htmlFor="language-mobile">Taal</label>
              <select id="language-mobile" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="w-full rounded-xl border border-white/20 bg-slate-900 px-4 py-3 text-sm font-medium text-white outline-none shadow-sm">
                <option value="nl">🇳🇱 Nederlands</option>
                <option value="en">🇬🇧 English</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="de">🇩🇪 Deutsch</option>
                <option value="it">🇮🇹 Italiano</option>
                <option value="es">🇪🇸 Español</option>
              </select>
              <a href="/account?mode=login" onClick={() => setMobileMenuOpen(false)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white">Inloggen</a>
              <a href="/account?mode=register" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-950">Account aanmaken</a>
            </div>
          </div>
        )}
      </nav>

      <section id="scan" className="mx-auto max-w-6xl px-5 pb-16 pt-16 text-center lg:px-8 lg:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs font-semibold text-cyan-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
          SEO + GEO audit voor Google & AI Search
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Vind wat je rankings blokkeert.
          <span className="block bg-gradient-to-r from-cyan-200 via-white to-blue-300 bg-clip-text text-transparent">Fix het met RankFix.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
          Eén snelle scan voor technische SEO, content, structured data en AI-search readiness.
          Eerst inzicht. Daarna concrete fixes — met AI wanneer jij dat activeert.
        </p>

        <div className="mx-auto mt-9 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl shadow-blue-950/30 backdrop-blur">
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {[
              ["seo", "SEO", "Google & organische vindbaarheid"],
              ["geo", "GEO", "AI Search & generatieve vindbaarheid"],
              ["both", "SEO + GEO", "Volledige analyse"],
            ].map(([value, label, description]) => (
              <button key={value} type="button" onClick={() => setAuditMode(value as "seo" | "geo" | "both")} className={`rounded-xl border px-4 py-3 text-left transition ${auditMode === value ? "border-cyan-300/50 bg-cyan-300/10 text-white shadow-lg shadow-cyan-500/5" : "border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20 hover:text-white"}`}>
                <div className="flex items-center gap-2 text-sm font-bold"><span className={`h-2 w-2 rounded-full ${auditMode === value ? "bg-cyan-300" : "bg-slate-700"}`} />{label}</div>
                <div className="mt-1 text-[11px] leading-4 text-slate-500">{description}</div>
              </button>
            ))}
          </div>
          <form onSubmit={handleScan} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="jouwdomein.nl"
              required
              className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-4 text-sm outline-none placeholder:text-slate-600"
            />
            <button
              disabled={scanning}
              className="rounded-xl bg-white px-6 py-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scanning ? t.scanning : `${t.start} ${auditMode === "seo" ? "SEO" : auditMode === "geo" ? "GEO" : "SEO + GEO"} ${t.auditStart}`}
            </button>
          </form>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
          <span>✓ {t.noCard}</span><span>✓ {t.direct}</span><span>✓ {t.both}</span><span>✓ Geen Base44 afhankelijkheid</span>
        </div>
        {error && <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

        <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
          {[
            ["SEO", "Techniek + on-page"],
            ["GEO", "AI-search readiness"],
            ["AI Fix", "Concrete verbeteringen"],
            ["Reports", "Klaar voor klanten"],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="text-sm font-bold">{title}</div>
              <div className="mt-1 text-xs text-slate-500">{text}</div>
            </div>
          ))}
        </div>
      </section>

      {scanning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02050d]/80 px-4 py-6 backdrop-blur-xl">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#080d1b]/95 p-5 shadow-2xl shadow-blue-950/50 sm:p-8">
            <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
            <div className="relative">
              <div className="mb-7 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20">RF</span>
                  <div><div className="text-sm font-bold">RankFix <span className="text-cyan-300">AI</span></div><div className="text-[11px] text-slate-500">SEO Scanner</div></div>
                </div>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">Live scan</span>
              </div>

              <div className="grid items-center gap-8 md:grid-cols-[240px_1fr]">
                <div className="mx-auto flex h-[210px] w-[210px] items-center justify-center sm:h-[235px] sm:w-[235px]">
                  <div className="relative flex h-full w-full items-center justify-center rounded-full border-[18px] border-slate-800/80 shadow-inner shadow-black/40">
                    <div className="absolute inset-[-18px] animate-[spin_2.2s_linear_infinite] rounded-full border-[18px] border-transparent border-t-cyan-300 border-r-blue-600 shadow-[0_0_35px_rgba(34,211,238,0.18)]" />
                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600/30 to-cyan-300/10 ring-1 ring-cyan-300/20">
                      <svg viewBox="0 0 24 24" className="h-10 w-10 text-cyan-200" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
                      <span className="mt-1 text-[11px] font-bold text-white">Scannen...</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Website analyseren</div>
                  <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">We zijn je website aan het controleren</h2>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300" />
                    <span className="truncate text-sm font-semibold text-slate-200">{url}</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    {scanSteps.map((step, index) => {
                      const done = index < scanStep;
                      const active = index === scanStep;
                      return <div key={step} className={`flex items-center gap-3 text-sm transition-all duration-500 ${done ? "text-emerald-300" : active ? "text-white" : "text-slate-600"}`}>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${done ? "border-emerald-400/40 bg-emerald-400/10" : active ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-white/[0.02]"}`}>
                          {done ? "✓" : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />}
                        </span>
                        <span>{step}</span>
                        {active && <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-cyan-300">bezig</span>}
                      </div>;
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5 text-[11px] text-slate-600">
                <span>SEO · GEO · Performance · Content</span>
                <span>Even geduld…</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <section id="resultaat" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-12 lg:px-8">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Live audit</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Jouw kansen, op één scherm.</h2>
              <p className="mt-1 max-w-2xl break-all text-xs text-slate-500">{result.finalUrl}</p>
            </div>
            <div className="text-xs text-slate-500">{result.responseTime} ms · HTTP {result.httpStatus}</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overall</div>
              <div className="mt-2 text-6xl font-black tracking-tighter text-cyan-300">{result.overallScore}</div>
              <div className="mt-1 text-sm text-slate-500">Grade {result.grade}</div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500" style={{ width: `${result.overallScore}%` }} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {([["seo", result.seo], ["geo", result.geo]] as const)
                  .filter(([key]) => result.mode === "both" || result.mode === key)
                  .map(([key, data]) => (
                    <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-xl border px-3 py-2 text-left transition ${tab === key ? "border-cyan-300/30 bg-cyan-300/10 text-white" : "border-white/10 bg-white/[0.02] text-slate-500 hover:text-white"}`}>
                      <div className="text-[10px] font-bold uppercase tracking-widest">{key}</div>
                      <div className="mt-1 text-xl font-black">{data.score}</div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="space-y-4">
              {issues.length > 0 ? (
                <div className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.035] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Belangrijkste acties</div>
                      <div className="mt-1 text-lg font-black">{issues.length} {issues.length === 1 ? "verbeterpunt" : "verbeterpunten"}</div>
                    </div>
                    <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">Fix eerst</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {issues.slice(0, 5).map((item) => (
                      <div key={item.issue_id || item.key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-3">
                        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${item.status === "warning" ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"}`}>{statusIcon[item.status]}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{item.title}</div>
                          <p className="mt-0.5 text-sm leading-5 text-slate-500">{item.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5">
                  <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Alles gecontroleerd</div>
                  <div className="mt-1 text-lg font-black">Geen actieve verbeterpunten gevonden.</div>
                </div>
              )}

              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{tab.toUpperCase()} audit</div>
                    <div className="mt-1 text-lg font-black">{activeChecks.filter((item) => item.status === "pass").length} controles geslaagd</div>
                  </div>
                  <span className="text-xs text-slate-600">{activeChecks.length} controles</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeChecks.filter((item) => item.status === "pass").slice(0, 8).map((item) => (
                    <span key={item.issue_id || item.key} className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.04] px-3 py-1.5 text-xs text-emerald-200">✓ {item.title}</span>
                  ))}
                  {activeChecks.filter((item) => item.status === "pass").length > 8 && (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-500">+{activeChecks.filter((item) => item.status === "pass").length - 8} meer</span>
                  )}
                </div>
              </div>

              <details className="rounded-3xl border border-white/10 bg-white/[0.025]">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-300">
                  <span className="mr-2">⌄</span> Bekijk alle technische details
                </summary>
                <div className="border-t border-white/10 px-5 py-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeChecks.map((item) => (
                      <div key={item.issue_id || item.key} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${item.status === "pass" ? "text-emerald-300" : item.status === "warning" ? "text-amber-300" : "text-red-300"}`}>{statusIcon[item.status]}</span>
                          <span className="text-sm font-semibold">{item.title}</span>
                          <span className="ml-auto text-[10px] text-slate-600">{item.points}/{item.maxPoints}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.message}</p>
                        {item.status !== "pass" && (
                          <div className="mt-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.04] p-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">RankFix recommendation</div>
                            <p className="mt-1 text-xs leading-5 text-slate-300">{item.fix}</p>
                            <button type="button" onClick={() => generateFix(item)} disabled={fixing === (item.issue_id || item.key)} className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10 disabled:opacity-50">
                              {fixing === (item.issue_id || item.key) ? "AI analyseert…" : "✨ Fix met AI"}
                            </button>
                            {fixes[item.issue_id || item.key] && (
                              <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{fixes[item.issue_id || item.key].title}</div>
                                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{fixes[item.issue_id || item.key].content}</div>
                                <p className="mt-2 text-xs text-slate-500">{fixes[item.issue_id || item.key].reason}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => copyFix(item.issue_id || item.key)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950">{copied === (item.issue_id || item.key) ? "Gekopieerd ✓" : "Gebruik deze tekst"}</button>
                                  <a href={`/dashboard/github?issue=${encodeURIComponent((item.issue_id || item.key) + ": " + item.fix)}&context=${encodeURIComponent("URL: " + result.finalUrl + "\nHuidige title: " + cleanFixContextValue(result.metrics.title) + "\nHuidige description: " + cleanFixContextValue(result.metrics.description) + "\nH1: " + cleanFixContextValue(result.metrics.h1s[0] || ""))}`} className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-bold text-cyan-200">Fix via GitHub →</a>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              <details className="rounded-3xl border border-white/10 bg-white/[0.025]">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-300">
                  <span className="mr-2">⌄</span> Kernmetrics
                </summary>
                <div className="grid grid-cols-2 gap-3 border-t border-white/10 px-5 py-4 sm:grid-cols-3">
                  {[
                    ["H1", result.metrics.h1Count],
                    ["Woorden", result.metrics.wordCount],
                    ["Afbeeldingen", result.metrics.imageCount],
                    ["Interne links", result.metrics.internalLinks],
                    ["JSON-LD", result.metrics.jsonLdBlocks],
                    ["Schema types", result.metrics.schemaTypes.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/5 bg-black/10 p-3">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="mt-1 text-lg font-bold">{value}</div>
                    </div>
                  ))}
                </div>
              </details>

              <div className="rounded-3xl border border-cyan-400/10 bg-cyan-400/[0.04] p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-cyan-300">AI action layer</div>
                <div className="mt-1 text-lg font-black">{issues.length} {issues.length === 1 ? "fix" : "fixes"} beschikbaar</div>
                <p className="mt-1 text-sm leading-5 text-slate-500">Open een probleem voor een concrete AI-fix of implementatie via GitHub.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="features" className="mx-auto max-w-7xl scroll-mt-8 border-t border-white/10 px-5 py-20 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Built to fix, not just report</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Van scan naar actie.</h2>
          <p className="mt-4 text-slate-400">RankFix wordt een klantvriendelijk platform: ontdek het probleem, begrijp waarom het telt en krijg vervolgens een concrete oplossing.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["01", "SEO audit", "Technische SEO, metadata, headings, content, links, HTTPS, social metadata, sitemap en meer."],
            ["02", "GEO audit", "Structured data, entities, FAQ/Q&A, expertise, trust en machine-leesbare context voor AI-search."],
            ["03", "AI action layer", "Meta titles, descriptions, content en technische voorstellen genereren — met review en controle vóór publicatie."],
          ].map(([number, title, text]) => (
            <div key={number} className="group rounded-3xl border border-white/10 bg-white/[0.025] p-7 transition hover:-translate-y-1 hover:bg-white/[0.04]">
              <div className="text-xs font-black text-cyan-300">{number}</div>
              <h3 className="mt-10 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="prijzen" className="mx-auto max-w-7xl scroll-mt-8 border-t border-white/10 px-5 py-20 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Simple pricing</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Betaal voor gebruik. Niet voor ruis.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-500">We bouwen een transparant creditmodel met een gratis instapscan, zodat kleine bedrijven kunnen starten en agencies kunnen opschalen.</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            ["Free", "€0", "Eerste scan", ["1 gratis audit", "SEO + GEO score", "Actiepunten", "Geen creditcard"]],
            ["Pro", "€19", "per maand", ["Meer scans", "AI fixes", "Scan history", "PDF rapporten"]],
            ["Agency", "€49", "per maand", ["Meerdere klanten", "White-label reports", "Credits voor AI", "Team & dashboard"]],
          ].map((entry) => { const [name, price, period, items] = entry as [string, string, string, string[]]; return (
            <div key={name} className={`rounded-3xl border p-7 ${name === "Pro" ? "border-cyan-400/30 bg-cyan-400/[0.05]" : "border-white/10 bg-white/[0.025]"}`}>
              <div className="text-sm font-bold">{name}</div>
              <div className="mt-5 text-4xl font-black">{price}</div>
              <div className="mt-1 text-xs text-slate-500">{period}</div>
              <div className="my-6 h-px bg-white/10" />
              <ul className="space-y-3 text-sm text-slate-400">{(items as string[]).map((item) => <li key={item}>✓ {item}</li>)}</ul>
              <button className="mt-7 w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/5">Binnenkort beschikbaar</button>
            </div>
          ); })}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            {[
              ["Websites", "SEO & GEO audits voor publieke webpagina's."],
              ["Webshops", "Product-, categorie- en contentflows komen in de volgende auditlaag."],
              ["Apps", "Publieke app-landingspagina's en store-content kunnen straks worden geanalyseerd."],
              ["Agencies", "Klantprojecten, credits, rapporten en white-label workflows."],
            ].map(([title, text]) => <div key={title}><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}
          </div>
        </div>
      </section>

      {contactOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#080d1b] p-6 shadow-2xl sm:p-8">
            <button type="button" onClick={() => setContactOpen(false)} aria-label="Contactformulier sluiten" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:text-white">×</button>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{t.contact}</div>
            <h2 className="mt-2 text-3xl font-black">{t.contactTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{t.contactText}</p>
            <form onSubmit={handleContact} className="mt-6 space-y-4">
              <input name="name" required placeholder="Naam" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
              <input name="email" required type="email" placeholder="E-mailadres" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
              <input name="company" placeholder="Bedrijf (optioneel)" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
              <textarea name="message" required rows={5} placeholder="Waar kunnen we mee helpen?" className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
              {contactError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{contactError}</div>}
              {contactSent && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{t.thanks}</div>}
              <button disabled={contactSending} className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 disabled:opacity-50">{contactSending ? t.sending : t.send}</button>
            </form>
          </div>
        </div>
      )}

      <section id="resources" className="border-y border-white/10 bg-white/[0.02] scroll-mt-8">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{t.resources}</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight">Alles om van audit naar actie te gaan.</h2>
            <p className="mt-4 text-slate-500">Gebruik RankFix voor audits, concrete fixes, klantrapporten en lokale SEO-data.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["SEO Audit", "Technische en on-page signalen."],
              ["GEO Audit", "Structured data en AI-search signalen."],
              ["Local SEO", "LocalBusiness, locaties, openingstijden en officiële profielen."]
            ].map(([title,text]) => <button key={title} type="button" onClick={() => title === "SEO Audit" ? startAudit("seo") : title === "GEO Audit" ? startAudit("geo") : scrollToSection("scan")} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.05]"><div className="font-bold">{title}</div><div className="mt-2 text-sm text-slate-500">{text}</div></button>)}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 lg:px-8">
        <div className="max-w-3xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{t.about}</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight">RankFix maakt SEO en GEO begrijpelijk én uitvoerbaar.</h2>
          <p className="mt-4 leading-7 text-slate-500">Voor lokale bedrijven, webshops, agencies en SaaS. Van een eerste gratis audit tot concrete fixes en klantklare rapporten.</p>
        </div>
      </section>

      <footer id="footer" className="bg-[#03050d] px-5 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300 text-xs font-black text-slate-950">RF</span><span className="font-bold">RankFix AI</span></div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">SEO + GEO audit software voor bedrijven en agencies die willen weten wat ze moeten fixen — en het daarna ook willen fixen.</p>
          </div>
          {[
            [t.product, ["SEO Audit", "GEO Audit", "AI Fixes", "Reports"]],
            [t.forWho, ["Bedrijven", "Webshops", "Agencies", "SaaS"]],
            [t.company, ["Over RankFix", "Contact", "Privacy", "Voorwaarden"]],
          ].map((entry) => {
            const [title, links] = entry as [string, string[]];
            return (
              <div key={title}>
                <div className="text-sm font-bold">{title}</div>
                <div className="mt-4 space-y-3 text-sm text-slate-500">
                  {links.map((link) => (
                    <button
                      type="button"
                      onClick={() => {
                        if (link === "Privacy") window.location.href = "/privacy";
                        else if (link === "Voorwaarden") window.location.href = "/voorwaarden";
                        else if (link === "SEO Audit") startAudit("seo");
                        else if (link === "GEO Audit") startAudit("geo");
                        else if (link === "AI Fixes") scrollToSection("features");
                        else if (link === "Reports") scrollToSection(document.getElementById("resultaat") ? "resultaat" : "scan");
                        else if (link === "Contact") setContactOpen(true);
                        else if (link === "Over RankFix") scrollToSection("about");
                        else scrollToSection("scan");
                      }}
                      className="block text-left hover:text-white"
                    >
                      {link}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-600 sm:flex-row">
          <span>© 2026 RankFix AI. Alle rechten voorbehouden.</span>
          <span>SEO · GEO · AI Search · Built independent</span>
        </div>
      </footer>
    </main>
  );
}
