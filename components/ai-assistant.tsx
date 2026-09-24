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

  useEffect(() => {
    if (!dashboard || !scanId) return;
    setOpen(true);
    setInput("Leg deze scan uit en noem de 3 belangrijkste problemen met een concrete oplossing.");
  }, [dashboard, scanId]);

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
        className="fixed bottom-5 right-5 z-[110] rounded-full border border-cyan-300/30 bg-[#0b1224] px-4 py-3 text-sm font-bold text-cyan-200 shadow-2xl shadow-cyan-950/30"
      >
        ✦ {dashboard ? "AI Assistent" : "Vraag RankFix AI"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-end bg-black/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex h-[min(680px,90vh)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#080d1b] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="font-bold">RankFix AI</div>
                <div className="text-xs text-slate-500">{dashboard ? "Technische hulp voor je Dashboard" : "Info over RankFix en SEO/GEO"}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-xl text-slate-400 hover:text-white">×</button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.map((message, index) => (
                <div key={index} className={message.role === "user" ? "ml-8 rounded-2xl bg-cyan-400/10 p-3 text-sm text-cyan-50" : "mr-8 rounded-2xl bg-white/5 p-3 text-sm leading-6 text-slate-300"}>
                  {message.content}
                </div>
              ))}
              {busy && <div className="mr-8 rounded-2xl bg-white/5 p-3 text-sm text-slate-500">RankFix AI denkt na…</div>}
            </div>

            <div className="border-t border-white/10 p-4">
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
