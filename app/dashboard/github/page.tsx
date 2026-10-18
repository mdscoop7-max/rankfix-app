"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardNav from "../nav";
import AiAssistant from "@/components/ai-assistant";
import type { Locale } from "@/lib/locales";
import "../dashboard.css";

type Repo={full_name:string;default_branch:string;private:boolean};
type ValidationResult={valid?:boolean;errors?:string[];warnings?:string[]};
type FixPreview={startLine:number;before:string[];after:string[];truncated?:boolean;changedLines?:number;summary?:string};
type AiProposal={title:string;content:string;reason:string};
const ui:Record<Locale,{back:string;title:string;intro:string;connect:string;connectInfo:string;connectCta:string;connected:string;reconnect:string;linkedRepo:string;searchRepo:string;chooseRepo:string;searching:string;loading:string;selectRepo:string;privateRepo:string;mappedInfo:string;chooseInfo:string;changeRepo:string;website:string;blocked:string;warnings:string;preview:string;changed:string;empty:string;truncated:string;cancel:string;busy:string;approve:string;makePreview:string;invalidLink:string;verifyFail:string;release:string;mappingFail:string;released:string;missingSite:string;changing:string;oldReleased:string;missingAudit:string;chooseOnce:string;repoFormat:string;fixFail:string;invalidGithub:string;previewReady:string;alreadyApplied:string;prProposed:string;engineFail:string}>={
nl:{back:"Dashboard",title:"Een codevoorstel voor je website.",intro:"RankFix leest alleen het gekozen bestand, maakt de kleinste noodzakelijke wijziging en opent een aparte Pull Request. Na jouw goedkeuring maakt RankFix alleen een Pull Request aan. Controleer en merge die daarna zelf in GitHub. Pas daarna kan de live website veranderen. Scan opnieuw om de oplossing te bevestigen.",connect:"Verbind GitHub",connectInfo:"Je geeft RankFix alleen toegang tot GitHub nadat je dit bij GitHub zelf hebt goedgekeurd.",connectCta:"Verbind met GitHub",connected:"GitHub verbonden als",reconnect:"GitHub opnieuw verbinden",linkedRepo:"Gekoppelde repository",searchRepo:"Repository zoeken…",chooseRepo:"Kies eenmalig de repository van deze website",searching:"RankFix zoekt je GitHub-repositories en controleert de koppeling met deze website…",loading:"Repositories laden…",selectRepo:"Selecteer repository",privateRepo:"privé",mappedInfo:"RankFix gebruikt deze geverifieerde koppeling automatisch.",chooseInfo:"Dit hoef je maar één keer per website te doen. RankFix kiest branch, bestand en technische gegevens daarna zelf.",changeRepo:"Repositorykoppeling wijzigen",website:"Website",blocked:"Fix geblokkeerd",warnings:"Waarschuwingen",preview:"Diff-preview · vanaf regel",changed:"gewijzigde regels",empty:"leeg",truncated:"Preview is ingekort; controleer na het aanmaken ook de volledige GitHub-diff.",cancel:"Preview annuleren",busy:"AI + GitHub zijn bezig…",approve:"✓ Akkoord, maak veilige fix",makePreview:"Fix probleem →",invalidLink:"De GitHub-koppeling is ongeldig. Verbind GitHub opnieuw.",verifyFail:"GitHub kan niet worden geverifieerd. Verbind GitHub opnieuw.",release:"Repositorykoppeling wordt vrijgegeven…",mappingFail:"Repositorykoppeling kon niet worden gewijzigd.",released:"Koppeling vrijgegeven. Kies nu de juiste repository voor deze website.",missingSite:"Websitecontext ontbreekt; open deze fix opnieuw vanuit het auditrapport.",changing:"Repositorykoppeling wordt gewijzigd…",oldReleased:"Oude koppeling vrijgegeven. Controleer de nieuwe repository en maak daarna de diff-preview.",missingAudit:"De auditcontext ontbreekt. Open deze fix opnieuw via ‘Maak AI-fix’ bij het specifieke verbeterpunt in het auditrapport.",chooseOnce:"Kies eenmalig de GitHub-repository die bij deze website hoort.",repoFormat:"Repository moet in het formaat owner/repository staan, bijvoorbeeld mdscoop7-max/Trendmix.",fixFail:"GitHub fix mislukt. Controleer repository en bestand.",invalidGithub:"Je GitHub-koppeling is ongeldig. Klik op ‘GitHub opnieuw verbinden’ en autoriseer RankFix opnieuw.",previewReady:"Oplossing klaar. Controleer de wijziging en keur die hieronder goed. Je website is nog niet gewijzigd.",alreadyApplied:"De gevraagde code staat al in het bestand. Er is niets gewijzigd. Controleer de live pagina met een nieuwe scan.",prProposed:"Codewijziging voorgesteld in PR",engineFail:"Verbinding met GitHub Fix Engine mislukt."},
en:{back:"Dashboard",title:"A code proposal for your website.",intro:"RankFix only reads the selected file, makes the smallest necessary change and opens a separate Pull Request. After your approval, RankFix creates only a Pull Request. Review and merge it yourself in GitHub. Only then can the live site change; rescan to verify.",connect:"Connect GitHub",connectInfo:"RankFix only gets GitHub access after you approve it on GitHub.",connectCta:"Connect GitHub",connected:"GitHub connected as",reconnect:"Reconnect GitHub",linkedRepo:"Linked repository",searchRepo:"Searching repository…",chooseRepo:"Choose this website’s repository once",searching:"RankFix is searching your GitHub repositories and checking the link to this website…",loading:"Loading repositories…",selectRepo:"Select repository",privateRepo:"private",mappedInfo:"RankFix automatically uses this verified link.",chooseInfo:"You only need to do this once per website. RankFix then selects the branch, file and technical details automatically.",changeRepo:"Change repository link",website:"Website",blocked:"Fix blocked",warnings:"Warnings",preview:"Diff preview · from line",changed:"changed lines",empty:"empty",truncated:"Preview is shortened; also review the full GitHub diff after creating it.",cancel:"Cancel preview",busy:"AI + GitHub are working…",approve:"✓ Approve and prepare fix",makePreview:"Fix this issue →",invalidLink:"The GitHub connection is invalid. Reconnect GitHub.",verifyFail:"GitHub could not be verified. Reconnect GitHub.",release:"Releasing repository link…",mappingFail:"Repository link could not be changed.",released:"Link released. Now choose the correct repository for this website.",missingSite:"Website context is missing; reopen this fix from the audit report.",changing:"Changing repository link…",oldReleased:"Old link released. Check the new repository and then create the diff preview.",missingAudit:"Audit context is missing. Reopen this fix via ‘Create AI fix’ for the specific issue in the audit report.",chooseOnce:"Choose the GitHub repository for this website once.",repoFormat:"Repository must use owner/repository format, for example mdscoop7-max/Trendmix.",fixFail:"GitHub fix failed. Check the repository and file.",invalidGithub:"Your GitHub connection is invalid. Click ‘Reconnect GitHub’ and authorize RankFix again.",previewReady:"Preview ready. Review the change below; no branch or Pull Request has been created yet.",alreadyApplied:"The requested code is already in the file. Nothing was changed. Check the live page with a new scan.",prProposed:"Code change proposed in PR",engineFail:"Connection to GitHub Fix Engine failed."},
de:{back:"Dashboard",title:"Ein Codevorschlag für deine Website.",intro:"RankFix liest nur die ausgewählte Datei, nimmt die kleinste notwendige Änderung vor und öffnet einen separaten Pull Request. Nichts wird automatisch in Produktion gemergt.",connect:"GitHub verbinden",connectInfo:"RankFix erhält erst Zugriff auf GitHub, nachdem du dies bei GitHub genehmigt hast.",connectCta:"Mit GitHub verbinden",connected:"GitHub verbunden als",reconnect:"GitHub erneut verbinden",linkedRepo:"Verknüpftes Repository",searchRepo:"Repository suchen…",chooseRepo:"Repository dieser Website einmalig auswählen",searching:"RankFix durchsucht deine GitHub-Repositories und prüft die Verknüpfung mit dieser Website…",loading:"Repositories werden geladen…",selectRepo:"Repository auswählen",privateRepo:"privat",mappedInfo:"RankFix verwendet diese verifizierte Verknüpfung automatisch.",chooseInfo:"Das musst du nur einmal pro Website tun. Danach wählt RankFix Branch, Datei und technische Daten automatisch.",changeRepo:"Repository-Verknüpfung ändern",website:"Website",blocked:"Fix blockiert",warnings:"Warnungen",preview:"Diff-Vorschau · ab Zeile",changed:"geänderte Zeilen",empty:"leer",truncated:"Die Vorschau wurde gekürzt; prüfe nach dem Erstellen auch den vollständigen GitHub-Diff.",cancel:"Vorschau abbrechen",busy:"AI + GitHub arbeiten…",approve:"✓ Bestätigen und Fix vorbereiten",makePreview:"Problem beheben →",invalidLink:"Die GitHub-Verknüpfung ist ungültig. Verbinde GitHub erneut.",verifyFail:"GitHub konnte nicht verifiziert werden. Verbinde GitHub erneut.",release:"Repository-Verknüpfung wird gelöst…",mappingFail:"Repository-Verknüpfung konnte nicht geändert werden.",released:"Verknüpfung gelöst. Wähle jetzt das richtige Repository für diese Website.",missingSite:"Website-Kontext fehlt; öffne diesen Fix erneut aus dem Auditbericht.",changing:"Repository-Verknüpfung wird geändert…",oldReleased:"Alte Verknüpfung gelöst. Prüfe das neue Repository und erstelle danach die Diff-Vorschau.",missingAudit:"Audit-Kontext fehlt. Öffne diesen Fix über ‘AI-Fix erstellen’ beim betreffenden Verbesserungspunkt erneut.",chooseOnce:"Wähle einmalig das GitHub-Repository dieser Website.",repoFormat:"Repository muss das Format owner/repository haben, zum Beispiel mdscoop7-max/Trendmix.",fixFail:"GitHub-Fix fehlgeschlagen. Prüfe Repository und Datei.",invalidGithub:"Deine GitHub-Verknüpfung ist ungültig. Klicke auf ‘GitHub erneut verbinden’ und autorisiere RankFix erneut.",previewReady:"Vorschau fertig. Prüfe die Änderung unten; es wurde noch kein Branch oder Pull Request erstellt.",alreadyApplied:"Der angeforderte Code steht bereits in der Datei. Es wurde nichts geändert. Prüfe die Live-Seite mit einem neuen Scan.",prProposed:"Codeänderung in PR vorgeschlagen",engineFail:"Verbindung zur GitHub Fix Engine fehlgeschlagen."},
fr:{back:"Tableau de bord",title:"Une proposition de code pour votre site.",intro:"RankFix lit uniquement le fichier sélectionné, effectue la modification minimale nécessaire et ouvre une Pull Request séparée. Rien n’est fusionné automatiquement en production.",connect:"Connecter GitHub",connectInfo:"RankFix n’accède à GitHub qu’après votre autorisation sur GitHub.",connectCta:"Connecter GitHub",connected:"GitHub connecté en tant que",reconnect:"Reconnecter GitHub",linkedRepo:"Dépôt associé",searchRepo:"Recherche du dépôt…",chooseRepo:"Choisissez une fois le dépôt de ce site",searching:"RankFix recherche vos dépôts GitHub et vérifie l’association avec ce site…",loading:"Chargement des dépôts…",selectRepo:"Sélectionner un dépôt",privateRepo:"privé",mappedInfo:"RankFix utilise automatiquement cette association vérifiée.",chooseInfo:"Vous ne devez le faire qu’une fois par site. RankFix choisit ensuite automatiquement la branche, le fichier et les données techniques.",changeRepo:"Modifier l’association du dépôt",website:"Site",blocked:"Correctif bloqué",warnings:"Avertissements",preview:"Aperçu du diff · à partir de la ligne",changed:"lignes modifiées",empty:"vide",truncated:"L’aperçu est abrégé ; vérifiez aussi le diff GitHub complet après sa création.",cancel:"Annuler l’aperçu",busy:"AI + GitHub travaillent…",approve:"✓ Approuver et préparer le correctif",makePreview:"Corriger ce problème →",invalidLink:"La connexion GitHub est invalide. Reconnectez GitHub.",verifyFail:"GitHub n’a pas pu être vérifié. Reconnectez GitHub.",release:"Libération de l’association du dépôt…",mappingFail:"Impossible de modifier l’association du dépôt.",released:"Association libérée. Choisissez maintenant le bon dépôt pour ce site.",missingSite:"Le contexte du site manque ; rouvrez ce correctif depuis le rapport d’audit.",changing:"Modification de l’association du dépôt…",oldReleased:"Ancienne association libérée. Vérifiez le nouveau dépôt puis créez l’aperçu du diff.",missingAudit:"Le contexte d’audit manque. Rouvrez ce correctif via ‘Créer un correctif AI’ pour le point concerné.",chooseOnce:"Choisissez une fois le dépôt GitHub associé à ce site.",repoFormat:"Le dépôt doit être au format owner/repository, par exemple mdscoop7-max/Trendmix.",fixFail:"Le correctif GitHub a échoué. Vérifiez le dépôt et le fichier.",invalidGithub:"Votre connexion GitHub est invalide. Cliquez sur ‘Reconnecter GitHub’ et autorisez RankFix à nouveau.",previewReady:"Aperçu prêt. Vérifiez la modification ci-dessous ; aucune branche ni Pull Request n’a encore été créée.",alreadyApplied:"Le code demandé est déjà présent dans le fichier. Rien n’a été modifié. Vérifiez la page en ligne avec une nouvelle analyse.",prProposed:"Modification de code proposée dans la PR",engineFail:"La connexion au moteur de correctifs GitHub a échoué."},
it:{back:"Dashboard",title:"Una proposta di codice per il tuo sito.",intro:"RankFix legge solo il file selezionato, applica la modifica minima necessaria e apre una Pull Request separata. Nulla viene unito automaticamente in produzione.",connect:"Collega GitHub",connectInfo:"RankFix accede a GitHub solo dopo la tua autorizzazione su GitHub.",connectCta:"Collega GitHub",connected:"GitHub collegato come",reconnect:"Ricollega GitHub",linkedRepo:"Repository collegato",searchRepo:"Ricerca repository…",chooseRepo:"Scegli una volta il repository di questo sito",searching:"RankFix cerca i tuoi repository GitHub e verifica il collegamento con questo sito…",loading:"Caricamento repository…",selectRepo:"Seleziona repository",privateRepo:"privato",mappedInfo:"RankFix usa automaticamente questo collegamento verificato.",chooseInfo:"Devi farlo una sola volta per sito. RankFix seleziona poi automaticamente branch, file e dati tecnici.",changeRepo:"Modifica collegamento repository",website:"Sito",blocked:"Fix bloccato",warnings:"Avvisi",preview:"Anteprima diff · dalla riga",changed:"righe modificate",empty:"vuoto",truncated:"L’anteprima è abbreviata; dopo la creazione controlla anche il diff GitHub completo.",cancel:"Annulla anteprima",busy:"AI + GitHub stanno lavorando…",approve:"✓ Approva e prepara la correzione",makePreview:"Correggi problema →",invalidLink:"Il collegamento GitHub non è valido. Ricollega GitHub.",verifyFail:"Impossibile verificare GitHub. Ricollega GitHub.",release:"Scollegamento repository…",mappingFail:"Impossibile modificare il collegamento del repository.",released:"Collegamento rimosso. Ora scegli il repository corretto per questo sito.",missingSite:"Manca il contesto del sito; riapri questo fix dal report di audit.",changing:"Modifica collegamento repository…",oldReleased:"Vecchio collegamento rimosso. Controlla il nuovo repository e poi crea l’anteprima diff.",missingAudit:"Manca il contesto dell’audit. Riapri questo fix tramite ‘Crea fix AI’ per il problema specifico nel report.",chooseOnce:"Scegli una volta il repository GitHub di questo sito.",repoFormat:"Il repository deve avere il formato owner/repository, ad esempio mdscoop7-max/Trendmix.",fixFail:"Fix GitHub non riuscito. Controlla repository e file.",invalidGithub:"Il collegamento GitHub non è valido. Fai clic su ‘Ricollega GitHub’ e autorizza nuovamente RankFix.",previewReady:"Anteprima pronta. Controlla la modifica qui sotto; non è ancora stato creato alcun branch o Pull Request.",alreadyApplied:"Il codice richiesto è già nel file. Non è stato modificato nulla. Controlla la pagina live con una nuova scansione.",prProposed:"Modifica del codice proposta nella PR",engineFail:"Connessione al GitHub Fix Engine non riuscita."},
es:{back:"Panel",title:"Una propuesta de código para tu web.",intro:"RankFix solo lee el archivo seleccionado, realiza el cambio mínimo necesario y abre una Pull Request independiente. Nada se fusiona automáticamente en producción.",connect:"Conectar GitHub",connectInfo:"RankFix solo obtiene acceso a GitHub después de que lo apruebes en GitHub.",connectCta:"Conectar GitHub",connected:"GitHub conectado como",reconnect:"Volver a conectar GitHub",linkedRepo:"Repositorio vinculado",searchRepo:"Buscando repositorio…",chooseRepo:"Elige una vez el repositorio de esta web",searching:"RankFix busca tus repositorios de GitHub y comprueba el vínculo con esta web…",loading:"Cargando repositorios…",selectRepo:"Seleccionar repositorio",privateRepo:"privado",mappedInfo:"RankFix utiliza automáticamente este vínculo verificado.",chooseInfo:"Solo tienes que hacerlo una vez por web. Después RankFix selecciona automáticamente la rama, el archivo y los datos técnicos.",changeRepo:"Cambiar vínculo del repositorio",website:"Web",blocked:"Mejora bloqueada",warnings:"Advertencias",preview:"Vista previa del diff · desde la línea",changed:"líneas modificadas",empty:"vacío",truncated:"La vista previa está abreviada; revisa también el diff completo de GitHub después de crearlo.",cancel:"Cancelar vista previa",busy:"AI + GitHub están trabajando…",approve:"✓ Aprobar y preparar corrección",makePreview:"Corregir problema →",invalidLink:"La conexión de GitHub no es válida. Vuelve a conectar GitHub.",verifyFail:"No se pudo verificar GitHub. Vuelve a conectarlo.",release:"Liberando vínculo del repositorio…",mappingFail:"No se pudo cambiar el vínculo del repositorio.",released:"Vínculo liberado. Elige ahora el repositorio correcto para esta web.",missingSite:"Falta el contexto de la web; vuelve a abrir esta mejora desde el informe de auditoría.",changing:"Cambiando vínculo del repositorio…",oldReleased:"Vínculo anterior liberado. Comprueba el nuevo repositorio y crea después la vista previa del diff.",missingAudit:"Falta el contexto de auditoría. Vuelve a abrir esta mejora mediante ‘Crear mejora AI’ en el punto específico del informe.",chooseOnce:"Elige una vez el repositorio de GitHub correspondiente a esta web.",repoFormat:"El repositorio debe tener formato owner/repository, por ejemplo mdscoop7-max/Trendmix.",fixFail:"La mejora de GitHub ha fallado. Comprueba el repositorio y el archivo.",invalidGithub:"Tu conexión de GitHub no es válida. Haz clic en ‘Volver a conectar GitHub’ y autoriza RankFix de nuevo.",previewReady:"Vista previa lista. Revisa el cambio; todavía no se ha creado ninguna rama ni Pull Request.",alreadyApplied:"El código solicitado ya está en el archivo. No se ha modificado nada. Comprueba la página en vivo con un nuevo análisis.",prProposed:"Cambio de código propuesto en la PR",engineFail:"La conexión con GitHub Fix Engine ha fallado."}};

