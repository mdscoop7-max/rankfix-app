"use client";

import { useMemo, useState } from "react";

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
    twitterCard: string | null;
    schemaTypes: string[];
    jsonLdBlocks: number;
    sitemapFound: boolean;
    robotsMentionsSitemap: boolean;
  };
};

const statusIcon = { pass: "✓", warning: "!", fail: "×" };

export default function Home() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [tab, setTab] = useState<"seo" | "geo">("seo");
  const [fixes, setFixes] = useState<Record<string, { title: string; content: string; reason: string }>>({});
  const [fixing, setFixing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generateFix(item: Check) {
    if (!result) return;
    setFixing(item.issue_id || item.key);
    try {
      const type = item.key === "title" ? "meta_title" : item.key === "description" ? "meta_description" : item.key === "h1" ? "h1" : item.key === "faq" ? "faq" : "structured_data";
      const response = await fetch("/api/ai-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: result.finalUrl, issue_id: item.issue_id || item.key, type, current: item.key === "title" ? result.metrics.title : item.key === "description" ? result.metrics.description : item.key === "h1" ? (result.metrics.h1s[0] || "") : "", context: { title: result.metrics.title, description: result.metrics.description, h1: result.metrics.h1s[0] || "" } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Fix mislukt.");
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
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan mislukt.");
      setResult(data);
      setTab("seo");
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

      <nav className="mx-auto flex max-w-7xl items-center justify-between border-b border-white/10 px-5 py-5 lg:px-8">
        <a href="#" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 text-xs font-black text-slate-950 shadow-lg shadow-cyan-500/10">RF</span>
          <span className="text-lg font-bold tracking-tight">RankFix <span className="text-cyan-300">AI</span></span>
        </a>
        <div className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#resultaat" className="transition hover:text-white">Audit</a>
          <a href="#prijzen" className="transition hover:text-white">Prijzen</a>
          <a href="#footer" className="transition hover:text-white">Resources</a>
        </div>
        <div className="flex items-center gap-2"><a href="/account?mode=login" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium transition hover:bg-white/10 sm:px-4 sm:text-sm">Inloggen</a><a href="/account?mode=register" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-100 sm:px-4 sm:text-sm">Account aanmaken</a></div>
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
              {scanning ? "Scan wordt uitgevoerd…" : "Gratis audit starten →"}
            </button>
          </form>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
          <span>✓ Geen creditcard</span><span>✓ Direct rapport</span><span>✓ SEO + GEO</span><span>✓ Geen Base44 afhankelijkheid</span>
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

      {result && (
        <section id="resultaat" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-14 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Live audit</div>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Jouw kansen, op één scherm.</h2>
              <p className="mt-2 max-w-2xl break-all text-sm text-slate-500">{result.finalUrl}</p>
            </div>
            <div className="text-sm text-slate-500">{result.responseTime} ms · HTTP {result.httpStatus}</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[230px_1fr_230px]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overall</div>
              <div className="mt-3 text-7xl font-black tracking-tighter text-cyan-300">{result.overallScore}</div>
              <div className="mt-1 text-sm text-slate-500">Grade {result.grade}</div>
              <div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500" style={{ width: `${result.overallScore}%` }} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/20 p-1 sm:grid-cols-2">
                {(["seo", "geo"] as const).map((key) => {
                  const data = result[key];
                  return (
                    <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-3 text-left transition ${tab === key ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}>
                      <div className="text-xs font-bold uppercase tracking-widest">{key}</div>
                      <div className="mt-1 text-2xl font-black">{data.score}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 space-y-3">
                {activeChecks.map((item) => (
                  <div key={item.issue_id || item.key} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-start gap-3">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${item.status === "pass" ? "bg-emerald-400/10 text-emerald-300" : item.status === "warning" ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"}`}>
                        {statusIcon[item.status]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold">{item.title}</div>
                          <span className="text-xs text-slate-600">{item.points}/{item.maxPoints}</span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{item.message}</p>
                        {item.status !== "pass" && (
                          <div className="mt-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.04] p-3">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">RankFix recommendation</div>
                            <p className="mt-1 text-sm text-slate-300">{item.fix}</p>
                            <button type="button" onClick={() => generateFix(item)} disabled={fixing === (item.issue_id || item.key)} className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10 disabled:opacity-50">
                              {fixing === item.key ? "AI analyseert…" : "✨ Fix met AI"}
                            </button>
                            {fixes[item.issue_id || item.key] && (
                              <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{fixes[item.key].title}</div>
                                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{fixes[item.key].content}</div>
                                <p className="mt-2 text-xs text-slate-500">{fixes[item.key].reason}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => copyFix(item.issue_id || item.key)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-950">{copied === (item.issue_id || item.key) ? "Gekopieerd ✓" : "Gebruik deze tekst"}</button>
                                  <a href={`/dashboard/github?issue=${encodeURIComponent((item.issue_id || item.key) + ": " + item.fix)}&context=${encodeURIComponent("URL: " + result.finalUrl + "\nHuidige title: " + result.metrics.title + "\nHuidige description: " + result.metrics.description + "\nH1: " + (result.metrics.h1s[0] || ""))}`} className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-bold text-cyan-200">Fix via GitHub →</a>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Kernmetrics</div>
                <div className="mt-5 space-y-4">
                  {[
                    ["H1", result.metrics.h1Count],
                    ["Woorden", result.metrics.wordCount],
                    ["Afbeeldingen", result.metrics.imageCount],
                    ["Interne links", result.metrics.internalLinks],
                    ["JSON-LD", result.metrics.jsonLdBlocks],
                    ["Schema types", result.metrics.schemaTypes.length],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-white/5 pb-3 text-sm">
                      <span className="text-slate-500">{label}</span><span className="font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-cyan-400/10 bg-cyan-400/[0.04] p-6">
                <div className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Actieplan</div>
                <div className="mt-2 text-2xl font-black">{issues.length} punten</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">Dit worden straks directe AI-fixes die je kunt kopiëren of via GitHub/workflow kunt implementeren.</p>
              </div>
            </aside>
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

      <footer id="footer" className="bg-[#03050d] px-5 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300 text-xs font-black text-slate-950">RF</span><span className="font-bold">RankFix AI</span></div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">SEO + GEO audit software voor bedrijven en agencies die willen weten wat ze moeten fixen — en het daarna ook willen fixen.</p>
          </div>
          {[
            ["Product", ["SEO Audit", "GEO Audit", "AI Fixes", "Reports"]],
            ["Voor wie", ["Bedrijven", "Webshops", "Agencies", "SaaS"]],
            ["Company", ["Over RankFix", "Contact", "Privacy", "Voorwaarden"]],
          ].map((entry) => {
            const [title, links] = entry as [string, string[]];
            return (
              <div key={title}>
                <div className="text-sm font-bold">{title}</div>
                <div className="mt-4 space-y-3 text-sm text-slate-500">
                  {links.map((link) => (
                    <a
                      href={link === "Privacy" ? "/privacy" : link === "Voorwaarden" ? "/voorwaarden" : "#"}
                      key={link}
                      className="block hover:text-white"
                    >
                      {link}
                    </a>
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
