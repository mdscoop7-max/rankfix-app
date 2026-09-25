"use client";

import { useEffect, useMemo, useState } from "react";
import AiAssistant from "@/components/ai-assistant";
import RootMobileNav from "./root-mobile-nav";
import PublicReviews from "@/components/public-reviews";
import "./root-mobile-nav.css";

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
  fix_status?: "WAITING" | "DONE";
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
    moreInfo:"Zo werkt het", audit:"Gratis scan", pricing:"Prijzen", resources:"Resources", contact:"Contact", login:"Inloggen", register:"Account aanmaken",
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
    moreInfo:"How it works", audit:"Free scan", pricing:"Pricing", resources:"Resources", contact:"Contact", login:"Log in", register:"Create account",
    badge:"SEO + GEO audit for Google & AI Search", hero:"Find what is blocking your rankings.", hero2:"Fix it with RankFix.",
    intro:"One fast scan for technical SEO, content, structured data and AI-search readiness. Get insight first, then concrete fixes — with AI when you activate it.",
    seoDesc:"Google & organic visibility", geoDesc:"AI Search & generative visibility", bothDesc:"Full analysis",
    start:"Free", auditStart:"audit →", scanning:"Scan in progress…", noCard:"No credit card", direct:"Instant report", both:"SEO + GEO",
    about:"About RankFix", forWho:"Who it's for", company:"Company", product:"Product", language:"Language",
    contactTitle:"Get in touch.", contactText:"Questions about RankFix, a partnership or need help? Send us a message.",
    send:"Send message →", sending:"Sending…", thanks:"Thanks! Your message was sent.", back:"← Back to RankFix AI"
  },
  fr: {
    moreInfo:"Comment ça marche", audit:"Audit gratuit", pricing:"Tarifs", resources:"Ressources", contact:"Contact", login:"Connexion", register:"Créer un compte",
    badge:"Audit SEO + GEO pour Google & AI Search", hero:"Trouvez ce qui bloque vos performances.", hero2:"Corrigez-le avec RankFix.",
    intro:"Un scan rapide du SEO technique, du contenu, des données structurées et de la visibilité dans l'IA. Analysez d'abord, corrigez ensuite.",
    seoDesc:"Google & visibilité organique", geoDesc:"AI Search & visibilité générative", bothDesc:"Analyse complète",
    start:"Audit", auditStart:"gratuit →", scanning:"Analyse en cours…", noCard:"Sans carte bancaire", direct:"Rapport immédiat", both:"SEO + GEO",
    about:"À propos de RankFix", forWho:"Pour qui", company:"Entreprise", product:"Produit", language:"Langue",
    contactTitle:"Contactez-nous.", contactText:"Une question sur RankFix, un partenariat ou besoin d'aide ? Envoyez-nous un message.",
    send:"Envoyer le message →", sending:"Envoi…", thanks:"Merci ! Votre message a été envoyé.", back:"← Retour à RankFix AI"
  },
  de: {
    moreInfo:"So funktioniert’s", audit:"Kostenloser Scan", pricing:"Preise", resources:"Ressourcen", contact:"Kontakt", login:"Anmelden", register:"Konto erstellen",
    badge:"SEO + GEO Audit für Google & AI Search", hero:"Finde, was deine Rankings blockiert.", hero2:"Behebe es mit RankFix.",
    intro:"Ein schneller Scan für technisches SEO, Inhalte, strukturierte Daten und AI-Search-Bereitschaft. Erst analysieren, dann konkrete Fixes umsetzen.",
    seoDesc:"Google & organische Sichtbarkeit", geoDesc:"AI Search & generative Sichtbarkeit", bothDesc:"Vollständige Analyse",
    start:"Kostenlos", auditStart:"Audit starten →", scanning:"Scan läuft…", noCard:"Keine Kreditkarte", direct:"Direkter Bericht", both:"SEO + GEO",
    about:"Über RankFix", forWho:"Für wen", company:"Unternehmen", product:"Produkt", language:"Sprache",
    contactTitle:"Kontakt aufnehmen.", contactText:"Fragen zu RankFix, eine Zusammenarbeit oder Hilfe nötig? Schreib uns.",
    send:"Nachricht senden →", sending:"Senden…", thanks:"Danke! Deine Nachricht wurde gesendet.", back:"← Zurück zu RankFix AI"
  },
  it: {
    moreInfo:"Come funziona", audit:"Analisi gratuita", pricing:"Prezzi", resources:"Risorse", contact:"Contatti", login:"Accedi", register:"Crea account",
    badge:"Audit SEO + GEO per Google & AI Search", hero:"Scopri cosa blocca il tuo ranking.", hero2:"Risolvilo con RankFix.",
    intro:"Una scansione rapida per SEO tecnico, contenuti, dati strutturati e visibilità nell'AI. Prima l'analisi, poi fix concreti.",
    seoDesc:"Google & visibilità organica", geoDesc:"AI Search & visibilità generativa", bothDesc:"Analisi completa",
    start:"Audit", auditStart:"gratuito →", scanning:"Scansione in corso…", noCard:"Nessuna carta", direct:"Report immediato", both:"SEO + GEO",
    about:"Chi è RankFix", forWho:"Per chi", company:"Azienda", product:"Prodotto", language:"Lingua",
    contactTitle:"Contattaci.", contactText:"Domande su RankFix, partnership o bisogno di aiuto? Inviaci un messaggio.",
    send:"Invia messaggio →", sending:"Invio…", thanks:"Grazie! Il messaggio è stato inviato.", back:"← Torna a RankFix AI"
  },
  es: {
    moreInfo:"Cómo funciona", audit:"Análisis gratis", pricing:"Precios", resources:"Recursos", contact:"Contacto", login:"Iniciar sesión", register:"Crear cuenta",
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
  const [githubFixing, setGithubFixing] = useState<string | null>(null);
  const [githubProgress, setGithubProgress] = useState(0);
  const [githubResult, setGithubResult] = useState<{url:string;title:string;number:number;creditsRemaining?:number} | null>(null);
  const [githubAlreadyApplied, setGithubAlreadyApplied] = useState(false);
  const [githubResults, setGithubResults] = useState<Record<string, {url:string;title:string;number:number;creditsRemaining?:number}>>({});
  const [githubError, setGithubError] = useState("");
  const [authUser, setAuthUser] = useState<{ name?: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setAuthUser(data.user || null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(null);
        setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);


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
      // Structural fixes are deterministic scan data; render them immediately.
      // Keep this logic in the production dashboard bundle so stale AI-fix APIs cannot change the fix type.
      // This is intentionally independent from the /api/ai-fix response.
      if (type === "canonical" || type === "heading_structure" || type === "alt_text") {
        const escapeHtml = (value: string) => value
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const title = cleanFixContextValue(result.metrics.title || new URL(result.finalUrl).hostname);
        if (type === "canonical") {
          setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
            title: "Canonical URL voorstel",
            content: `<link rel="canonical" href="${escapeHtml(result.finalUrl)}">`,
            reason: "Gebruikt de uiteindelijke scan-URL als self-referencing canonical."
          }}));
        } else if (type === "heading_structure") {
          const topic = cleanFixContextValue(result.metrics.h1s[0] || result.metrics.title || new URL(result.finalUrl).hostname);
          setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
            title: "Heading-structuur voorstel",
            content: `<h2>${escapeHtml(topic)}</h2>\n<h3>Veelgestelde vragen en belangrijke informatie</h3>`,
            reason: "Gebaseerd op de bestaande paginatitel/H1; controleer de onderwerpen voordat je publiceert."
          }}));
        } else {
          const candidates = result.metrics.imageAltCandidates || [];
          const rows = candidates.map(({ src }) => {
            const filename = decodeURIComponent(src.split("?")[0].split("/").pop() || "afbeelding")
              .replace(/[-_]+/g, " ")
              .replace(/\.[a-z0-9]+$/i, "")
              .trim();
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(filename || title)}">`;
          });
          setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
            title: "Alt-teksten voorstel",
            content: rows.join("\n"),
            reason: "Gebaseerd op de gevonden afbeeldings-URL's. Controleer elke alt-tekst visueel voordat je publiceert."
          }}));
        }
        return;
      }
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
        const ogImage = cleanFixContextValue(result.metrics.openGraph.image || result.metrics.imageAltCandidates?.[0]?.src || "");
        const content = [
          ogTitle ? `<meta property="og:title" content="${escapeAttr(ogTitle)}">` : "",
          ogDescription ? `<meta property="og:description" content="${escapeAttr(ogDescription)}">` : "",
          ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ""
        ].filter(Boolean).join("\n");
        setFixes((prev) => ({ ...prev, [item.issue_id || item.key]: {
          title: "Open Graph metadata voorstel",
          content,
          reason: ogImage ? (result.metrics.openGraph.image ? "Gebruikt bestaande paginatitel, beschrijving en gevonden Open Graph-afbeelding." : "Gebruikt bestaande paginatitel, beschrijving en een bestaande afbeelding van de gescande pagina als og:image.") : "Er is geen bestaande afbeeldings-URL gevonden om veilig als og:image te gebruiken."
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

  async function createGithubFix(item: Check) {
    if (!result) return;
    const key = item.issue_id || item.key;
    setGithubFixing(key); setGithubProgress(8); setGithubResult(null); setGithubAlreadyApplied(false); setGithubError("");
    try {
      const issueId = item.issue_id || item.rule_id || item.key;
      const context = ["URL: " + result.finalUrl, "Scan URL: " + result.scannedUrl, "Issue: " + item.title, "Recommendation: " + item.fix, "Current title: " + cleanFixContextValue(result.metrics.title), "Current description: " + cleanFixContextValue(result.metrics.description), "H1: " + cleanFixContextValue(result.metrics.h1s[0] || ""), "Canonical: " + cleanFixContextValue(result.metrics.canonical || ""), "OG title: " + cleanFixContextValue(result.metrics.openGraph.title || ""), "OG description: " + cleanFixContextValue(result.metrics.openGraph.description || ""), "OG image: " + cleanFixContextValue(result.metrics.openGraph.image || ""), "Existing page image candidate: " + cleanFixContextValue(result.metrics.imageAltCandidates?.[0]?.src || ""), "Image alt candidates: " + JSON.stringify(result.metrics.imageAltCandidates || [])].join("\n");
      setGithubProgress(30);
      const response = await fetch("/api/github/fix", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ issue:item.title + ": " + item.fix, context, url:result.finalUrl, issue_id:issueId }) });
      setGithubProgress(72);
      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();
      let data: any = null;
      if (contentType.includes("application/json")) {
        try { data = JSON.parse(raw); } catch {}
      }
      if (!response.ok) {
        throw new Error(
          data?.error ||
          `RankFix kon de verbetering niet uitvoeren (HTTP ${response.status}). Controleer of de nieuwste Render-deploy actief is.`
        );
      }
      if (!data) {
        throw new Error(
          `RankFix kreeg geen JSON terug van /api/github/fix (content-type: ${contentType || "onbekend"}).`
        );
      }
      setGithubProgress(100);
      if (data.alreadyApplied) {
        setGithubAlreadyApplied(true);
        return;
      }
      if (!data.pr?.url || !data.pr?.number) throw new Error("RankFix kon de technische wijziging niet veilig afronden.");
      const prResult = {url:data.pr.url,title:data.pr.title,number:data.pr.number,creditsRemaining:data.creditsRemaining};
      setGithubResult(prResult);
      setGithubResults((prev) => ({ ...prev, [key]: prResult }));
      setResult((prev) => {
        if (!prev) return prev;
        const markWaiting = (checks: Check[]) => checks.map((check) => (
          (check.issue_id || check.key) === key ? { ...check, fix_status: "WAITING" as const } : check
        ));
        return { ...prev, seo: { ...prev.seo, checks: markWaiting(prev.seo.checks) }, geo: { ...prev.geo, checks: markWaiting(prev.geo.checks) } };
      });
    } catch (err) { setGithubError(err instanceof Error ? err.message : "GitHub fix mislukt."); }
    finally { setTimeout(() => setGithubFixing(null), 500); }
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
      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();
      let data: any = null;
      if (contentType.includes("application/json")) {
        try { data = JSON.parse(raw); } catch {}
      }
      if (!response.ok) {
        throw new Error(
          data?.error ||
          `Scan endpoint gaf HTTP ${response.status} terug. Controleer of de nieuwste Render-deploy actief is.`
        );
      }
      if (!data) {
        throw new Error(
          `RankFix kreeg geen JSON terug van /api/scan (content-type: ${contentType || "onbekend"}).`
        );
      }
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
  const waitingIssues = useMemo(() => activeChecks.filter((item) => item.fix_status === "WAITING"), [activeChecks]);
  const issues = useMemo(() => activeChecks.filter((item) => {
    const key = item.issue_id || item.key;
    return item.status !== "pass" && item.fix_status !== "WAITING" && !githubResults[key];
  }), [activeChecks, githubResults]);
  const passedCount = activeChecks.filter((item) => item.status === "pass").length;
  const preparedCount = activeChecks.filter((item) => {
    const key = item.issue_id || item.key;
    return item.fix_status === "WAITING" || Boolean(githubResults[key]);
  }).length;
  const remainingCount = issues.length;

  return (
    <main className="rankfix-home min-h-screen bg-[#0B1220] text-white selection:bg-emerald-400 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-220px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute right-[-180px] top-[520px] h-[420px] w-[420px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-50 mx-auto w-full border-b border-white/10 bg-[#0B1220]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-5 lg:px-8">
          <a href="#" className="flex shrink-0 items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-blue-600 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/10">RF</span>
            <span className="text-lg font-bold tracking-tight">RankFix <span className="text-emerald-300">AI</span></span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-slate-400 lg:flex">
            <button type="button" onClick={() => scrollToSection("scan")} className="transition hover:text-white">{t.audit}</button>
            <a href="#features" className="transition hover:text-white">{t.moreInfo}</a>
            <a href="#about" className="transition hover:text-white">{t.forWho}</a>
            <a href="#prijzen" className="transition hover:text-white">{t.pricing}</a>
            <button type="button" onClick={() => setContactOpen(true)} className="transition hover:text-white">{t.contact}</button>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <label className="sr-only" htmlFor="language-desktop">Taal</label>
            <select id="language-desktop" value={language} onChange={(e) => { setLanguage(e.target.value as Language); window.location.href = "/" + e.target.value; }} className="rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-xs font-medium text-white outline-none shadow-sm">
              <option value="nl" className="bg-slate-900 text-white">🇳🇱 NL</option>
              <option value="en" className="bg-slate-900 text-white">🇬🇧 EN</option>
              <option value="fr" className="bg-slate-900 text-white">🇫🇷 FR</option>
              <option value="de" className="bg-slate-900 text-white">🇩🇪 DE</option>
              <option value="it" className="bg-slate-900 text-white">🇮🇹 IT</option>
              <option value="es" className="bg-slate-900 text-white">🇪🇸 ES</option>
            </select>
            {!authLoading && (authUser ? (
              <a href="/dashboard" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-100 sm:px-4 sm:text-sm">Dashboard</a>
            ) : (
              <>
                <a href="/account?mode=login" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium transition hover:bg-white/10 sm:px-4 sm:text-sm">Inloggen</a>
                <a href="/account?mode=register" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-100 sm:px-4 sm:text-sm">Account aanmaken</a>
              </>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <label className="sr-only" htmlFor="language-mobile-top">Taal</label>
            <select id="language-mobile-top" value={language} onChange={(e) => { setLanguage(e.target.value as Language); window.location.href = "/" + e.target.value; }} className="h-11 max-w-[118px] rounded-xl border border-white/10 bg-slate-900 px-2 text-xs font-semibold text-white outline-none">
              <option value="nl">🇳🇱 NL</option><option value="en">🇬🇧 EN</option><option value="fr">🇫🇷 FR</option><option value="de">🇩🇪 DE</option><option value="it">🇮🇹 IT</option><option value="es">🇪🇸 ES</option>
            </select>
          </div>
          <button type="button" aria-label={mobileMenuOpen ? "Menu sluiten" : "Menu openen"} aria-controls="rankfix-mobile-menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 lg:hidden">
            {mobileMenuOpen ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14 M19 5L5 19" /></svg> : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16 M4 12h16 M4 18h16" /></svg>}
          </button>
        </div>
        {mobileMenuOpen && (
          <div id="rankfix-mobile-menu" className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-white/10 px-4 pb-5 pt-3 lg:hidden">
            <div className="grid gap-1">
              {[[t.audit,"#scan"],[t.moreInfo,"#features"],[t.forWho,"#about"],[t.pricing,"#prijzen"],[t.contact,"#footer"]].map(([label,href]) => (
                href === "#footer" ? (
                  <button key={label} type="button" onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }} className="rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">{label}</button>
                ) : (
                  <a key={label} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">{label}</a>
                )
              ))}
            </div>
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-3">
              {!authLoading && (authUser ? (
                <a href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-950">Dashboard</a>
              ) : (
                <>
                  <a href="/account?mode=login" onClick={() => setMobileMenuOpen(false)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white">Inloggen</a>
                  <a href="/account?mode=register" onClick={() => setMobileMenuOpen(false)} className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-950">Account aanmaken</a>
                </>
              ))}
            </div>
          </div>
        )}
      </nav>

      <section id="scan" className="mx-auto max-w-6xl px-5 pb-16 pt-16 text-center lg:px-8 lg:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs font-semibold text-emerald-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
          SEO + GEO audit voor Google & AI Search
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-black tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          Vind wat je rankings blokkeert.
          <span className="block bg-gradient-to-r from-emerald-200 via-white to-blue-300 bg-clip-text text-transparent">Fix het met RankFix.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
          Eén snelle scan voor technische SEO, content, structured data en AI-search readiness.
          Eerst inzicht. Daarna concrete fixes — met AI wanneer jij dat activeert.
        </p>

        <div className="mx-auto mt-9 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl shadow-blue-950/30 backdrop-blur">
          <div className="mb-3 grid grid-cols-3 gap-1.5 sm:gap-2">
            {[
              ["seo", "SEO", "Google & organische vindbaarheid"],
              ["geo", "GEO", "AI Search & generatieve vindbaarheid"],
              ["both", "SEO + GEO", "Volledige analyse"],
            ].map(([value, label, description]) => (
              <button key={value} type="button" aria-pressed={auditMode === value} onClick={() => setAuditMode(value as "seo" | "geo" | "both")} className={`min-w-0 rounded-xl border px-2 py-3 text-center transition sm:px-4 sm:text-left ${auditMode === value ? "border-emerald-300/50 bg-emerald-300/10 text-white shadow-lg shadow-emerald-500/5" : "border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20 hover:text-white"}`}>
                <div className="flex items-center justify-center gap-1 text-xs font-bold sm:justify-start sm:text-sm"><span className={`h-2 w-2 shrink-0 rounded-full ${auditMode === value ? "bg-emerald-300" : "bg-slate-700"}`} />{label}</div>
                <div className="mt-1 hidden text-[11px] leading-4 text-slate-400 sm:block">{description}</div>
              </button>
            ))}
          </div>
          <form onSubmit={handleScan} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="url"
              aria-label="Websiteadres"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="jouwdomein.nl"
              required
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#16233A] px-4 py-4 text-base outline-none placeholder:text-slate-400 focus:border-emerald-300 sm:border-0 sm:bg-transparent sm:text-sm"
            />
            <button
              disabled={scanning}
              className="rounded-xl bg-white px-6 py-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B1220]/80 px-4 py-6 backdrop-blur-xl">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#101B2D]/95 p-5 shadow-2xl shadow-blue-950/50 sm:p-8">
            <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
            <div className="relative">
              <div className="mb-7 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-blue-600 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20">RF</span>
                  <div><div className="text-sm font-bold">RankFix <span className="text-emerald-300">AI</span></div><div className="text-[11px] text-slate-500">SEO Scanner</div></div>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Live scan</span>
              </div>

              <div className="grid items-center gap-8 md:grid-cols-[240px_1fr]">
                <div className="mx-auto flex h-[210px] w-[210px] items-center justify-center sm:h-[235px] sm:w-[235px]">
                  <div className="relative flex h-full w-full items-center justify-center rounded-full border-[18px] border-slate-800/80 shadow-inner shadow-black/40">
                    <div className="absolute inset-[-18px] animate-[spin_2.2s_linear_infinite] rounded-full border-[18px] border-transparent border-t-emerald-300 border-r-blue-600 shadow-[0_0_35px_rgba(34,211,238,0.18)]" />
                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600/30 to-emerald-300/10 ring-1 ring-emerald-300/20">
                      <svg viewBox="0 0 24 24" className="h-10 w-10 text-emerald-200" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
                      <span className="mt-1 text-[11px] font-bold text-white">Scannen...</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Website analyseren</div>
                  <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">We zijn je website aan het controleren</h2>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300" />
                    <span className="truncate text-sm font-semibold text-slate-200">{url}</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    {scanSteps.map((step, index) => {
                      const done = index < scanStep;
                      const active = index === scanStep;
                      return <div key={step} className={`flex items-center gap-3 text-sm transition-all duration-500 ${done ? "text-emerald-300" : active ? "text-white" : "text-slate-600"}`}>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${done ? "border-emerald-400/40 bg-emerald-400/10" : active ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-white/[0.02]"}`}>
                          {done ? "✓" : active ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />}
                        </span>
                        <span>{step}</span>
                        {active && <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-emerald-300">bezig</span>}
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

      {githubFixing && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0B1220]/85 px-4 py-6 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-600 text-sm font-black text-slate-950">RF</span><div><div className="font-bold">RankFix bereidt een codewijziging voor</div><div className="text-xs text-slate-400">De live website verandert nog niet</div></div></div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-center">
                <div className="relative h-20 w-20">
                  <div className="absolute inset-0 rounded-full border border-emerald-300/10"></div>
                  <div className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-emerald-300 border-r-blue-400"></div>
                  <div className="absolute inset-4 grid place-items-center rounded-full bg-emerald-300/10 shadow-[0_0_35px_rgba(103,232,249,0.12)]">
                    <span className="text-lg">✦</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 text-center text-base font-bold text-white">{githubProgress < 30 ? "We verzamelen je auditgegevens…" : githubProgress < 70 ? "RankFix controleert de juiste wijziging…" : githubProgress < 100 ? "RankFix zet de verbetering veilig klaar…" : "Klaar — bijna daar!"}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-blue-400 to-violet-400 transition-all duration-700" style={{width: githubProgress + "%"}} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-widest text-slate-600"><span>Analyseren</span><span>Controleren</span><span>Klaar</span></div>
              <p className="mt-4 text-center text-xs leading-5 text-slate-400">Dit kan even duren. Controleer daarna de wijziging in de pull request voordat je die publiceert.</p>
            </div>
          </div>
        </div>
      )}

      {githubAlreadyApplied && !githubFixing && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#0B1220]/80 px-4 py-6 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[28px] border border-emerald-400/20 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <div className="text-4xl">🟢</div>
            <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Al in orde</div>
            <h2 className="mt-2 text-2xl font-black">Deze verbetering was al aanwezig.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">RankFix heeft gecontroleerd of er echt iets moest worden aangepast. Dat was niet nodig.</p>
            <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] p-4 text-sm leading-6 text-slate-300">
              <span className="font-bold text-emerald-200">Je hoeft niets te doen.</span>
              <div className="mt-1 text-slate-500">Er is geen technische wijziging aangemaakt en er zijn geen credits gebruikt.</div>
            </div>
            <button type="button" onClick={() => setGithubAlreadyApplied(false)} className="mt-6 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">Ga terug naar mijn resultaat</button>
          </div>
        </div>
      )}

      {githubResult && !githubFixing && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#0B1220]/80 px-4 py-6 backdrop-blur-xl">
          <div className="w-full max-w-lg rounded-[28px] border border-emerald-400/20 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <div className="text-4xl">🔵</div>
            <div className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Codevoorstel aangemaakt</div>
            <h2 className="mt-2 text-2xl font-black">De wijziging staat klaar voor controle.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">RankFix heeft een bestand gewijzigd in een aparte GitHub-pull-request. De live website is nog niet aangepast.</p>
            <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] p-4 text-sm leading-6 text-slate-300">
              <span className="font-bold text-emerald-200">Controleer en publiceer de wijziging.</span>
              <div className="mt-1 text-slate-400">Bekijk de diff, merge de pull request en scan je website opnieuw om de verbetering te bevestigen.</div>
            </div>
            <a href={githubResult.url} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-xl border border-emerald-300/30 px-5 py-3 text-center text-sm font-bold text-emerald-200">Bekijk pull request ↗</a>
            <button type="button" onClick={() => setGithubResult(null)} className="mt-6 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">Ga terug naar mijn resultaat</button>
          </div>
        </div>
      )}

      {githubError && !githubFixing && (
        <div className="fixed bottom-5 right-5 z-[125] max-w-md rounded-2xl border border-red-400/20 bg-[#12080b] p-4 text-sm text-red-200 shadow-2xl">{githubError}<button type="button" onClick={() => setGithubError("")} className="ml-3 text-red-300 underline">Sluiten</button></div>
      )}

      {result && (
        <section id="resultaat" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-12 lg:px-8">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Live audit</div>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Jouw kansen, op één scherm.</h2>
              <p className="mt-1 max-w-2xl break-all text-xs text-slate-500">{result.finalUrl}</p>
            </div>
            <div className="text-xs text-slate-500">{result.responseTime} ms · HTTP {result.httpStatus}</div>
          </div>

          <div className="mb-6 rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.055] to-emerald-400/[0.025] p-5 shadow-2xl shadow-black/10 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Jouw RankFix resultaat</div>
                <h3 className="mt-2 text-2xl font-black tracking-tight">Dit is wat er met je website gebeurt.</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Bekijk wat al goed is, wat nog aandacht vraagt en welke codevoorstellen op controle wachten. Een fix is pas bevestigd na een nieuwe scan van je live website.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs font-semibold text-slate-400">{issues.length} {issues.length === 1 ? "verbeterpunt" : "verbeterpunten"} gevonden</div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4"><div className="text-lg">🟢</div><div className="mt-2 text-sm font-bold text-emerald-200">Gedaan</div><div className="mt-1 text-2xl font-black">{passedCount}</div><p className="mt-1 text-xs leading-5 text-slate-500">Controles die al goed staan.</p></div>
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-4"><div className="text-lg">🟠</div><div className="mt-2 text-sm font-bold text-amber-200">Nog te verbeteren</div><div className="mt-1 text-2xl font-black">{remainingCount}</div><p className="mt-1 text-xs leading-5 text-slate-500">Punten waarvoor nog geen wijziging is klaargezet.</p></div>
              <div className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.045] p-4"><div className="text-lg">🔵</div><div className="mt-2 text-sm font-bold text-blue-200">Codevoorstel</div><div className="mt-1 text-2xl font-black">{preparedCount}</div><p className="mt-1 text-xs leading-5 text-slate-400">Pull requests die nog niet live bevestigd zijn.</p></div>
              <div className="rounded-2xl border border-yellow-400/15 bg-yellow-400/[0.045] p-4"><div className="text-lg">🟡</div><div className="mt-2 text-sm font-bold text-yellow-200">Nog te bevestigen</div><div className="mt-1 text-2xl font-black">{waitingIssues.length}</div><p className="mt-1 text-xs leading-5 text-slate-400">Controleer, publiceer en scan opnieuw.</p></div>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.035] px-4 py-3 text-sm text-slate-300">{preparedCount ? "Controleer de pull request, publiceer en scan daarna opnieuw." : remainingCount ? "Open een verbeterpunt hieronder voor uitleg en een voorstel." : "De getoonde controles zijn in orde."}</div>
          </div>

          {waitingIssues.length > 0 && (
            <div className="mb-4 rounded-3xl border border-yellow-400/15 bg-yellow-400/[0.035] p-5">
              <div className="text-xs font-bold uppercase tracking-widest text-yellow-300">Nog te bevestigen</div>
              <div className="mt-1 text-lg font-black">{waitingIssues.length} {waitingIssues.length === 1 ? "codevoorstel" : "codevoorstellen"} wachten op een nieuwe live controle.</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">Deze problemen zijn nog niet opgelost. Controleer de pull request, publiceer en scan daarna opnieuw. Pas wanneer de live controle slaagt, telt de fix als bevestigd.</p>
              <div className="mt-4 space-y-2">
                {waitingIssues.slice(0, 5).map((item) => (
                  <div key={item.issue_id || item.key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-xs font-bold text-yellow-300">!</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{item.title}</div>
                      <p className="mt-0.5 text-sm leading-5 text-slate-500">Deze verbetering staat al klaar. RankFix wacht op de technische controle.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overall</div>
              <div className="mt-2 text-6xl font-black tracking-tighter text-emerald-300">{result.overallScore}</div>
              <div className="mt-1 text-sm text-slate-500">Grade {result.grade}</div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-blue-500" style={{ width: `${result.overallScore}%` }} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {([["seo", result.seo], ["geo", result.geo]] as const)
                  .filter(([key]) => result.mode === "both" || result.mode === key)
                  .map(([key, data]) => (
                    <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-xl border px-3 py-2 text-left transition ${tab === key ? "border-emerald-300/30 bg-emerald-300/10 text-white" : "border-white/10 bg-white/[0.02] text-slate-500 hover:text-white"}`}>
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
                      <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Nog te verbeteren</div>
                      <div className="mt-1 text-lg font-black">{issues.length} {issues.length === 1 ? "verbeterpunt" : "verbeterpunten"}</div>
                    </div>
                    <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">{remainingCount > 0 ? "Volgende stap" : "Klaar"}</span>
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
                  <span className="mr-2">⌄</span> Bekijk technische details
                </summary>
                <div className="border-t border-white/10 px-5 py-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeChecks.filter((item) => {
                      const key = item.issue_id || item.key;
                      return item.status === "pass" || (item.fix_status !== "WAITING" && !githubResults[key]);
                    }).map((item) => (
                      <div key={item.issue_id || item.key} className="rounded-2xl border border-white/10 bg-black/10 p-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${item.status === "pass" ? "text-emerald-300" : item.status === "warning" ? "text-amber-300" : "text-red-300"}`}>{statusIcon[item.status]}</span>
                          <span className="text-sm font-semibold">{item.title}</span>
                          <span className="ml-auto text-[10px] text-slate-600">{item.points}/{item.maxPoints}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.message}</p>
                        {item.status !== "pass" && (
                          <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">RankFix recommendation</div>
                            <p className="mt-1 text-xs leading-5 text-slate-300">{item.fix}</p>
                            <button type="button" onClick={() => generateFix(item)} disabled={fixing === (item.issue_id || item.key)} className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-50">
                              {fixing === (item.issue_id || item.key) ? "AI analyseert…" : "✨ Maak fixvoorstel"}
                            </button>
                            {fixes[item.issue_id || item.key] && (
                              <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{fixes[item.issue_id || item.key].title}</div>
                                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{fixes[item.issue_id || item.key].content}</div>
                                <p className="mt-2 text-xs text-slate-500">{fixes[item.issue_id || item.key].reason}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => copyFix(item.issue_id || item.key)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950">{copied === (item.issue_id || item.key) ? "Gekopieerd ✓" : "Gebruik deze tekst"}</button>
                                  <button type="button" onClick={() => createGithubFix(item)} disabled={githubFixing === (item.issue_id || item.key)} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50">{githubFixing === (item.issue_id || item.key) ? "Bezig…" : "Fix veilig klaarzetten →"}</button>
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

              <div className="rounded-3xl border border-emerald-400/10 bg-emerald-400/[0.04] p-5">
                <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300">AI action layer</div>
                <div className="mt-1 text-lg font-black">{issues.length} {issues.length === 1 ? "fix" : "fixes"} beschikbaar</div>
                <p className="mt-1 text-sm leading-5 text-slate-500">Bekijk het fixvoorstel en de eventuele GitHub-wijziging. Een voorstel wijzigt je live website niet; scan opnieuw na het publiceren om het resultaat te controleren.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="features" className="mx-auto max-w-7xl scroll-mt-8 border-t border-white/10 px-5 py-20 lg:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Van inzicht naar verbetering</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Van scan naar actie.</h2>
          <p className="mt-4 text-slate-400">Ontdek wat aandacht vraagt, lees waarom het telt en bekijk een concreet codevoorstel. Na publicatie bevestig je de verandering met een nieuwe scan.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", "SEO + GEO audit", "Technische SEO, metadata, structured data, entities, social metadata, URL-hygiëne en AI-search signalen."],
            ["02", "Webshop audit", "Product-schema, prijsnotatie, retour- en verzendsignalen, reviewplatforms, checkout-trust en variant-URL's."],
            ["03", "Ads readiness", "Controleer landingspagina, tracking-signalen, GA4/GTM en Google Ads-conversies zonder te doen alsof RankFix al toegang heeft tot je Ads-account."],
            ["04", "Fix Engine", "RankFix maakt een aparte pull request voor een veilige codewijziging. Controleer en publiceer die eerst; scan daarna de live website opnieuw."],
          ].map(([number, title, text]) => (
            <div key={number} className="group rounded-3xl border border-white/10 bg-white/[0.025] p-7 transition hover:-translate-y-1 hover:bg-white/[0.04]">
              <div className="text-xs font-black text-emerald-300">{number}</div>
              <h3 className="mt-10 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.02]"><div className="mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="max-w-2xl"><div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Eerlijke fixes</div><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Geen “fix klaar” als er niets is veranderd.</h2><p className="mt-4 text-slate-500">Elke technische fix doorloopt dezelfde keten: gevonden → gecontroleerd → echt gewijzigd → opnieuw gecontroleerd.</p></div><div className="mt-10 grid gap-4 md:grid-cols-4">{[
["🟠","Gevonden","RankFix legt in gewone taal uit wat er misgaat en waarom het telt."],
["🔵","Codevoorstel","De wijziging staat in een aparte pull request, nog niet op de live website."],
["🟡","Nog te bevestigen","Publiceer de codewijziging en scan de live website opnieuw."],
["🟢","Bevestigd","De live scan laat zien dat de verbetering daadwerkelijk aanwezig is."]
].map(([icon,title,text])=><div key={title} className="rounded-3xl border border-white/10 bg-white/[0.025] p-6"><div className="text-2xl">{icon}</div><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>

      <section id="prijzen" className="mx-auto max-w-7xl scroll-mt-8 border-t border-white/10 px-5 py-20 lg:px-8">
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Simple pricing</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Betaal voor gebruik. Niet voor ruis.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-500">We bouwen een transparant creditmodel met een gratis instapscan, zodat kleine bedrijven kunnen starten en agencies kunnen opschalen.</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Free","€0","voor kennismaken",["1 website","1 volledige audit","SEO + GEO basis","Actiepunten","Geen AI-fix"]],
            ["Start","€29","per maand",["1 website","10 scans / maand","10 AI-fixcredits","SEO + GEO audit","3 maanden scanhistorie"]],
            ["Business","€59","per maand",["5 websites","30 scans / maand","30 AI-fixcredits","Automatische controles","PDF- en e-mailrapporten"]],
            ["E-commerce","€79","per maand",["5 webshops","50 scans / maand","50 AI-fixcredits","Shopify, WooCommerce & Next.js/custom","Product-, categorie- en structured-data checks"]],
            ["Pro","€89","per maand",["15 websites","100 scans / maand","80 AI-fixcredits","Uitgebreide automatisering","Tot 5 gebruikers"]],
            ["Agency","€179","per maand",["50 websites","300 scans / maand","200 AI-fixcredits","White-label rapporten","API + team/workflow"]]
          ].map((entry)=>{const [name,price,period,items]=entry as [string,string,string,string[]];const featured=name==="Business";const ecommerce=name==="E-commerce";return <div key={name} className={`relative rounded-3xl border p-7 ${featured?"border-emerald-400/40 bg-emerald-400/[0.06]":ecommerce?"border-cyan-400/30 bg-cyan-400/[0.04]":"border-white/10 bg-white/[0.025]"}`}>{featured&&<div className="absolute right-5 top-5 rounded-full bg-emerald-300 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-950">Meest gekozen</div>}{ecommerce&&<div className="absolute right-5 top-5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-200">Voor webshops</div>}<div className="text-sm font-bold">{name}</div><div className="mt-5 text-4xl font-black">{price}</div><div className="mt-1 text-xs text-slate-500">{period}</div><div className="my-6 h-px bg-white/10"/><ul className="space-y-3 text-sm text-slate-400">{items.map(item=><li key={item}>✓ {item}</li>)}</ul><button className="mt-7 w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/5">Binnenkort beschikbaar</button></div>})}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            {[
              ["Websites", "SEO & GEO audits voor publieke webpagina's."],
              ["Webshops", "Product-, categorie- en conversiesignalen worden steeds verder uitgebreid."],
              ["Apps", "Publieke app-landingspagina's en store-content kunnen via dezelfde auditprincipes worden voorbereid."],
              ["Agencies", "Klantprojecten, credits, rapporten en white-label workflows."],
            ].map(([title, text]) => <div key={title}><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}
          </div>
        </div>
      </section>

      {contactOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#101B2D] p-6 shadow-2xl sm:p-8">
            <button type="button" onClick={() => setContactOpen(false)} aria-label="Contactformulier sluiten" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:text-white">×</button>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t.contact}</div>
            <h2 className="mt-2 text-3xl font-black">{t.contactTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{t.contactText}</p>
            <form onSubmit={handleContact} className="mt-6 space-y-4">
              <input name="name" required placeholder="Naam" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              <input name="email" required type="email" placeholder="E-mailadres" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              <input name="company" placeholder="Bedrijf (optioneel)" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              <textarea name="message" required rows={5} placeholder="Waar kunnen we mee helpen?" className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40" />
              {contactError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{contactError}</div>}
              {contactSent && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{t.thanks}</div>}
              <button disabled={contactSending} className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-100 disabled:opacity-50">{contactSending ? t.sending : t.send}</button>
            </form>
          </div>
        </div>
      )}

      <section id="resources" className="border-y border-white/10 bg-white/[0.02] scroll-mt-8">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t.resources}</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight">Alles om van audit naar actie te gaan.</h2>
            <p className="mt-4 text-slate-400">Gebruik RankFix voor audits en concrete codevoorstellen. Rapportdownloads en uitgebreidere lokale SEO-functies zijn nog in ontwikkeling.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["SEO Audit", "Technische en on-page signalen."],
              ["GEO Audit", "Structured data en AI-search signalen."],
              ["Webshop Audit", "Productdata, prijzen, trust en e-commerce signalen."],
              ["Ads Readiness", "Landingspagina, tracking en conversiesignalen voor Google Ads."],
              ["Local SEO", "LocalBusiness, locaties, openingstijden en officiële profielen."]
            ].map(([title,text]) => <button key={title} type="button" onClick={() => title === "SEO Audit" ? startAudit("seo") : title === "GEO Audit" ? startAudit("geo") : scrollToSection("scan")} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-left transition hover:border-emerald-300/30 hover:bg-white/[0.05]"><div className="font-bold">{title}</div><div className="mt-2 text-sm text-slate-500">{text}</div></button>)}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-16 lg:px-8">
        <div className="max-w-3xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">{t.about}</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight">Minder jargon. Meer grip op je website.</h2>
          <p className="mt-4 leading-7 text-slate-300">RankFix AI helpt ondernemers en teams om hun website beter te begrijpen. De scan bekijkt SEO- en GEO-signalen, van technische basis en inhoud tot structured data. Je ziet wat goed gaat en welke punten aandacht verdienen.</p>
          <p className="mt-4 leading-7 text-slate-400">Voor geschikte codewijzigingen kan RankFix een aparte GitHub-pull-request voorbereiden. Je controleert en publiceert die zelf; een nieuwe scan laat zien of de verbetering live zichtbaar is.</p>
          <a href="/nl/about" className="mt-6 inline-flex rounded-xl border border-emerald-300/30 px-4 py-3 text-sm font-bold text-emerald-200">Lees meer over RankFix →</a>
        </div>
      </section>

      <PublicReviews />

      <footer id="footer" className="bg-[#03050d] px-5 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300 text-xs font-black text-slate-950">RF</span><span className="font-bold">RankFix AI</span></div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">SEO + GEO audit software voor bedrijven en agencies die willen weten wat ze moeten fixen — en het daarna ook willen fixen.</p>
          </div>
          {[
            [t.product, ["SEO Audit", "GEO Audit", "AI Fixes", "Reports"]],
            [t.forWho, ["Bedrijven", "Webshops", "Agencies", "SaaS"]],
            [t.company, ["Over RankFix", "Contact", "Privacy", "Voorwaarden", "Cookies"]],
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
                        if (link === "Privacy") window.location.href = "/nl/privacy";
                        else if (link === "Voorwaarden") window.location.href = "/nl/terms";
                        else if (link === "Cookies") window.location.href = "/nl/cookies";
                        else if (link === "SEO Audit") startAudit("seo");
                        else if (link === "GEO Audit") startAudit("geo");
                        else if (link === "AI Fixes") scrollToSection("features");
                        else if (link === "Reports") scrollToSection(document.getElementById("resultaat") ? "resultaat" : "scan");
                        else if (link === "Contact") setContactOpen(true);
                        else if (link === "Over RankFix") window.location.href = "/nl/about";
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
      <AiAssistant />
      <RootMobileNav />
    </main>
  );
}
