import { useState } from "react";

type ScanResult = {
  scannedUrl: string;
  finalUrl: string;
  score: number;
  grade: string;
  responseTime: number;
  httpStatus: number;
  metrics: {
    title: string;
    titleLength: number;
    description: string;
    descriptionLength: number;
    h1Count: number;
    imageCount: number;
    imagesMissingAlt: number;
    wordCount: number;
    headingsCount: number;
    linksCount: number;
    canonical: string | null;
    lang: string | null;
    robots: string | null;
  };
  checks: Array<{
    key: string;
    title: string;
    status: "pass" | "warning" | "fail";
    message: string;
    points: number;
    maxPoints: number;
  }>;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan mislukt.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070b19] text-white selection:bg-blue-600 selection:text-white">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/15 blur-[140px] rounded-full pointer-events-none -z-10" />
      <nav className="w-full max-w-7xl mx-auto flex items-center justify-between py-6 px-6 border-b border-blue-950/40">
        <div className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span className="bg-blue-600 p-1.5 rounded-lg text-sm">AI</span> RankFix
        </div>
        <div className="hidden md:flex items-center space-x-8 text-sm text-slate-300">
          <a href="#functies" className="hover:text-white">Functies</a>
          <a href="#resultaat" className="hover:text-white">Resultaat</a>
          <a href="#prijzen" className="hover:text-white">Prijzen</a>
        </div>
        <span className="text-xs text-slate-400 border border-slate-800 px-3 py-1.5 rounded-full">NL</span>
      </nav>

      <section className="max-w-4xl mx-auto text-center pt-16 md:pt-24 px-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/60 border border-blue-800/50 text-blue-400 text-xs font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Echte website-analyse
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Meer klanten via <br /><span className="text-white">Google</span> <span className="text-slate-500">—</span> fix jouw SEO nu
        </h1>
        <p className="text-slate-300 text-base md:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
          RankFix haalt je website op en controleert belangrijke technische SEO- en content-signalen.
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-xs md:text-sm text-slate-400 mb-10">
          <span>✓ Gratis scan</span><span>✓ Direct resultaat</span><span>✓ Geen creditcard</span>
        </div>

        <form onSubmit={handleScan} className="w-full max-w-2xl mx-auto bg-[#0b132b]/90 border border-blue-900/50 p-2.5 rounded-2xl shadow-2xl flex flex-col sm:flex-row gap-2">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jouwwebsite.nl" required
            className="w-full bg-transparent px-4 py-3 text-white placeholder-slate-500 focus:outline-none text-sm" />
          <button disabled={scanning} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl transition text-sm whitespace-nowrap disabled:opacity-50">
            {scanning ? "Website wordt gescand..." : "Gratis SEO scan →"}
          </button>
        </form>

        {error && <div className="mt-4 p-4 bg-red-950/50 border border-red-900 text-red-300 text-sm rounded-xl">{error}</div>}
      </section>

      {result && (
        <section id="resultaat" className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-[220px_1fr] gap-8">
            <div className="bg-[#0b132b] border border-blue-900/40 rounded-2xl p-8 text-center h-fit">
              <div className="text-xs text-slate-400 mb-2">SEO SCORE</div>
              <div className="text-6xl font-extrabold text-blue-400">{result.score}</div>
              <div className="text-slate-400 mt-2">Grade {result.grade}</div>
              <div className="text-xs text-slate-500 mt-4">{result.responseTime} ms response</div>
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">Scan resultaat</h2>
              <p className="text-sm text-slate-400 mb-6 break-all">{result.scannedUrl}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[
                  ["H1", result.metrics.h1Count],
                  ["Woorden", result.metrics.wordCount],
                  ["Afbeeldingen", result.metrics.imageCount],
                  ["Links", result.metrics.linksCount],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#0b132b] border border-blue-950 rounded-xl p-4">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-xl font-bold mt-1">{value}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {result.checks.map((item) => (
                  <div key={item.key} className="bg-[#0b132b] border border-blue-950 rounded-xl p-4 flex gap-4 items-start">
                    <div className="text-lg">{item.status === "pass" ? "✓" : item.status === "warning" ? "!" : "×"}</div>
                    <div className="flex-1">
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-sm text-slate-400 mt-1">{item.message}</div>
                    </div>
                    <div className="text-xs text-slate-500">{item.points}/{item.maxPoints}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="functies" className="max-w-6xl mx-auto px-6 py-20 border-t border-blue-950/40">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">RankFix wordt jouw SEO-platform</h2>
          <p className="text-slate-400 max-w-xl mx-auto">We bouwen de scanner nu uit naar AI-copy, rapportages, dashboard, leads en accounts.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            ["🔎", "Echte SEO-scan", "Analyse van title, description, headings, afbeeldingen, links, content, HTTPS en meer."],
            ["🤖", "AI SEO-fixes", "Laat straks automatisch verbeterde meta titles, descriptions en teksten genereren."],
            ["📊", "Rapport & dashboard", "Bewaar scans en volg SEO-verbeteringen per website."],
          ].map(([icon, title, text]) => (
            <div key={title} className="bg-[#0b132b]/60 border border-blue-900/30 p-7 rounded-2xl">
              <div className="text-2xl mb-4">{icon}</div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="prijzen" className="max-w-5xl mx-auto px-6 py-20 border-t border-blue-950/40 text-center">
        <h2 className="text-2xl md:text-4xl font-bold mb-4">Jouw platform, jouw credits</h2>
        <p className="text-slate-400 text-sm max-w-xl mx-auto">Geen afhankelijkheid van Base44. Later bepalen we zelf de limieten, abonnementen en AI-kosten.</p>
      </section>

      <footer className="border-t border-blue-950 bg-[#050814] py-10 px-6 text-center text-xs text-slate-500">
        © 2026 RankFix AI. Alle rechten voorbehouden.
      </footer>
    </main>
  );
}
