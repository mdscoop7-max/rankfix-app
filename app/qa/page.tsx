import Link from 'next/link';
import {notFound} from 'next/navigation';
const shifts=[
  {label:'Nacht',hours:'00:00–08:00',scope:'Financiën, SaaS, overheid, onderwijs en B2B'},
  {label:'Dag',hours:'08:00–16:00',scope:'Webshops, vastgoed, logistiek, automotive, sport en cultuur'},
  {label:'Avond',hours:'16:00–24:00',scope:'Gezondheid, horeca, hotels, recreatie, vacatures en media'}
];
export default function QaPage(){
  if(process.env.VERCEL_ENV!=='preview')notFound();
  return <main className="mx-auto max-w-5xl px-6 py-14 text-slate-900">
    <p className="text-sm font-semibold uppercase tracking-widest text-indigo-700">RankFix · QA preview</p>
    <h1 className="mt-2 text-4xl font-bold">Testcentrum</h1>
    <p className="mt-4 text-slate-700">57 sectoren · drie gescheiden pilots · geen automatische wijzigingen aan gescande websites.</p>
    <section className="mt-8 rounded-2xl border border-slate-300 p-6">
      <h2 className="text-2xl font-bold">Altijd zelf een website testen</h2>
      <p className="mt-3 text-slate-700">Gebruik de handmatige previewscanner. Deze gebruikt op dit moment de bestaande scanlimieten; een volledig afzonderlijke previewdatabase is nog niet bevestigd.</p>
      <Link href="/nl/scan" className="mt-4 inline-block rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white">Open de testscanner →</Link>
    </section>
    <section className="mt-10">
      <h2 className="text-2xl font-bold">De drie sectorpilots</h2>
      <p className="mt-2 text-slate-700">Elke dienst heeft 19 unieke sectoren en roteert door drie sectoren per ronde. Toegewezen is niet hetzelfde als gescand of goedgekeurd.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">{shifts.map(s=><article key={s.label} className="rounded-xl border border-slate-300 p-5">
        <h3 className="text-xl font-semibold">{s.label}</h3><p className="mt-1 font-medium">{s.hours}</p><p className="mt-3 text-slate-700">{s.scope}</p><p className="mt-3 text-sm">19 sectoren</p>
      </article>)}</div>
    </section>
    <section className="mt-10 rounded-2xl border border-slate-300 p-6">
      <h2 className="text-2xl font-bold">Rapporten en fixvoorstellen</h2>
      <p className="mt-2 text-slate-700">GitHub Actions bewaart rapporten als tijdelijke artifacts, niet als commits. De eerste ronde start na de commit op de QA-branch. Dagelijkse GitHub-planning vereist later een afzonderlijke goedgekeurde default-branch configuratie.</p>
      <a className="mt-4 inline-block text-indigo-700 underline" href="https://github.com/mdscoop7-max/rankfix-app/actions/workflows/qa-sector-pilots.yml">Bekijk GitHub QA-pilots →</a>
    </section>
  </main>
}
