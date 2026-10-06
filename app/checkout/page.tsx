import Link from "next/link";
import { PLAN_CATALOG } from "@/lib/plans";

const plans = {
  start: { name: PLAN_CATALOG.start.label, price: PLAN_CATALOG.start.priceEur, websites: PLAN_CATALOG.start.websites, scans: PLAN_CATALOG.start.scans, stores: false },
  business: { name: PLAN_CATALOG.business.label, price: PLAN_CATALOG.business.priceEur, websites: PLAN_CATALOG.business.websites, scans: PLAN_CATALOG.business.scans, stores: false },
  "e-commerce": { name: PLAN_CATALOG["e-commerce"].label, price: PLAN_CATALOG["e-commerce"].priceEur, websites: PLAN_CATALOG["e-commerce"].websites, scans: PLAN_CATALOG["e-commerce"].scans, stores: true },
  pro: { name: PLAN_CATALOG.pro.label, price: PLAN_CATALOG.pro.priceEur, websites: PLAN_CATALOG.pro.websites, scans: PLAN_CATALOG.pro.scans, stores: false },
  agency: { name: PLAN_CATALOG.agency.label, price: PLAN_CATALOG.agency.priceEur, websites: PLAN_CATALOG.agency.websites, scans: PLAN_CATALOG.agency.scans, stores: false },
} as const;

type PlanKey = keyof typeof plans;

