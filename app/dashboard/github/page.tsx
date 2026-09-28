"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Repo={full_name:string;default_branch:string;private:boolean};
type ValidationResult={valid?:boolean;errors?:string[];warnings?:string[]};
type FixPreview={startLine:number;before:string[];after:string[];truncated?:boolean;changedLines?:number;summary?:string};
const ui:Record<Locale,{back:string;title:string;intro:string;connect:string;connectInfo:string;connectCta:string;connected:string;reconnect:string;linkedRepo:string;searchRepo:string;chooseRepo:string;searching:string;loading:string;selectRepo:string;privateRepo:string;mappedInfo:string;chooseInfo:string;changeRepo:string;website:string;blocked:string;warnings:string;preview:string;changed:string;empty:string;truncated:string;cancel:string;busy:string;approve:string;makePreview:string}>={
nl:{back:"Dashboard",title:"{t.title}",intro:"{t.intro}",connect:"Verbind GitHub",connectInfo:"{t.connectInfo}",connectCta:"Verbind met GitHub",connected:"GitHub verbonden als",reconnect:"GitHub opnieuw verbinden",linkedRepo:"Gekoppelde repository",searchRepo:"Repository zoeken…",chooseRepo:"Kies eenmalig de repository van deze website",searching:"{t.searching}",loading:"Repositories laden…",selectRepo:"Selecteer repository",privateRepo:"privé",mappedInfo:"RankFix gebruikt deze geverifieerde koppeling automatisch.",chooseInfo:"Dit hoef je maar één keer per website te doen. RankFix kiest branch, bestand en technische gegevens daarna zelf.",changeRepo:"Repositorykoppeling wijzigen",website:"Website",blocked:"Fix geblokkeerd",warnings:"Waarschuwingen",preview:"Diff-preview · vanaf regel",changed:"gewijzigde regels",empty:"leeg",truncated:"{t.truncated}",cancel:"Preview annuleren",busy:"AI + GitHub zijn bezig…",approve:"Preview goedgekeurd — maak Pull Request",makePreview:"Maak eerst diff-preview"},
en:{back:"Dashboard",title:"A code proposal for your website.",intro:"RankFix only reads the selected file, makes the smallest necessary change and opens a separate Pull Request. Nothing is merged to production automatically.",connect:"Connect GitHub",connectInfo:"RankFix only gets GitHub access after you approve it on GitHub.",connectCta:"Connect GitHub",connected:"GitHub connected as",reconnect:"Reconnect GitHub",linkedRepo:"Linked repository",searchRepo:"Searching repository…",chooseRepo:"Choose this website’s repository once",searching:"RankFix is searching your GitHub repositories and checking the link to this website…",loading:"Loading repositories…",selectRepo:"Select repository",privateRepo:"private",mappedInfo:"RankFix automatically uses this verified link.",chooseInfo:"You only need to do this once per website. RankFix then selects the branch, file and technical details automatically.",changeRepo:"Change repository link",website:"Website",blocked:"Fix blocked",warnings:"Warnings",preview:"Diff preview · from line",changed:"changed lines",empty:"empty",truncated:"Preview is shortened; also review the full GitHub diff after creating it.",cancel:"Cancel preview",busy:"AI + GitHub are working…",approve:"Preview approved — create Pull Request",makePreview:"Create diff preview first"},
de:{back:"Dashboard",title:"Ein Codevorschlag für deine Website.",intro:"RankFix liest nur die ausgewählte Datei, nimmt die kleinste notwendige Änderung vor und öffnet einen separaten Pull Request. Nichts wird automatisch in Produktion gemergt.",connect:"GitHub verbinden",connectInfo:"RankFix erhält erst Zugriff auf GitHub, nachdem du dies bei GitHub genehmigt hast.",connectCta:"Mit GitHub verbinden",connected:"GitHub verbunden als",reconnect:"GitHub erneut verbinden",linkedRepo:"Verknüpftes Repository",searchRepo:"Repository suchen…",chooseRepo:"Repository dieser Website einmalig auswählen",searching:"RankFix durchsucht deine GitHub-Repositories und prüft die Verknüpfung mit dieser Website…",loading:"Repositories werden geladen…",selectRepo:"Repository auswählen",privateRepo:"privat",mappedInfo:"RankFix verwendet diese verifizierte Verknüpfung automatisch.",chooseInfo:"Das musst du nur einmal pro Website tun. Danach wählt RankFix Branch, Datei und technische Daten automatisch.",changeRepo:"Repository-Verknüpfung ändern",website:"Website",blocked:"Fix blockiert",warnings:"Warnungen",preview:"Diff-Vorschau · ab Zeile",changed:"geänderte Zeilen",empty:"leer",truncated:"Die Vorschau wurde gekürzt; prüfe nach dem Erstellen auch den vollständigen GitHub-Diff.",cancel:"Vorschau abbrechen",busy:"AI + GitHub arbeiten…",approve:"Vorschau genehmigt — Pull Request erstellen",makePreview:"Zuerst Diff-Vorschau erstellen"},
fr:{back:"Tableau de bord",title:"Une proposition de code pour votre site.",intro:"RankFix lit uniquement le fichier sélectionné, effectue la modification minimale nécessaire et ouvre une Pull Request séparée. Rien n’est fusionné automatiquement en production.",connect:"Connecter GitHub",connectInfo:"RankFix n’accède à GitHub qu’après votre autorisation sur GitHub.",connectCta:"Connecter GitHub",connected:"GitHub connecté en tant que",reconnect:"Reconnecter GitHub",linkedRepo:"Dépôt associé",searchRepo:"Recherche du dépôt…",chooseRepo:"Choisissez une fois le dépôt de ce site",searching:"RankFix recherche vos dépôts GitHub et vérifie l’association avec ce site…",loading:"Chargement des dépôts…",selectRepo:"Sélectionner un dépôt",privateRepo:"privé",mappedInfo:"RankFix utilise automatiquement cette association vérifiée.",chooseInfo:"Vous ne devez le faire qu’une fois par site. RankFix choisit ensuite automatiquement la branche, le fichier et les données techniques.",changeRepo:"Modifier l’association du dépôt",website:"Site",blocked:"Correctif bloqué",warnings:"Avertissements",preview:"Aperçu du diff · à partir de la ligne",changed:"lignes modifiées",empty:"vide",truncated:"L’aperçu est abrégé ; vérifiez aussi le diff GitHub complet après sa création.",cancel:"Annuler l’aperçu",busy:"AI + GitHub travaillent…",approve:"Aperçu approuvé — créer la Pull Request",makePreview:"Créer d’abord l’aperçu du diff"},
it:{back:"Dashboard",title:"Una proposta di codice per il tuo sito.",intro:"RankFix legge solo il file selezionato, applica la modifica minima necessaria e apre una Pull Request separata. Nulla viene unito automaticamente in produzione.",connect:"Collega GitHub",connectInfo:"RankFix accede a GitHub solo dopo la tua autorizzazione su GitHub.",connectCta:"Collega GitHub",connected:"GitHub collegato come",reconnect:"Ricollega GitHub",linkedRepo:"Repository collegato",searchRepo:"Ricerca repository…",chooseRepo:"Scegli una volta il repository di questo sito",searching:"RankFix cerca i tuoi repository GitHub e verifica il collegamento con questo sito…",loading:"Caricamento repository…",selectRepo:"Seleziona repository",privateRepo:"privato",mappedInfo:"RankFix usa automaticamente questo collegamento verificato.",chooseInfo:"Devi farlo una sola volta per sito. RankFix seleziona poi automaticamente branch, file e dati tecnici.",changeRepo:"Modifica collegamento repository",website:"Sito",blocked:"Fix bloccato",warnings:"Avvisi",preview:"Anteprima diff · dalla riga",changed:"righe modificate",empty:"vuoto",truncated:"L’anteprima è abbreviata; dopo la creazione controlla anche il diff GitHub completo.",cancel:"Annulla anteprima",busy:"AI + GitHub stanno lavorando…",approve:"Anteprima approvata — crea Pull Request",makePreview:"Crea prima l’anteprima diff"},
es:{back:"Panel",title:"Una propuesta de código para tu web.",intro:"RankFix solo lee el archivo seleccionado, realiza el cambio mínimo necesario y abre una Pull Request independiente. Nada se fusiona automáticamente en producción.",connect:"Conectar GitHub",connectInfo:"RankFix solo obtiene acceso a GitHub después de que lo apruebes en GitHub.",connectCta:"Conectar GitHub",connected:"GitHub conectado como",reconnect:"Volver a conectar GitHub",linkedRepo:"Repositorio vinculado",searchRepo:"Buscando repositorio…",chooseRepo:"Elige una vez el repositorio de esta web",searching:"RankFix busca tus repositorios de GitHub y comprueba el vínculo con esta web…",loading:"Cargando repositorios…",selectRepo:"Seleccionar repositorio",privateRepo:"privado",mappedInfo:"RankFix utiliza automáticamente este vínculo verificado.",chooseInfo:"Solo tienes que hacerlo una vez por web. Después RankFix selecciona automáticamente la rama, el archivo y los datos técnicos.",changeRepo:"Cambiar vínculo del repositorio",website:"Web",blocked:"Mejora bloqueada",warnings:"Advertencias",preview:"Vista previa del diff · desde la línea",changed:"líneas modificadas",empty:"vacío",truncated:"La vista previa está abreviada; revisa también el diff completo de GitHub después de crearlo.",cancel:"Cancelar vista previa",busy:"AI + GitHub están trabajando…",approve:"Vista previa aprobada — crear Pull Request",makePreview:"Crear primero vista previa del diff"}};