type UpgradeCopy={cta:string;locked:string;title:string;description:string;subscribe:string;plans:string;soon:string;close:string};
const upgradeCopy:Record<Locale,UpgradeCopy>={
  nl:{cta:"Fix aanmaken",locked:"Beschikbaar met abonnement",title:"Maak van dit voorstel een echte fix",description:"Met Start of een hoger abonnement kun je een veilige GitHub-fix voorbereiden en zelf controleren voordat je publiceert.",subscribe:"Abonneren",plans:"Bekijk alle abonnementen",soon:"Abonnementen en betalingen zijn nog niet actief. Op de volgende pagina kun je het pakket bekijken, maar nog niets afrekenen.",close:"Sluiten"},
  en:{cta:"Create fix",locked:"Available with a subscription",title:"Turn this proposal into a fix",description:"With Start or a higher plan you can prepare a safe GitHub fix and review it yourself before publishing.",subscribe:"Subscribe",plans:"Compare plans",soon:"Subscriptions and payments are not active yet. You can view the plan on the next page, but cannot pay or activate it yet.",close:"Close"},
  de:{cta:"Fix erstellen",locked:"Mit Abonnement verfügbar",title:"Aus diesem Vorschlag einen Fix machen",description:"Mit Start oder einem höheren Tarif kannst du einen sicheren GitHub-Fix vorbereiten und vor der Veröffentlichung prüfen.",subscribe:"Abonnieren",plans:"Alle Tarife ansehen",soon:"Abonnements und Zahlungen sind noch nicht aktiv. Du kannst den Tarif ansehen, aber noch nicht bezahlen.",close:"Schließen"},
  fr:{cta:"Créer un correctif",locked:"Disponible avec un abonnement",title:"Transformez cette proposition en correctif",description:"Avec Start ou une offre supérieure, préparez un correctif GitHub et vérifiez-le avant publication.",subscribe:"S'abonner",plans:"Voir les offres",soon:"Les abonnements et paiements ne sont pas encore actifs. Vous pouvez consulter l'offre, sans paiement pour le moment.",close:"Fermer"},
  it:{cta:"Crea correzione",locked:"Disponibile con abbonamento",title:"Trasforma la proposta in una correzione",description:"Con Start o un piano superiore puoi preparare una correzione GitHub e verificarla prima di pubblicarla.",subscribe:"Abbonati",plans:"Vedi tutti i piani",soon:"Abbonamenti e pagamenti non sono ancora attivi. Puoi vedere il piano, ma non pagare o attivarlo.",close:"Chiudi"},
  es:{cta:"Crear corrección",locked:"Disponible con suscripción",title:"Convierte la propuesta en una corrección",description:"Con Start o un plan superior puedes preparar una corrección de GitHub y revisarla antes de publicarla.",subscribe:"Suscribirse",plans:"Ver todos los planes",soon:"Las suscripciones y los pagos aún no están activos. Puedes consultar el plan, pero no pagarlo ni activarlo.",close:"Cerrar"}
};

