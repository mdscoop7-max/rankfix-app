"use client";
import { useState } from "react";
import { copy, type Locale } from "@/lib/locales";
type Result = { overallScore: number; seo?: { score: number; checks: Array<{ status: string }> }; geo?: { score: number; checks: Array<{ status: string }> } };
export default function ScanClient({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode: "both" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(t.error);
      setResult(data);
    } catch { setError(t.error); } finally { setBusy(false); }
  }
  const checks = [...(result?.seo?.checks || []), ...(result?.geo?.checks || [])];
  const issues = checks.filter(check => check.status === "fail" || check.status === "warning").length;
  return <div className="lc-container lc-prose"><h1>{t.run}</h1><p>{t.intro}</p>
    <form onSubmit={run} className="lc-scan-box"><label htmlFor="lc-url">{t.url}</label><input id="lc-url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" required /><button type="submit" disabled={busy} className="lc-primary">{busy ? t.running : t.run}</button></form>
    {error && <p role="alert" className="lc-note">{error}</p>}
    {result && <section className="lc-scan-results" aria-live="polite"><h2>{t.score}: {result.overallScore}/100</h2><div className="lc-grid"><div className="lc-card"><strong>SEO</strong>{result.seo?.score ?? "—"}/100</div><div className="lc-card"><strong>GEO</strong>{result.geo?.score ?? "—"}/100</div><div className="lc-card"><strong>{t.issues}</strong>{issues}</div></div><p>{t.success}: {checks.length - issues}</p><p>{t.next}</p><a className="lc-secondary" href="/dashboard">{t.signIn}</a></section>}
  </div>;
}