export default function GithubPage(){
  const searchParams=useSearchParams();
  const [connected,setConnected]=useState(false);
  const [login,setLogin]=useState("");
  const [repos,setRepos]=useState<Repo[]>([]);
  const [reposLoading,setReposLoading]=useState(true);
  const [repo,setRepo]=useState("");
  const [path,setPath]=useState("");
  const [siteUrl,setSiteUrl]=useState("");
  const [scanId,setScanId]=useState("");
  const [issueId,setIssueId]=useState("");
  const [mapped,setMapped]=useState(false);
  const [issue,setIssue]=useState("");
  const [context,setContext]=useState("");
  const [baseBranch,setBaseBranch]=useState("main");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [validation,setValidation]=useState<ValidationResult|null>(null);
  const [preview,setPreview]=useState<FixPreview|null>(null);
  const [language,setLanguage]=useState<Locale>("nl");
  const t=ui[language];

  useEffect(()=>{
    fetch("/api/account/language").then(r=>r.ok?r.json():null).then(d=>{if(d?.language&&d.language in ui)setLanguage(d.language)}).catch(()=>{});
    const params=new URLSearchParams(searchParams.toString());
    setIssue(params.get("issue")||"");
    setContext(params.get("context")||"");
    const incomingScanId=params.get("scan_id")||""; setScanId(incomingScanId); setIssueId(params.get("issue_id")||"");
    let incomingUrl=params.get("url")||"";
    (async()=>{
      if(incomingScanId){
        try{
          const sr=await fetch("/api/history/"+encodeURIComponent(incomingScanId),{cache:"no-store"});
          const sd=await sr.json();
          if(sr.ok&&sd?.scan?.scanned_url){ incomingUrl=sd.scan.scanned_url; setSiteUrl(incomingUrl); }
        }catch{}
      } else setSiteUrl(incomingUrl);
      const r=await fetch("/api/github/status"); const d=await r.json();
      if(d.connected){
        setConnected(true);setLogin(d.connection.github_login);
        const rr=await fetch("/api/github/repos"); const rd=await rr.json();
        if(rr.ok){setRepos(rd.repos); if(incomingUrl){ const mr=await fetch("/api/github/site-repository?url="+encodeURIComponent(incomingUrl)); const md=await mr.json(); if(mr.ok&&md.mapped){setRepo(md.repository);setBaseBranch(md.baseBranch||"main");setMapped(true);} } }
        else if(/bad credentials|authenticatie|verbinden/i.test(rd.error||"")) { setConnected(false); setError("De GitHub-koppeling is ongeldig. Verbind GitHub opnieuw."); }
      } else if(d.reauthorize || d.error) {
        setConnected(false);
        setError(d.error || "GitHub kan niet worden geverifieerd. Verbind GitHub opnieuw.");
      }
      setReposLoading(false);
    })();
  },[searchParams]);

  async function changeRepositoryMapping(){
    if(!siteUrl||busy) return;
    setBusy(true); setError(""); setMessage("Repositorykoppeling wordt vrijgegeven…"); setPreview(null);
    try{
      const r=await fetch("/api/github/site-repository",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:siteUrl})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Repositorykoppeling kon niet worden gewijzigd.");
      setMapped(false); setRepo(""); setBaseBranch("main");
      setMessage("Koppeling vrijgegeven. Kies nu de juiste repository voor deze website.");
    }catch(e:any){ setError(e?.message||"Repositorykoppeling kon niet worden gewijzigd."); }
    finally{ setBusy(false); }
  }

  async function selectRepository(nextRepo:string){
    if(reposLoading||busy) return;
    if(mapped && nextRepo!==repo){
      if(!siteUrl){ setError("Websitecontext ontbreekt; open deze fix opnieuw vanuit het auditrapport."); return; }
      setBusy(true); setError(""); setMessage("Repositorykoppeling wordt gewijzigd…"); setPreview(null);
      try{
        const r=await fetch("/api/github/site-repository",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:siteUrl})});
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||"Repositorykoppeling kon niet worden gewijzigd.");
        setMapped(false);
        setMessage("Oude koppeling vrijgegeven. Controleer de nieuwe repository en maak daarna de diff-preview.");
      }catch(e:any){
        setError(e?.message||"Repositorykoppeling kon niet worden gewijzigd.");
        return;
      }finally{ setBusy(false); }
    }
    setRepo(nextRepo);
    const selected=repos.find(r=>r.full_name===nextRepo);
    if(selected) setBaseBranch(selected.default_branch);
  }

  async function createFix(e:React.FormEvent){
    const publish=preview!==null;
    e.preventDefault();
    if(busy) return;
    const cleanRepo=repo.trim();
    const cleanPath=path.trim();
    const cleanIssue=issue.trim();
    const liveParams=new URLSearchParams(window.location.search);
    const activeScanId=scanId || liveParams.get("scan_id") || "";
    const activeIssueId=issueId || liveParams.get("issue_id") || "";
    if(!activeScanId || !activeIssueId){
      setError("De auditcontext ontbreekt. Open deze fix opnieuw via ‘Maak AI-fix’ bij het specifieke verbeterpunt in het auditrapport.");
      return;
    }
    if(!cleanRepo){
      setError("Kies eenmalig de GitHub-repository die bij deze website hoort.");
      return;
    }
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanRepo)){
      setError("Repository moet in het formaat owner/repository staan, bijvoorbeeld mdscoop7-max/Trendmix.");
      return;
    }
    setBusy(true);setError("");setMessage("");setValidation(null);
    try{
      const r=await fetch("/api/github/fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:cleanRepo,path:cleanPath,baseBranch,scan_id:activeScanId,issue_id:activeIssueId,preview:!publish})});
      const text=await r.text();
      let d:any={};
      try{d=JSON.parse(text);}catch{}
      if(!r.ok){
        const apiError=d.error||"GitHub fix mislukt. Controleer repository en bestand.";
        if(/bad credentials|GitHub-token|GitHub-koppeling|opnieuw verbinden/i.test(apiError)){
          setConnected(false);
          setError("Je GitHub-koppeling is ongeldig. Klik op 'GitHub opnieuw verbinden' en autoriseer RankFix opnieuw.");
        } else {
          setError(apiError);
          if(d.validation) setValidation(d.validation);
        }
        return;
      }
      setPath(d.path || cleanPath);
      if(d.status==="preview"&&d.preview){
        setPreview({...d.preview,summary:d.summary});
        setMessage("Preview klaar. Controleer de wijziging hieronder; er is nog geen branch of Pull Request aangemaakt.");
      } else {
        setPreview(null);
        setMessage(d.alreadyApplied ? "De gevraagde code staat al in het bestand. Er is niets gewijzigd. Controleer de live pagina met een nieuwe scan." : "Codewijziging voorgesteld in PR: "+d.pr.title+" — "+d.pr.url+" | Bestand: "+(d.path || cleanPath)+". Controleer de diff, merge en scan opnieuw om de live fix te bevestigen.");
      }
    }catch(error){
      setError(error instanceof Error?error.message:"Verbinding met GitHub Fix Engine mislukt.");
    }finally{
      setBusy(false);
    }
  }

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
    <header className="rf-header"><a href="/dashboard" className="rf-brand">RankFix <span>AI</span></a><a href="/dashboard" className="rf-back">← {t.back}</a></header>
    <DashboardNav current={2} />
    <section className="rf-body rf-fix-engine">
      <div className="text-xs uppercase tracking-widest text-emerald-300">GitHub Fix Engine</div>
      <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Een codevoorstel voor je website.</h1>
      <p className="mt-3 max-w-2xl text-slate-400">RankFix leest alleen het gekozen bestand, maakt de kleinste noodzakelijke wijziging en opent een aparte Pull Request. Er wordt niets automatisch naar productie gemerged.</p>
      {!connected ? <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
        <h2 className="text-xl font-bold">{t.connect}</h2>
        <p className="mt-2 text-sm text-slate-500">Je geeft RankFix alleen toegang tot GitHub nadat je dit bij GitHub zelf hebt goedgekeurd.</p>
        <a href="/api/github/connect" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-slate-950">{t.connectCta} →</a>
      </div> : <form noValidate onSubmit={createFix} className="mt-8 space-y-5 rounded-3xl border border-[#334155] bg-[#101B2D] p-4 sm:p-7">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{t.connected} <b>{login}</b>.</span>
          <a href="/api/github/connect" className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-300/10">{t.reconnect}</a>
        </div>
        <label className="block"><span className="text-sm font-semibold">{mapped?t.linkedRepo:reposLoading?t.searchRepo:t.chooseRepo}</span>{reposLoading&&<p className="mt-2 text-sm text-cyan-200" role="status">RankFix zoekt je GitHub-repositories en controleert de koppeling met deze website…</p>}<select required disabled={reposLoading||busy} value={repo} onChange={e=>void selectRepository(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"><option value="">{reposLoading?t.loading:t.selectRepo}</option>{repos.map(r=><option key={r.full_name} value={r.full_name}>{r.full_name}{r.private?` · ${t.privateRepo}`:""}</option>)}</select><p className="mt-2 text-xs text-slate-500">{mapped?t.mappedInfo:t.chooseInfo}</p>{mapped&&<button type="button" disabled={busy} onClick={changeRepositoryMapping} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5 disabled:opacity-50">{t.changeRepo}</button>}</label>
        {siteUrl&&<div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm"><span className="text-slate-500">{t.website}</span><div className="mt-1 font-semibold break-all">{siteUrl}</div></div>}
        <input type="hidden" value={path} readOnly />
        <input type="hidden" value={issue} readOnly />
        <input type="hidden" value={context} readOnly />
        {error&&<div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">
          <div className="font-bold">{t.blocked}</div>
          <div className="mt-1">{error}</div>
          {validation?.errors?.length ? <ul className="mt-3 list-disc space-y-1 pl-5">{validation.errors.map((item,i)=><li key={i}>{item}</li>)}</ul> : null}
          {validation?.warnings?.length ? <div className="mt-4"><div className="font-semibold text-amber-200">{t.warnings}</div><ul className="mt-1 list-disc space-y-1 pl-5 text-amber-100">{validation.warnings.map((item,i)=><li key={i}>{item}</li>)}</ul></div> : null}
        </div>}
        {message&&<div className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200 break-all">{message}</div>}
        {preview&&<div className="rounded-2xl border border-cyan-300/20 bg-black/25 p-4 text-sm">
          <div className="flex items-center justify-between gap-3"><strong>{t.preview} {preview.startLine}</strong><span className="text-slate-400">{preview.changedLines??"?"} {t.changed}</span></div>
          {preview.summary&&<p className="mt-2 text-slate-300">{preview.summary}</p>}
          <div className="mt-4 grid gap-3 lg:grid-cols-2"><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-red-400/15 bg-red-500/5 p-3 text-xs text-red-100">{preview.before.map((line,i)=>`- ${line}`).join("\n")||`- (${t.empty})`}</pre><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3 text-xs text-emerald-100">{preview.after.map((line,i)=>`+ ${line}`).join("\n")||`+ (${t.empty})`}</pre></div>
          {preview.truncated&&<p className="mt-2 text-xs text-amber-200">Preview is ingekort; controleer na het aanmaken ook de volledige GitHub-diff.</p>}
          <button type="button" onClick={()=>{setPreview(null);setMessage("");}} className="mt-3 text-xs text-slate-300 underline">{t.cancel}</button>
        </div>}
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-[#5DCAA5] px-5 py-3 font-bold text-[#04342C] disabled:opacity-50">{busy?t.busy:preview?t.approve:t.makePreview}</button>
      </form>}
    </section>
    </div>
    <AiAssistant dashboard scanId={scanId || null} errorContext={error ? [error, ...(validation?.errors || [])].join(" ") : null} />
  </main>
}