export default function GithubPage(){
  const searchParams=useSearchParams();
  const [connected,setConnected]=useState(false);
  const [login,setLogin]=useState("");
  const [repos,setRepos]=useState<Repo[]>([]);
  const [reposLoading,setReposLoading]=useState(true);
  const [repo,setRepo]=useState("");
  const [path,setPath]=useState("");
  const [siteUrl,setSiteUrl]=useState("");
  const [scanId,setScanId]=useState(()=>searchParams.get("scan_id")||"");
  const [issueId,setIssueId]=useState(()=>searchParams.get("issue_id")||"");
  const [mapped,setMapped]=useState(false);
  const [issue,setIssue]=useState("");
  const [context,setContext]=useState("");
  const [baseBranch,setBaseBranch]=useState("main");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [validation,setValidation]=useState<ValidationResult|null>(null);
  const [preview,setPreview]=useState<FixPreview|null>(null);
  const [proposalId,setProposalId]=useState("");
  const [proposalHash,setProposalHash]=useState("");
  const [language,setLanguage]=useState<Locale>("nl");
  const [plan,setPlan]=useState("");
  const [upgradeOpen,setUpgradeOpen]=useState(false);
  const [githubSetupRequired,setGithubSetupRequired]=useState(false);
  const upgradeDialogRef=useRef<HTMLDialogElement>(null);
  const [scanData,setScanData]=useState<any>(null);
  const [selectedCheck,setSelectedCheck]=useState<any>(null);
  const [proposal,setProposal]=useState<AiProposal|null>(null);
  const [proposalLoading,setProposalLoading]=useState(false);
  const [proposalError,setProposalError]=useState("");
  const [proposalRequested,setProposalRequested]=useState(false);
  const [completedPr,setCompletedPr]=useState<{number?:number;url?:string;title?:string;merged?:boolean}|null>(null);
  const t=ui[language];
  const upgrade=upgradeCopy[language];

  useEffect(()=>{
    const dialog=upgradeDialogRef.current;
    if(!dialog) return;
    if(upgradeOpen && !dialog.open) dialog.showModal();
    if(!upgradeOpen && dialog.open) dialog.close();
  },[upgradeOpen]);

  async function readJsonSafe(response:Response){
    const raw=await response.text();
    if(!raw.trim()) return {};
    try{return JSON.parse(raw);}catch{
      return {error: language==="nl"?"De server gaf een ongeldig antwoord. Probeer het opnieuw.":"The server returned an invalid response. Please try again."};
    }
  }

  useEffect(()=>{
    fetch("/api/account/language").then(r=>r.ok?readJsonSafe(r):null).then(d=>{if(d?.language&&d.language in ui)setLanguage(d.language)}).catch(()=>{});
    fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.ok?readJsonSafe(r):null).then(d=>{if(d?.user?.plan_code)setPlan(d.user.plan_code)}).catch(()=>{});
    const params=new URLSearchParams(searchParams.toString());
    if(params.get("github")==="setup") setGithubSetupRequired(true);
    setIssue(params.get("issue")||"");
    setContext(params.get("context")||"");
    const incomingScanId=params.get("scan_id")||""; setScanId(incomingScanId); setIssueId(params.get("issue_id")||"");
    let incomingUrl=params.get("url")||"";
    (async()=>{
      if(incomingScanId){
        try{
          const sr=await fetch("/api/history/"+encodeURIComponent(incomingScanId),{cache:"no-store"});
          const sd=await readJsonSafe(sr);
          if(sr.ok&&sd?.scan?.scanned_url){ incomingUrl=sd.scan.scanned_url; setSiteUrl(incomingUrl); setScanData(sd.scan); }
        }catch{}
      } else setSiteUrl(incomingUrl);
      const r=await fetch("/api/github/status"); const d=await readJsonSafe(r);
      if(d.connected){
        setConnected(true);setLogin(d.connection.github_login);
        const rr=await fetch("/api/github/repos"); const rd=await readJsonSafe(rr);
        if(rr.ok){const available=Array.isArray(rd.repos)?rd.repos:[];setRepos(available);if(available.length===1){setRepo(available[0].full_name);setBaseBranch(available[0].default_branch||"main");} if(incomingUrl){ const mr=await fetch("/api/github/site-repository?url="+encodeURIComponent(incomingUrl)); const md=await readJsonSafe(mr); if(mr.ok&&md.mapped){setRepo(md.repository);setBaseBranch(md.baseBranch||"main");setMapped(true);} } }
        else if(/bad credentials|authenticatie|verbinden/i.test(rd.error||"")) { setConnected(false); setError(t.invalidLink); }
      } else if(d.setupRequired) {
        setGithubSetupRequired(true);
      } else if(d.reauthorize || d.error) {
        setConnected(false);
        setError(d.error || t.verifyFail);
      }
      setReposLoading(false);
    })();
  },[searchParams]);

  useEffect(()=>{
    if(!scanData||!issueId||proposalRequested) return;
    setProposalRequested(true);
    const allChecks=[...(scanData?.result?.seo?.checks||[]),...(scanData?.result?.geo?.checks||[])];
    const normalizedRequestedIssue=String(issueId||"").trim().toUpperCase();
    const check=allChecks.find((c:any)=>String(c.issue_id||c.rule_id||"").trim().toUpperCase()===normalizedRequestedIssue);
    if(!check){setProposalError(language==="nl"?"Dit verbeterpunt kon niet in de actieve scan worden gevonden.":"This issue could not be found in the active scan.");return;}
    setSelectedCheck(check);
    // Evidence-bounded Organization/WebSite schema is generated from the actual
    // source file by the GitHub Fix preview route. A separate AI text request is
    // unnecessary and can misleadingly fail when the preview has no AI key.
    if (["ORGANIZATION_WEBSITE_SCHEMA", "STRUCTURED_DATA_MISSING", "SITE_STRUCTURED_DATA_MISSING"]
      .includes(normalizedRequestedIssue)) {
      setProposal(null);
      setProposalError("");
      return;
    }
    const directProposal=String(check.fix||"").trim();
    // Scan instructions such as "Voeg og:title..." describe what to fix, but are not a concrete proposal.
    // Only bypass the AI generator when the scan already contains actual code/markup.
    const directLooksConcrete=directProposal.includes("<") || /(?:\{|\[)[\s\S]*(?:\}|\])/.test(directProposal);
    if(directLooksConcrete){
      setProposal({title:language==="nl"?"Concreet scanvoorstel":"Concrete scan proposal",content:directProposal,reason:language==="nl"?"Dit concrete voorstel komt rechtstreeks uit de gecontroleerde scan.":"This concrete proposal comes directly from the verified scan."});
      return;
    }
    const rawNormalizedIssue=String(check.rule_id||check.issue_id||issueId);
    const normalizedIssue=rawNormalizedIssue.toLowerCase()==="product_copy_optimizer"?"PRODUCT_COPY_OPTIMIZER":rawNormalizedIssue;
    const titleHint=String(check.title||"").toLowerCase();
    const typeMap:Record<string,string>={title:"meta_title",description:"meta_description",h1:"h1",alt:"alt_text",schema:"structured_data",META_TITLE_MISSING:"meta_title",META_TITLE_GUIDANCE:"meta_title",META_DESCRIPTION_MISSING:"meta_description",META_DESCRIPTION_GUIDANCE:"meta_description",H1_MISSING:"h1",IMAGE_ALT_MISSING:"alt_text",SOCIAL_METADATA_INCOMPLETE:"social_metadata",social:"social_metadata",STRUCTURED_DATA_MISSING:"structured_data",breadcrumbs:"breadcrumb",canonical:"canonical",headings:"heading_structure",faq:"faq",author:"expertise",PRODUCT_COPY_OPTIMIZER:"product_copy_metadata",product_copy_optimizer:"product_copy_metadata"};
    const inferredType=titleHint.includes("social")||titleHint.includes("open graph")?"social_metadata":titleHint.includes("meta description")?"meta_description":titleHint.includes("meta title")?"meta_title":titleHint.includes("structured data")?"structured_data":titleHint.includes("canonical")?"canonical":titleHint.includes("alt")?"alt_text":titleHint.includes("heading")?"heading_structure":titleHint.includes("h1")?"h1":"";
    const type=typeMap[normalizedIssue]||typeMap[issueId]||inferredType;
    if(!type){setProposalError(language==="nl"?"Voor dit verbeterpunt is nog geen veilig AI-fixformaat beschikbaar.":"No safe AI fix format is available for this issue yet.");return;}
    const m=scanData?.result?.metrics||{};
    const current=type==="meta_title"?(m.title||""):type==="meta_description"?(m.description||""):type==="h1"?(m.h1s?.[0]||""):"";
    const productOptimizer=m.productOptimizer||{};
    const productEvidence=productOptimizer.product||{};
    const context={title:m.title||"",description:m.description||"",h1:m.h1s?.[0]||"",canonical:m.canonical||"",imageAltCandidates:m.imageAltCandidates||[],ogTitle:m.openGraph?.title||"",ogDescription:m.openGraph?.description||"",ogImage:m.openGraph?.image||"",recommendedSchema:m.recommendedSchema||"",url:scanData.scanned_url,productName:productEvidence.name||"",productSku:productEvidence.sku||"",productOffers:productEvidence.offers||[],productSourceCount:String(productOptimizer.sourceCount||0)};
    setProposalLoading(true);setProposalError("");
    fetch("/api/ai-fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:scanData.scanned_url,issue_id:normalizedIssue,request_id:crypto.randomUUID(),type,current,context,issue_status:String(check.status||"FAIL").toUpperCase()})})
      .then(async r=>{const d=await readJsonSafe(r);if(!r.ok){if(d.error==="insufficient_verified_product_data")throw new Error(d.message||"Product Optimizer heeft onvoldoende bewezen productgegevens.");if(d.error==="ai_required")throw new Error(d.message||"Product Optimizer AI is niet beschikbaar.");if(d.error==="missing_verified_asset")throw new Error(language==="nl"?"Afbeelding nodig voor deze fix. RankFix kon geen bestaande, geschikte afbeelding voor og:image bevestigen en verzint daarom geen afbeeldings-URL. Kies een bestaande afbeelding van de website of geef een geldige afbeeldings-URL op; daarna kan RankFix de fix veilig maken.":"An image is needed for this fix. RankFix could not verify an existing suitable image for og:image and will not invent an image URL. Choose an existing website image or provide a valid image URL so RankFix can create the fix safely.");throw new Error(d.error==="invalid_output"?(d.validation?.errors||[]).join(" · "):d.message||d.error||"AI-fix mislukt.");}setProposal(d.fix);})
      .catch(e=>setProposalError(e instanceof Error?e.message:"AI-fix mislukt."))
      .finally(()=>setProposalLoading(false));
  },[scanData,issueId,proposalRequested,language]);

  async function changeRepositoryMapping(){
    if(!siteUrl||busy) return;
    setBusy(true); setError(""); setMessage(t.release); setPreview(null);
    try{
      const r=await fetch("/api/github/site-repository",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:siteUrl})});
      const d=await readJsonSafe(r);
      if(!r.ok) throw new Error(d.error||t.mappingFail);
      setMapped(false); setRepo(""); setBaseBranch("main"); setProposalId(""); setProposalHash(""); setCompletedPr(null);
      setMessage(t.released);
    }catch(e:any){ setError(e?.message||t.mappingFail); }
    finally{ setBusy(false); }
  }

  async function selectRepository(nextRepo:string){
    if(reposLoading||busy) return;
    if(mapped && nextRepo!==repo){
      if(!siteUrl){ setError(t.missingSite); return; }
      setBusy(true); setError(""); setMessage(t.changing); setPreview(null);
      try{
        const r=await fetch("/api/github/site-repository",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:siteUrl})});
        const d=await readJsonSafe(r);
        if(!r.ok) throw new Error(d.error||t.mappingFail);
        setMapped(false);
        setMessage(t.oldReleased);
      }catch(e:any){
        setError(e?.message||t.mappingFail);
        return;
      }finally{ setBusy(false); }
    }
    setRepo(nextRepo);
    setPreview(null);setProposalId("");setProposalHash("");setCompletedPr(null);
    const selected=repos.find(r=>r.full_name===nextRepo);
    if(selected) setBaseBranch(selected.default_branch);
  }

  async function createFix(e:React.FormEvent){
    const publish=preview!==null;
    e.preventDefault();
    if(busy) return;
    if(publish && (!proposalId||!proposalHash)){setError(language==="nl"?"De oplossing is verlopen. Druk opnieuw op Fix probleem.":"This proposal expired. Click Fix this issue again.");setPreview(null);return;}
    const cleanRepo=repo.trim();
    const cleanPath=path.trim();
    const cleanIssue=issue.trim();
    const liveParams=new URLSearchParams(window.location.search);
    const activeScanId=scanId || liveParams.get("scan_id") || "";
    const activeIssueId=issueId || liveParams.get("issue_id") || "";
    if(!activeScanId || !activeIssueId){
      setError(t.missingAudit);
      return;
    }
    if(!cleanRepo){
      setError(t.chooseOnce);
      return;
    }
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanRepo)){
      setError(t.repoFormat);
      return;
    }
    setBusy(true);setError("");setMessage("");setValidation(null);
    try{
      const r=await fetch("/api/github/fix",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:cleanRepo,path:cleanPath,baseBranch,scan_id:activeScanId,issue_id:activeIssueId,preview:!publish,proposal_id:publish?proposalId:undefined,proposal_hash:publish?proposalHash:undefined,proposed_value:!publish&&/^META_DESCRIPTION_(?:GUIDANCE|MISSING)$/i.test(activeIssueId)&&typeof proposal?.content==="string"?proposal.content:undefined,language})});
      const text=await r.text();
      let d:any={};
      try{d=JSON.parse(text);}catch{}
      if(!r.ok){
        const apiError=d.error||t.fixFail;
        if(/bad credentials|GitHub-token|GitHub-koppeling|opnieuw verbinden/i.test(apiError)){
          setConnected(false);
          setError(t.invalidGithub);
        } else {
          setError(apiError);
          if(d.validation) setValidation(d.validation);
        }
        return;
      }
      setPath(d.path || cleanPath);
      if(d.status==="preview"&&d.preview){
        setPreview({...d.preview,summary:d.summary});
        setProposalId(String(d.proposal_id||""));
        setProposalHash(String(d.proposal_hash||""));
        setMessage(t.previewReady);
      } else {
        setPreview(null);
        if(d.alreadyApplied){
          setCompletedPr(null);
          setMessage(t.alreadyApplied);
        } else if(d.pr?.number || d.pr?.url || /awaiting_(merge|verification)|pr_created|published/i.test(String(d.status||""))){
          const prNumber=Number(d.pr?.number)||undefined;
          const prUrl=String(d.pr?.url||"").trim() || (prNumber ? `https://github.com/${cleanRepo}/pull/${prNumber}` : undefined);
          setCompletedPr({number:prNumber,url:prUrl,title:d.pr?.title,merged:Boolean(d.merge?.merged)});
          if(d.merge?.merged){
            setMessage(language==="nl"?"Fix gepubliceerd. RankFix heeft de Pull Request automatisch gemerged. Scan de live website opnieuw om de oplossing te bevestigen.":"Fix published. RankFix merged the Pull Request automatically. Scan the live website again to verify the fix.");
          }else{
            // A created PR is a successful Fix Engine result even when GitHub
            // cannot merge it immediately. Keep this as a workflow state,
            // not a blocking/error state.
            setError("");
            setMessage(language==="nl"
              ?"Pull Request aangemaakt. Bekijk de wijziging in GitHub en merge alleen als je akkoord bent. Je live website is nog niet gewijzigd."
              :"Pull Request created. Review the change in GitHub and merge only if you approve it. Your live website has not been changed.");
          }
        }
      }
    }catch(error){
      setError(error instanceof Error?error.message:t.engineFail);
    }finally{
      setBusy(false);
    }
  }

  return <main className="rf-page" lang={language}>
    <div className="rf-shell">
    <header className="rf-header"><Link href="/dashboard" className="rf-brand">RankFix <span>AI</span></Link></header>
    <DashboardNav current={2} />
    <section className="rf-body rf-fix-engine">
      <div className="rf-fix-workspace-head"><div><div className="text-xs uppercase tracking-widest text-emerald-300">{language==="nl"?"RankFix Fixes":"RankFix Fixes"}</div><h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{language==="nl"?"Probleem oplossen met RankFix":"Fix your website issue with RankFix"}</h1><p className="mt-3 max-w-2xl text-slate-400">{language==="nl"?"Controleer het voorstel en maak alleen met jouw toestemming een Pull Request. Mergen gebeurt apart in GitHub.":"Review the proposal and create a Pull Request only with your approval. Merging is a separate action in GitHub."}</p></div><div className="rf-fix-workflow" aria-label="Fix workflow"><span className={!preview&&!completedPr?"active":""}>1 <b>{language==="nl"?"Fix starten":"Start fix"}</b></span><span className={preview&&!completedPr?"active":""}>2 <b>{language==="nl"?"Goedkeuren":"Approve"}</b></span><span className={completedPr?"active":""}>3 <b>{language==="nl"?"Publicatie controleren":"Review publication"}</b></span></div></div>
      {scanId&&issueId&&<div className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-400/[0.05] p-5 sm:p-7">
        <div className="text-xs font-bold uppercase tracking-widest text-cyan-300">{language==="nl"?"Dit probleem pakt RankFix aan":"RankFix will address this issue"}</div>
         {selectedCheck&&<div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><strong className="text-base text-white">{selectedCheck.title}</strong><p className="mt-2 text-sm text-slate-300">{selectedCheck.message}</p></div>}
        {selectedCheck && ["ORGANIZATION_WEBSITE_SCHEMA", "STRUCTURED_DATA_MISSING", "SITE_STRUCTURED_DATA_MISSING"].includes(String(issueId).toUpperCase()) && <p role="status" className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-4 text-sm text-emerald-100">{language==="nl"?"Voor deze bewezen schema-waarschuwing kan RankFix rechtstreeks een gecontroleerde code-diff maken, zonder externe AI-sleutel. Klik hieronder op ‘Maak eerst diff-preview’ om de exacte wijziging te controleren. Er wordt nog niets op GitHub of je website gepubliceerd.":"For this evidenced schema issue RankFix can create a source-verified code diff without an external AI key. Use ‘Create diff preview first’ below to review the exact change. Nothing is published to GitHub or your site yet."}</p>}
        {proposalLoading&&<p className="mt-3 text-slate-300">{language==="nl"?"RankFix maakt een concreet voorstel op basis van deze scan…":"RankFix is creating a concrete proposal from this scan…"}</p>}
        {proposalError&&<div className="mt-3 rounded-xl bg-red-500/10 p-4 text-sm text-red-200"><strong>{language==="nl"?"Voorstel kon niet automatisch worden gevalideerd.":"Proposal could not be validated automatically."}</strong><div className="mt-1">{proposalError}</div>{selectedCheck?.fix&&<div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-slate-100">{selectedCheck.fix}</div>}</div>}
        {proposal&&<><h2 className="mt-3 text-xl font-bold text-white">{proposal.title}</h2><p className="mt-2 text-sm text-slate-400">{proposal.reason}</p>{String(selectedCheck?.issue_id||selectedCheck?.rule_id||"").toUpperCase()==="PRODUCT_COPY_OPTIMIZER"?<div className="mt-4 grid gap-3">{proposal.content.split(/\n+/).filter(Boolean).map((line:string,index:number)=>{const split=line.indexOf(":");const label=split>0?line.slice(0,split).trim():"";const value=split>0?line.slice(split+1).trim():line.trim();return <div key={index} className="rounded-xl border border-white/10 bg-black/25 p-4"><div className="text-xs font-bold uppercase tracking-wider text-cyan-300">{label||(language==="nl"?"Voorstel":"Proposal")}</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">{value}</div></div>})}</div>:(/^META_DESCRIPTION_(?:GUIDANCE|MISSING)$/i.test(issueId)?<div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-base leading-7 text-white">{proposal.content}</div>:<details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4"><summary className="cursor-pointer text-sm font-bold text-cyan-100">{language==="nl"?"Bekijk het technische voorstel":"View technical proposal"}</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-slate-100">{proposal.content}</pre></details>)}<button type="button" onClick={()=>navigator.clipboard.writeText(proposal.content)} className="mt-4 rounded-xl border border-cyan-300/20 px-4 py-2 text-sm font-bold text-cyan-100">{language==="nl"?"Kopieer voorstel":"Copy proposal"}</button></>}
      </div>}
      {plan==="free"&&proposal&&<p className="mt-4 text-sm text-slate-400">{language==="nl"?"Je kunt dit voorstel handmatig gebruiken. GitHub is optioneel.":"You can use this proposal manually. GitHub is optional."}</p>}
      {scanId&&<Link href={`/dashboard/audit/${encodeURIComponent(scanId)}`} className="mt-4 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200">← {language==="nl"?"Terug naar audit":"Back to audit"}</Link>}
      {plan==="free" ? <div className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5 sm:p-7">
        <p className="text-sm font-semibold text-emerald-200">{upgrade.locked}</p>
        <button type="button" onClick={()=>setUpgradeOpen(true)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
          {upgrade.cta} <span aria-hidden="true">→</span>
        </button>
      </div> : !connected ? <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-7">
        <h2 className="text-xl font-bold">{t.connect}</h2>
        <p className="mt-2 text-sm text-slate-500">{t.connectInfo}</p>
        {githubSetupRequired ? <p role="status" className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">{language==="nl"?"GitHub koppelen is in deze vaste testomgeving nog niet geconfigureerd. De ontwikkelaars moeten eerst een geldige GitHub OAuth-callback voor deze testlink instellen. Je account en Pro-testabonnement zijn niet het probleem.":language==="de"?"GitHub ist für diese Testumgebung noch nicht eingerichtet. Zuerst muss ein OAuth-Callback für diese Testadresse konfiguriert werden.":language==="fr"?"GitHub n’est pas encore configuré pour cet environnement de test. Il faut d’abord configurer le rappel OAuth pour cette adresse.":language==="it"?"GitHub non è ancora configurato per questo ambiente di test. È necessario configurare prima il callback OAuth.":language==="es"?"GitHub aún no está configurado para este entorno de pruebas. Primero se debe configurar el callback OAuth.":"GitHub is not yet configured for this test environment. A GitHub OAuth callback for this preview URL must be set up first."}</p> : <a href="/api/github/connect" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 font-bold text-slate-950">{t.connectCta} →</a>}
      </div> : <form noValidate onSubmit={createFix} className="mt-8 space-y-5 rounded-3xl border border-[#334155] bg-[#101B2D] p-4 sm:p-7">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{t.connected} <b>{login}</b>.</span>
          <a href="/api/github/connect" className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-300/10">{t.reconnect}</a>
        </div>
        {mapped?<div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-xs font-bold uppercase tracking-wider text-emerald-300">{language==="nl"?"Website gekoppeld":"Website connected"}</span><div className="mt-1 font-semibold text-white">{repo}</div></div><button type="button" disabled={busy} onClick={changeRepositoryMapping} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">{language==="nl"?"Wijzigen":"Change"}</button></div></div>:<label className="block"><span className="text-sm font-semibold">{reposLoading?t.searchRepo:repos.length===1?(language==="nl"?"Gevonden websitekoppeling":"Found site connection"):t.chooseRepo}</span>{reposLoading&&<p className="mt-2 text-sm text-cyan-200" role="status">{t.searching}</p>}{repos.length===1&&!reposLoading?<div className="mt-2 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{repo}</div>:<select required disabled={reposLoading||busy} value={repo} onChange={e=>void selectRepository(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3"><option value="">{reposLoading?t.loading:t.selectRepo}</option>{repos.map(r=><option key={r.full_name} value={r.full_name}>{r.full_name}{r.private?` · ${t.privateRepo}`:""}</option>)}</select>}<p className="mt-2 text-xs text-slate-500">{repos.length===1?(language==="nl"?"RankFix heeft de enige beschikbare repository geselecteerd.":"RankFix selected the only available repository."):t.chooseInfo}</p></label>}
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
        {completedPr&&(
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.06] p-5">
            <strong className="text-emerald-200">{language==="nl"?"Pull Request klaar":"Pull Request ready"}</strong>
            <p className="mt-2 text-sm text-slate-300">
              {error
                ? (language==="nl"?"De Pull Request-status kan niet worden bevestigd. Controleer de details op GitHub.":"The Pull Request status could not be confirmed. Review the details on GitHub.")
                : completedPr.merged
                  ? (language==="nl"?"De Pull Request is samengevoegd. Controleer de live website met een nieuwe scan.":"The Pull Request has been merged. Rescan the live website to verify the fix.")
                  : (language==="nl"?"Pull Request aangemaakt, maar nog niet samengevoegd. Je live website is nog niet gewijzigd. Controleer de code in GitHub en merge alleen na jouw goedkeuring. Scan pas daarna opnieuw.":"Pull Request created but not merged. Your live website has not changed. Review the code on GitHub and merge only after your approval. Rescan afterwards.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {siteUrl&&<Link href={`/dashboard/scan?url=${encodeURIComponent(siteUrl)}&verify_issue=${encodeURIComponent(issueId)}`} className="rf-primary-link inline-flex w-auto">
                {completedPr.merged
                  ? (language==="nl"?"Opnieuw scannen en fix controleren →":"Rescan and verify fix →")
                  : (language==="nl"?"Na PR-merge: opnieuw scannen →":"After PR merge: rescan →")}
              </Link>}
              {completedPr.url&&<a href={completedPr.url} target="_blank" rel="noreferrer" className="inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-300">{language==="nl"?"Bekijk PR op GitHub ↗":"View PR on GitHub ↗"}</a>}
            </div>
          </div>
        )}
        {preview&&<div className="rounded-2xl border border-cyan-300/20 bg-black/25 p-4 text-sm" role="region" aria-label={language==="nl"?"Controleer de oplossing":"Review the fix"}>
           <h2 className="mb-2 text-lg font-bold text-white">{language==="nl"?"Stap 2: controleer de oplossing":"Step 2: review the fix"}</h2>
           <p className="mb-3 text-slate-300">{language==="nl"?"Hieronder staat wat RankFix wil veranderen. Pas na jouw akkoord wordt een Pull Request voorbereid; je website blijft ongewijzigd.":"This is what RankFix proposes to change. Only after approval is a Pull Request created; your live website stays unchanged."}</p>
          <div className="flex items-center justify-between gap-3"><strong>{t.preview} {preview.startLine}</strong><span className="text-slate-400">{preview.changedLines??"?"} {t.changed}</span></div>
          {preview.summary&&<p className="mt-2 text-slate-300">{preview.summary}</p>}
          <div className="mt-4 grid gap-3 lg:grid-cols-2"><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-red-400/15 bg-red-500/5 p-3 text-xs text-red-100">{preview.before.map((line,i)=>`- ${line}`).join("\n")||`- (${t.empty})`}</pre><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3 text-xs text-emerald-100">{preview.after.map((line,i)=>`+ ${line}`).join("\n")||`+ (${t.empty})`}</pre></div>
          {preview.truncated&&<p className="mt-2 text-xs text-amber-200">Preview is ingekort; controleer na het aanmaken ook de volledige GitHub-diff.</p>}
          <button type="button" onClick={()=>{setPreview(null);setProposalId("");setProposalHash("");setMessage("");}} className="mt-3 text-xs text-slate-300 underline">{t.cancel}</button>
        </div>}
        {!completedPr&&<><p className="text-center text-xs text-slate-400">{preview?(language==="nl"?"Je keurt alleen dit voorstel goed. Publiceren doe je later apart in GitHub.":"You only approve this proposal. Publishing happens separately on GitHub."):(language==="nl"?"RankFix zoekt het juiste bestand en toont eerst de wijziging. Er verandert nog niets live.":"RankFix finds the correct file and shows the change first. Nothing changes live yet.")}</p><button type="submit" disabled={busy||proposalLoading||Boolean(validation?.errors?.length)||error===t.missingAudit||(Boolean(preview)&&(!proposalId||!proposalHash))} className="min-h-12 w-full rounded-xl bg-[#5DCAA5] px-5 py-3 font-bold text-[#04342C] disabled:opacity-50">{busy?t.busy:preview?t.approve:t.makePreview}</button></>}}
      </form>}
    </section>
    <dialog ref={upgradeDialogRef} onClose={()=>setUpgradeOpen(false)} aria-labelledby="rankfix-upgrade-title" className="w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-emerald-300/25 bg-[#0C2032] p-0 text-white shadow-2xl backdrop:bg-slate-950/75">
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">{upgrade.locked}</span>
          <button type="button" onClick={()=>setUpgradeOpen(false)} aria-label={upgrade.close} className="rounded-full border border-white/15 px-3 py-1 text-xl text-slate-200 hover:bg-white/10">×</button>
        </div>
        <h2 id="rankfix-upgrade-title" className="mt-5 text-2xl font-black leading-tight">{upgrade.title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{upgrade.description}</p>
        <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">{upgrade.soon}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={`/checkout?plan=start&lang=${language}`} onClick={()=>setUpgradeOpen(false)} className="rounded-xl bg-emerald-400 px-5 py-3 text-center font-bold text-slate-950 hover:bg-emerald-300">{upgrade.subscribe} →</Link>
          <Link href={`/${language}#pricing`} onClick={()=>setUpgradeOpen(false)} className="rounded-xl border border-white/20 px-5 py-3 text-center font-semibold text-white hover:bg-white/10">{upgrade.plans}</Link>
        </div>
      </div>
    </dialog>
    </div>
    <AiAssistant dashboard scanId={scanId || null} errorContext={error ? [error, ...(validation?.errors || [])].join(" ") : null} />
  </main>
}
