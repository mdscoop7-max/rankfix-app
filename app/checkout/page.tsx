import Link from "next/link";

const plans = {
  start: { name: "Start", price: "€ 24,95", detail: "1 website · 10 scans per maand" },
  business: { name: "Business", price: "€ 44,95", detail: "5 websites · 30 scans per maand" },
  "e-commerce": { name: "E-commerce", price: "€ 64,95", detail: "5 webshops · 50 scans per maand" },
  pro: { name: "Pro", price: "€ 94,95", detail: "15 websites · 100 scans per maand" },
  agency: { name: "Agency", price: "€ 159,95", detail: "50 websites · 300 scans per maand" },
} as const;

type PlanKey = keyof typeof plans;

type Locale = "nl"|"en"|"de"|"fr"|"it"|"es";
const checkoutCopy:Record<Locale,Record<string,string>>={
nl:{back:"Terug naar prijzen",secure:"{t.secure}",title:"{t.title}",intro:"{t.intro}",first:"Voornaam",last:"Achternaam",email:"E-mailadres",company:"Bedrijfsnaam",country:"Land",payment:"Betaalmethode",protected:"Beveiligde betaling via onze betaalprovider",soon:"Binnenkort",card:"Kaart",button:"Betaling binnenkort beschikbaar",none:"Er wordt nu niets afgeschreven en er wordt geen abonnement geactiveerd.",order:"Jouw bestelling",month:"per maand",subscription:"Abonnement",billing:"Facturatie",monthly:"Maandelijks",included:"Inbegrepen",total:"Totaal",vat:"btw wordt bij livegang correct berekend",trust:"✓ Geen kaartgegevens opgeslagen door RankFix\n✓ Betaling pas actief na providerkoppeling\n✓ Pakket en prijs duidelijk vóór betaling"},
en:{back:"Back to pricing",secure:"Secure checkout",title:"Start your RankFix subscription",intro:"Checkout is ready. Payments will be activated once the final payment provider and RankFix domain are connected.",first:"First name",last:"Last name",email:"Email address",company:"Company name",country:"Country",payment:"Payment method",protected:"Secure payment via our payment provider",soon:"Coming soon",card:"Card",button:"Payment coming soon",none:"Nothing will be charged and no subscription will be activated yet.",order:"Your order",month:"per month",subscription:"Subscription",billing:"Billing",monthly:"Monthly",included:"Included",total:"Total",vat:"VAT will be calculated correctly at launch",trust:"✓ RankFix does not store card details\n✓ Payment activates only after provider connection\n✓ Plan and price are clear before payment"},
de:{back:"Zurück zu den Preisen",secure:"Sicherer Checkout",title:"Starte dein RankFix-Abonnement",intro:"Der Checkout ist vorbereitet. Zahlungen werden aktiviert, sobald der endgültige Zahlungsanbieter und die RankFix-Domain verbunden sind.",first:"Vorname",last:"Nachname",email:"E-Mail-Adresse",company:"Firmenname",country:"Land",payment:"Zahlungsmethode",protected:"Sichere Zahlung über unseren Zahlungsanbieter",soon:"Demnächst",card:"Karte",button:"Zahlung demnächst verfügbar",none:"Es wird noch nichts abgebucht und kein Abonnement aktiviert.",order:"Deine Bestellung",month:"pro Monat",subscription:"Abonnement",billing:"Abrechnung",monthly:"Monatlich",included:"Inklusive",total:"Gesamt",vat:"MwSt. wird beim Start korrekt berechnet",trust:"✓ RankFix speichert keine Kartendaten\n✓ Zahlung erst nach Anbieter-Anbindung aktiv\n✓ Paket und Preis vor Zahlung klar"},
fr:{back:"Retour aux tarifs",secure:"Paiement sécurisé",title:"Démarrez votre abonnement RankFix",intro:"Le checkout est prêt. Le paiement sera activé lorsque le prestataire de paiement final et le domaine RankFix seront connectés.",first:"Prénom",last:"Nom",email:"Adresse e-mail",company:"Entreprise",country:"Pays",payment:"Mode de paiement",protected:"Paiement sécurisé via notre prestataire",soon:"Bientôt",card:"Carte",button:"Paiement bientôt disponible",none:"Aucun montant n’est débité et aucun abonnement n’est encore activé.",order:"Votre commande",month:"par mois",subscription:"Abonnement",billing:"Facturation",monthly:"Mensuelle",included:"Inclus",total:"Total",vat:"TVA calculée correctement au lancement",trust:"✓ RankFix ne stocke pas les données de carte\n✓ Paiement actif après connexion du prestataire\n✓ Offre et prix clairs avant paiement"},
it:{back:"Torna ai prezzi",secure:"Checkout sicuro",title:"Avvia il tuo abbonamento RankFix",intro:"Il checkout è pronto. I pagamenti saranno attivati quando il provider definitivo e il dominio RankFix saranno collegati.",first:"Nome",last:"Cognome",email:"Indirizzo e-mail",company:"Azienda",country:"Paese",payment:"Metodo di pagamento",protected:"Pagamento sicuro tramite il nostro provider",soon:"Prossimamente",card:"Carta",button:"Pagamento presto disponibile",none:"Non verrà addebitato nulla e nessun abbonamento sarà ancora attivato.",order:"Il tuo ordine",month:"al mese",subscription:"Abbonamento",billing:"Fatturazione",monthly:"Mensile",included:"Incluso",total:"Totale",vat:"IVA calcolata correttamente al lancio",trust:"✓ RankFix non memorizza i dati della carta\n✓ Pagamento attivo dopo il collegamento del provider\n✓ Piano e prezzo chiari prima del pagamento"},
es:{back:"Volver a precios",secure:"Pago seguro",title:"Inicia tu suscripción a RankFix",intro:"El checkout está preparado. Los pagos se activarán cuando estén conectados el proveedor de pago definitivo y el dominio de RankFix.",first:"Nombre",last:"Apellidos",email:"Correo electrónico",company:"Empresa",country:"País",payment:"Método de pago",protected:"Pago seguro mediante nuestro proveedor",soon:"Próximamente",card:"Tarjeta",button:"Pago disponible próximamente",none:"Todavía no se cobrará nada ni se activará ninguna suscripción.",order:"Tu pedido",month:"al mes",subscription:"Suscripción",billing:"Facturación",monthly:"Mensual",included:"Incluido",total:"Total",vat:"IVA calculado correctamente en el lanzamiento",trust:"✓ RankFix no almacena datos de tarjeta\n✓ Pago activo tras conectar el proveedor\n✓ Plan y precio claros antes del pago"}
};

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; lang?: string }> }) {
  const params = await searchParams;
  const key = String(params.plan || "business").toLowerCase() as PlanKey;
  const selectedKey: PlanKey = key in plans ? key : "business";
  const plan = plans[selectedKey];
  const locale:Locale = ["nl","en","de","fr","it","es"].includes(String(params.lang)) ? params.lang as Locale : "nl";
  const t=checkoutCopy[locale];

  return <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href={"/"+locale+"#prijzen"} className="text-xl font-black tracking-tight">RankFix <span className="text-emerald-300">AI</span></Link>
        <Link href={"/"+locale+"#prijzen"} className="text-sm text-slate-400 hover:text-white">← {t.back}</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
          <div className="mb-7">
            <div className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">{t.secure}</div>
            <h1 className="mt-2 text-3xl font-black">{t.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t.intro}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">{t.first}<input disabled placeholder="Voornaam" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.last}<input disabled placeholder="Achternaam" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold sm:col-span-2">{t.email}<input disabled type="email" placeholder="naam@bedrijf.nl" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.company}<input disabled placeholder="Bedrijfsnaam" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.country}<select disabled className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"><option>Nederland</option></select></label>
          </div>

          <div className="mt-7 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between"><div><div className="font-bold">{t.payment}</div><div className="mt-1 text-xs text-slate-500">{t.protected}</div></div><span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">{t.soon}</span></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500">
              <div className="rounded-xl border border-slate-800 p-3">iDEAL</div><div className="rounded-xl border border-slate-800 p-3">{t.card}</div><div className="rounded-xl border border-slate-800 p-3">SEPA</div>
            </div>
          </div>

          <button disabled className="mt-6 w-full cursor-not-allowed rounded-xl bg-emerald-300 px-5 py-4 font-black text-slate-950 opacity-60">{t.button}</button>
          <p className="mt-3 text-center text-xs text-slate-500">{t.none}</p>
        </section>

        <aside className="h-fit rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-slate-500">{t.order}</div>
          <div className="mt-5 flex items-start justify-between gap-4"><div><div className="text-xl font-black">{plan.name}</div><div className="mt-1 text-sm text-slate-500">{plan.detail}</div></div><div className="text-right"><div className="text-2xl font-black">{plan.price}</div><div className="text-xs text-slate-500">{t.month}</div></div></div>
          <div className="my-6 h-px bg-slate-800"/>
          <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">{t.subscription}</span><strong>{plan.price}</strong></div><div className="flex justify-between"><span className="text-slate-400">{t.billing}</span><span>{t.monthly}</span></div><div className="flex justify-between"><span className="text-slate-400">AI-fixes</span><span>{t.included}</span></div></div>
          <div className="my-6 h-px bg-slate-800"/>
          <div className="flex items-end justify-between"><strong>{t.total}</strong><div className="text-right"><div className="text-3xl font-black">{plan.price}</div><div className="text-xs text-slate-500">{t.month} · {t.vat}</div></div></div>
          <div className="mt-6 whitespace-pre-line rounded-2xl bg-emerald-400/5 p-4 text-xs leading-5 text-emerald-200">{t.trust}</div>
        </aside>
      </div>
    </div>
  </main>;
}