type Locale = "nl"|"en"|"de"|"fr"|"it"|"es";
const checkoutCopy:Record<Locale,Record<string,string>>={
nl:{back:"Terug naar prijzen",secure:"Veilige checkout",title:"Start je RankFix-abonnement",intro:"De checkout is voorbereid. Betalingen worden geactiveerd zodra de definitieve betaalprovider en het RankFix-domein zijn gekoppeld.",first:"Voornaam",last:"Achternaam",email:"E-mailadres",company:"Bedrijfsnaam",country:"Land",vatNumber:"Btw-nummer (optioneel)",address:"Factuuradres",postal:"Postcode",city:"Plaats",payment:"Betaalmethode",protected:"Beveiligde betaling via onze betaalprovider",soon:"Binnenkort",card:"Kaart",button:"Betaling binnenkort beschikbaar",none:"Er wordt nu niets afgeschreven en er wordt geen abonnement geactiveerd.",order:"Jouw bestelling",month:"per maand",subscription:"Abonnement",billing:"Facturatie",monthly:"Maandelijks",included:"Inbegrepen",subtotal:"Subtotaal",vat:"Btw",vatPending:"Btw wordt definitief berekend op basis van factuurland, klanttype en geldig btw-nummer.",total:"Totaal",websites:"websites",stores:"webshops",scans:"scans per maand",trust:"✓ Geen kaartgegevens opgeslagen door RankFix\n✓ Btw wordt vóór betaling definitief getoond\n✓ Pakket en totaal zijn duidelijk vóór betaling"},
en:{back:"Back to pricing",secure:"Secure checkout",title:"Start your RankFix subscription",intro:"Checkout is ready. Payments will be activated once the final payment provider and RankFix domain are connected.",first:"First name",last:"Last name",email:"Email address",company:"Company name",country:"Country",vatNumber:"VAT number (optional)",address:"Billing address",postal:"Postal code",city:"City",payment:"Payment method",protected:"Secure payment via our payment provider",soon:"Coming soon",card:"Card",button:"Payment coming soon",none:"Nothing will be charged and no subscription will be activated yet.",order:"Your order",month:"per month",subscription:"Subscription",billing:"Billing",monthly:"Monthly",included:"Included",subtotal:"Subtotal",vat:"VAT",vatPending:"VAT will be calculated at payment based on billing country, customer type and a valid VAT number.",total:"Total",websites:"websites",stores:"online stores",scans:"scans per month",trust:"✓ RankFix does not store card details\n✓ Final VAT is shown before payment\n✓ Plan and total are clear before payment"},
de:{back:"Zurück zu den Preisen",secure:"Sicherer Checkout",title:"Starte dein RankFix-Abonnement",intro:"Der Checkout ist vorbereitet. Zahlungen werden aktiviert, sobald der endgültige Zahlungsanbieter und die RankFix-Domain verbunden sind.",first:"Vorname",last:"Nachname",email:"E-Mail-Adresse",company:"Firmenname",country:"Land",vatNumber:"USt-IdNr. (optional)",address:"Rechnungsadresse",postal:"Postleitzahl",city:"Ort",payment:"Zahlungsmethode",protected:"Sichere Zahlung über unseren Zahlungsanbieter",soon:"Demnächst",card:"Karte",button:"Zahlung demnächst verfügbar",none:"Es wird noch nichts abgebucht und kein Abonnement aktiviert.",order:"Deine Bestellung",month:"pro Monat",subscription:"Abonnement",billing:"Abrechnung",monthly:"Monatlich",included:"Inklusive",subtotal:"Zwischensumme",vat:"MwSt.",vatPending:"Die MwSt. wird bei der Zahlung anhand von Rechnungsland, Kundentyp und gültiger USt-IdNr. berechnet.",total:"Gesamt",websites:"Websites",stores:"Onlineshops",scans:"Scans pro Monat",trust:"✓ RankFix speichert keine Kartendaten\n✓ Die endgültige MwSt. wird vor der Zahlung angezeigt\n✓ Paket und Gesamtbetrag sind vor Zahlung klar"},
fr:{back:"Retour aux tarifs",secure:"Paiement sécurisé",title:"Démarrez votre abonnement RankFix",intro:"Le checkout est prêt. Le paiement sera activé lorsque le prestataire final et le domaine RankFix seront connectés.",first:"Prénom",last:"Nom",email:"Adresse e-mail",company:"Entreprise",country:"Pays",vatNumber:"Numéro de TVA (facultatif)",address:"Adresse de facturation",postal:"Code postal",city:"Ville",payment:"Mode de paiement",protected:"Paiement sécurisé via notre prestataire",soon:"Bientôt",card:"Carte",button:"Paiement bientôt disponible",none:"Aucun montant n’est débité et aucun abonnement n’est encore activé.",order:"Votre commande",month:"par mois",subscription:"Abonnement",billing:"Facturation",monthly:"Mensuelle",included:"Inclus",subtotal:"Sous-total",vat:"TVA",vatPending:"La TVA sera calculée au paiement selon le pays de facturation, le type de client et un numéro de TVA valide.",total:"Total",websites:"sites",stores:"boutiques en ligne",scans:"analyses par mois",trust:"✓ RankFix ne stocke pas les données de carte\n✓ La TVA définitive est affichée avant paiement\n✓ L’offre et le total sont clairs avant paiement"},
it:{back:"Torna ai prezzi",secure:"Checkout sicuro",title:"Avvia il tuo abbonamento RankFix",intro:"Il checkout è pronto. I pagamenti saranno attivati quando il provider definitivo e il dominio RankFix saranno collegati.",first:"Nome",last:"Cognome",email:"Indirizzo e-mail",company:"Azienda",country:"Paese",vatNumber:"Partita IVA (opzionale)",address:"Indirizzo di fatturazione",postal:"CAP",city:"Città",payment:"Metodo di pagamento",protected:"Pagamento sicuro tramite il nostro provider",soon:"Prossimamente",card:"Carta",button:"Pagamento presto disponibile",none:"Non verrà addebitato nulla e nessun abbonamento sarà ancora attivato.",order:"Il tuo ordine",month:"al mese",subscription:"Abbonamento",billing:"Fatturazione",monthly:"Mensile",included:"Incluso",subtotal:"Subtotale",vat:"IVA",vatPending:"L’IVA sarà calcolata al pagamento in base al paese di fatturazione, al tipo di cliente e a una partita IVA valida.",total:"Totale",websites:"siti",stores:"negozi online",scans:"scansioni al mese",trust:"✓ RankFix non memorizza i dati della carta\n✓ L’IVA definitiva viene mostrata prima del pagamento\n✓ Piano e totale sono chiari prima del pagamento"},
es:{back:"Volver a precios",secure:"Pago seguro",title:"Inicia tu suscripción a RankFix",intro:"El checkout está preparado. Los pagos se activarán cuando estén conectados el proveedor definitivo y el dominio de RankFix.",first:"Nombre",last:"Apellidos",email:"Correo electrónico",company:"Empresa",country:"País",vatNumber:"N.º de IVA (opcional)",address:"Dirección de facturación",postal:"Código postal",city:"Ciudad",payment:"Método de pago",protected:"Pago seguro mediante nuestro proveedor",soon:"Próximamente",card:"Tarjeta",button:"Pago disponible próximamente",none:"Todavía no se cobrará nada ni se activará ninguna suscripción.",order:"Tu pedido",month:"al mes",subscription:"Suscripción",billing:"Facturación",monthly:"Mensual",included:"Incluido",subtotal:"Subtotal",vat:"IVA",vatPending:"El IVA se calculará al pagar según el país de facturación, el tipo de cliente y un número de IVA válido.",total:"Total",websites:"sitios",stores:"tiendas online",scans:"análisis al mes",trust:"✓ RankFix no almacena datos de tarjeta\n✓ El IVA definitivo se muestra antes del pago\n✓ El plan y el total están claros antes del pago"}
};

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; lang?: string }> }) {
  const params = await searchParams;
  const key = String(params.plan || "business").toLowerCase() as PlanKey;
  const selectedKey: PlanKey = key in plans ? key : "business";
  const plan = plans[selectedKey];
  const locale:Locale = ["nl","en","de","fr","it","es"].includes(String(params.lang)) ? params.lang as Locale : "nl";
  const t=checkoutCopy[locale];
  const money = new Intl.NumberFormat(locale==="en"?"en-IE":locale+"-"+(locale==="nl"?"NL":locale==="de"?"DE":locale==="fr"?"FR":locale==="it"?"IT":"ES"),{style:"currency",currency:"EUR"}).format(plan.price);
  const planDetail = `${plan.websites} ${plan.stores?t.stores:t.websites} · ${plan.scans} ${t.scans}`;

  return <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Link href={"/"+locale+"#pricing"} className="text-xl font-black tracking-tight">RankFix <span className="text-emerald-300">AI</span></Link>
        <Link href={"/"+locale+"#pricing"} className="text-sm text-slate-400 hover:text-white">← {t.back}</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
          <div className="mb-7">
            <div className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">{t.secure}</div>
            <h1 className="mt-2 text-3xl font-black">{t.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{t.intro}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">{t.first}<input disabled placeholder={t.first} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.last}<input disabled placeholder={t.last} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold sm:col-span-2">{t.email}<input disabled type="email" placeholder={locale==="nl"?"naam@bedrijf.nl":"name@company.com"} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.company}<input disabled placeholder={t.company} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.vatNumber}<input disabled placeholder={t.vatNumber} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold sm:col-span-2">{t.address}<input disabled placeholder={t.address} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.postal}<input disabled placeholder={t.postal} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold">{t.city}<input disabled placeholder={t.city} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"/></label>
            <label className="text-sm font-semibold sm:col-span-2">{t.country}<select disabled className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-400 disabled:opacity-70"><option>{locale==="nl"?"Nederland":locale==="de"?"Deutschland":locale==="fr"?"France":locale==="it"?"Italia":locale==="es"?"España":"Ireland"}</option></select></label>
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
          <div className="mt-5 flex items-start justify-between gap-4"><div><div className="text-xl font-black">{plan.name}</div><div className="mt-1 text-sm text-slate-500">{planDetail}</div></div><div className="text-right"><div className="text-2xl font-black">{money}</div><div className="text-xs text-slate-500">{t.month}</div></div></div>
          <div className="my-6 h-px bg-slate-800"/>
          <div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">{t.subscription}</span><strong>{money}</strong></div><div className="flex justify-between"><span className="text-slate-400">{t.billing}</span><span>{t.monthly}</span></div><div className="flex justify-between"><span className="text-slate-400">AI-fixes</span><span>{t.included}</span></div><div className="flex justify-between"><span className="text-slate-400">{t.subtotal}</span><strong>{money}</strong></div><div className="flex justify-between gap-4"><span className="text-slate-400">{t.vat}</span><span className="text-right text-slate-500">—</span></div><p className="pt-1 text-xs leading-5 text-slate-500">{t.vatPending}</p></div>
          <div className="my-6 h-px bg-slate-800"/>
          <div className="flex items-end justify-between"><strong>{t.total}</strong><div className="text-right"><div className="text-3xl font-black">{money}</div><div className="text-xs text-slate-500">{t.month} · {t.vatPending}</div></div></div>
          <div className="mt-6 whitespace-pre-line rounded-2xl bg-emerald-400/5 p-4 text-xs leading-5 text-emerald-200">{t.trust}</div>
        </aside>
      </div>
    </div>
  </main>;
}
