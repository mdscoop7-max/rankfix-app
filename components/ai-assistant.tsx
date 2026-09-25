"use client";

import { useEffect, useState } from "react";

type Props = { dashboard?: boolean; scanId?: string | null };

export default function AiAssistant({ dashboard = false, scanId = null }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: dashboard
        ? "Hoi! Ik ben RankFix AI. Stel gerust technische vragen over je scans, SEO, GEO, scores, fixes, credits of het Dashboard."
        : "Hoi! Ik ben RankFix AI. Ik kan uitleg geven over RankFix, SEO, GEO, audits, AI Search en hoe de app werkt.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [scanIssue, setScanIssue] = useState<any>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixResult, setFixResult] = useState("");

  useEffect(() => {
    if (!dashboard || !scanId) return;
    setOpen(true);
    setInput("Leg deze scan uit en noem de 3 belangrijkste problemen met een concrete oplossing.");
    setScanIssue(null);
    setFixResult("");
    fetch("/api/assistant/scan?scanId=" + encodeURIComponent(scanId), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setScanIssue(d.issues?.[0] || null))
      .catch(() => setScanIssue(null));
  }, [dashboard, scanId]);

  async function startGithubFix() {
    if (!scanIssue || !scanId || fixBusy) return;
    setFixBusy(true);
    setFixResult("");
    try {
      const scanResponse = await fetch("/api/assistant/scan?scanId=" + encodeURIComponent(scanId), { cache: "no-store" });
      const scanData = await scanResponse.json();
      const issue = scanData.issues?.[0];
      const scan = scanData.scan;
      if (!scanResponse.ok || !issue) throw new Error(scanData.error || "Geen actief probleem gevonden.");
      const response = await fetch("/api/github/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue: [issue.title, issue.message, issue.fix].filter(Boolean).join(" - "),
          context: JSON.stringify(issue),
          url: scan.scanned_url,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GitHub Fix kon niet worden gestart.");
      setFixResult(data.pr?.url ? "Codevoorstel aangemaakt. Controleer en merge de PR, en scan daarna opnieuw: " + data.pr.url : data.alreadyApplied ? "De code bevat dit al; er is niets gewijzigd. Controleer de live pagina met een nieuwe scan." : "Er is geen wijziging bevestigd.");
    } catch (error) {
      setFixResult(error instanceof Error ? error.message : "GitHub Fix mislukt.");
    } finally {
      setFixBusy(false);
    }
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, dashboard, scanId }),
      });
      const data = await response.json();
      setMessages((m) => [...m, { role: "assistant", content: data.answer || data.error || "Er ging iets mis." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Er ging iets mis. Probeer het opnieuw." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed right-4 z-[110] rounded-full border border-emerald-300/30 bg-[#0F3B30] px-4 py-3 text-sm font-bold text-emerald-100 shadow-2xl shadow-emerald-950/30 sm:right-5 ${dashboard ? "bottom-[calc(82px+env(safe-area-inset-bottom))] sm:bottom-5" : "bottom-5"}`}
      >
        ✦ {dashboard ? "AI Assistent" : "Vraag RankFix AI"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-end bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[min(680px,100dvh)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#101B2D] shadow-2xl sm:h-[min(680px,90vh)] sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="font-bold">RankFix AI</div>
                <div className="text-xs text-slate-500">{dashboard ? "Technische hulp voor je Dashboard" : "Info over RankFix en SEO/GEO"}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Assistent sluiten" className="rounded-full px-3 py-1 text-xl text-slate-300 hover:text-white">×</button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.map((message, index) => (
                <div key={index} className={message.role === "user" ? "ml-8 rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-50" : "mr-8 rounded-2xl bg-white/5 p-3 text-sm leading-6 text-slate-300"}>
                  {message.content}
                </div>
              ))}
              {busy && <div className="mr-8 rounded-2xl bg-white/5 p-3 text-sm text-slate-500">RankFix AI denkt na…</div>}
            </div>

            {dashboard && scanId && (
              <div className="border-t border-white/10 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Veilige fix</div>
                <p className="mt-1 text-xs text-slate-400">
                  {scanIssue ? scanIssue.title : "Actief scanprobleem laden…"}
                </p>
                <button type="button" onClick={startGithubFix} disabled={!scanIssue || fixBusy} className="mt-3 w-full rounded-xl bg-emerald-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">
                  {fixBusy ? "GitHub Fix wordt gecontroleerd…" : "Start veilige GitHub Fix"}
                </button>
                {fixResult && <p className="mt-2 break-words text-xs text-slate-400">{fixResult}</p>}
              </div>
            )}

            <div className="border-t border-white/10 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder={dashboard ? "Bijv. waarom is mijn GEO-score laag?" : "Bijv. hoe werkt een GEO-audit?"}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-slate-600"
                />
                <button type="button" onClick={send} disabled={busy || !input.trim()} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">
                  Stuur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
