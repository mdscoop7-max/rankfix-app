import Link from "next/link";

const plans = {
  start: { name: "Start", price: "€ 24,95", detail: "1 website · 10 scans per maand" },
  business: { name: "Business", price: "€ 44,95", detail: "5 websites · 30 scans per maand" },
  "e-commerce": { name: "E-commerce", price: "€ 64,95", detail: "5 webshops · 50 scans per maand" },
  pro: { name: "Pro", price: "€ 94,95", detail: "15 websites · 100 scans per maand" },
  agency: { name: "Agency", price: "€ 159,95", detail: "50 websites · 300 scans per maand" },
} as const;

type PlanKey = keyof typeof plans;

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const params = await searchParams;
  const key = String(params.plan || "business").toLowerCase() as PlanKey;
  const selectedKey: PlanKey = key in plans ? key : "business";
  const plan = plans[selectedKey];

  return <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href="/#prijzen" className="text-xl font-black tracking-tight">RankFix <span className="text-emerald-300">AI</span></Link>
        <Link href="/#prijzen" className="text-sm text-slate-400 hover:text-white">← Terug naar prijzen</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
          <div className="mb-7">
            <div className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">Veilige checkout</div>
            <h1 className="mt-2 text-3xl font-black">Start je RankFix-abonnement</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">De checkout staat klaar. Betalen wordt geactiveerd zodra de definitieve betaalprovider en het RankFix-domein zijn gekoppeld.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Voornaam<input disabled placeholder="Voornaam" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">Achternaam<input disabled placeholder="Achternaam" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold sm:col-span-2">E-mailadres<input disabled type="email" placeholder="naam@bedrijf.nl" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">Bedrijfsnaam<input disabled placeholder="Bedrijfsnaam" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">Land<select disabled className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"><option>Nederland</option></select></label>
          </div>

          <div className="mt-7 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between"><div><div className="font-bold">Betaalmethode</div><div className="mt-1 text-xs text-slate-500">Beveiligde betaling via onze betaalprovider</div></div><span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">Binnenkort</span></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500">
              <div className="rounded-xl border border-slate-800 p-3">iDEAL</div><div className="rounded-xl border border-slate-800 p-3">Kaart</div><div className="rounded-xl border border-slate-800 p-3">SEPA</div>
            </div>
          </div>

          <button disabled className="mt-6 w-full cursor-not-allowed rounded-xl bg-emerald-300 px-5 py-4 font-black text-slate-950 opacity-60">Betaling binnenkort beschikbaar</button>
          <p className="mt-3 text-center text-xs text-slate-500">Er wordt nu niets afgeschreven en er wordt geen abonnement geactiveerd.</p>
        </section>

        <aside className="h-fit rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-slate-500">Jouw bestelling</div>
          <div className="mt-5 flex items-start justify-between gap-4"><div><div className="text-xl font-black">{plan.name}</div><div className="mt-1 text-sm text-slate-500">{plan.detail}</div></div><div className="text-right"><div className="text-2xl font-black">{plan.price}</div><div className="text-xs text-slate-500">per maand</div></div></div>
          <div className="my-6 h-px bg-slate-800"/>
          <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">Abonnement</span><strong>{plan.price}</strong></div><div className="flex justify-between"><span className="text-slate-400">Facturatie</span><span>Maandelijks</span></div><div className="flex justify-between"><span className="text-slate-400">AI-fixes</span><span>Inbegrepen</span></div></div>
          <div className="my-6 h-px bg-slate-800"/>
          <div className="flex items-end justify-between"><strong>Totaal</strong><div className="text-right"><div className="text-3xl font-black">{plan.price}</div><div className="text-xs text-slate-500">per maand · btw wordt bij livegang correct berekend</div></div></div>
          <div className="mt-6 rounded-2xl bg-emerald-400/5 p-4 text-xs leading-5 text-emerald-200">✓ Geen kaartgegevens opgeslagen door RankFix<br/>✓ Betaling pas actief na providerkoppeling<br/>✓ Pakket en prijs duidelijk vóór betaling</div>
        </aside>
      </div>
    </div>
  </main>;
}
