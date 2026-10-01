import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { decryptToken, githubFetch } from "@/lib/github";
import { validateGithubFix } from "@/lib/github-fix-validator";
import { getFixPolicy } from "@/lib/fix-policy";
import { consumeRateLimit } from "@/lib/rate-limit";

function safeRepo(v:string){ return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v) && !v.includes(".."); }
function safePath(v:string){ return v.length>0 && v.length<240 && !v.startsWith("/") && !v.split("/").includes("..") && !/[<>:"|?*]/.test(v); }
function safeFixTarget(v:string){
  if(!safePath(v)) return false;
  const p=v.toLowerCase().replace(/\\/g,"/");
  const name=p.split("/").pop()||"";
  if(name.startsWith(".env")||name===".npmrc"||name===".yarnrc"||name===".gitignore") return false;
  if(/(^|\/)(api|server|auth|database|db|migrations?|secrets?|private)(\/|$)/.test(p)) return false;
  if(/(^|\/)(middleware|instrumentation)\.(?:ts|js)$/.test(p)) return false;
  if(/(^|\/)(package|package-lock|pnpm-lock|yarn\.lock|bun\.lockb?|next\.config|vite\.config|webpack\.config|tsconfig|eslint\.config|postcss\.config|tailwind\.config)(?:\.[^/]*)?$/.test(p)) return false;
  return /\.(?:html?|tsx|jsx|vue|php)$/.test(p);
}

async function chooseRepository(token:string,requested:string){
  if(!requested || !safeRepo(requested)){
    throw new Error("Kies expliciet welke GitHub-repository bij deze website hoort voordat RankFix een codefix maakt.");
  }
  // GitHub is authoritative for repository state and default branch.
  const repo=await githubFetch<{full_name:string;archived?:boolean;disabled?:boolean;permissions?:{push?:boolean;admin?:boolean;maintain?:boolean};default_branch?:string}>(token,"/repos/"+requested);
  if(!repo || String(repo.full_name||"").toLowerCase()!==requested.toLowerCase()){
    throw new Error("De gekozen GitHub-repository kon niet veilig worden bevestigd.");
  }
  if(repo.archived===true || repo.disabled===true){
    throw new Error("Deze GitHub-repository is gearchiveerd of uitgeschakeld en kan niet veilig worden aangepast.");
  }
  const canPush=repo?.permissions?.push===true || repo?.permissions?.admin===true || repo?.permissions?.maintain===true;
  if(!canPush){
    throw new Error("De gekoppelde GitHub-account heeft geen bevestigde schrijfrechten op deze repository.");
  }
  const defaultBranch=String(repo.default_branch||"").trim();
  if(!defaultBranch || !/^[A-Za-z0-9._/-]{1,120}$/.test(defaultBranch)){
    throw new Error("De standaardbranch van deze GitHub-repository kon niet veilig worden bevestigd.");
  }
  return {fullName:String(repo.full_name),defaultBranch};
}

async function chooseFile(token:string,repo:string,branch:string,requested:string,issue:string){
  if(requested && safeFixTarget(requested)) return requested;
  if(requested) throw new Error("Dit bestand valt buiten de veilige RankFix-codefixlijst.");
  const issueText=issue.toLowerCase();
  const preferred=issueText.includes("social")||issueText.includes("open graph")
    ? ["templates/index.html","index.html","app/layout.tsx","src/app/layout.tsx","pages/_document.tsx","app/page.tsx","src/app/page.tsx"]
    : issueText.includes("canonical")
      ? ["templates/index.html","index.html","app/layout.tsx","src/app/layout.tsx","pages/_document.tsx","app/page.tsx","src/app/page.tsx"]
      : ["templates/index.html","index.html","app/layout.tsx","src/app/layout.tsx","pages/_document.tsx","app/page.tsx","src/app/page.tsx"];
  for(const candidate of preferred){
    try{ const f=await githubFetch<{type?:string;content?:string}>(token,"/repos/"+repo+"/contents/"+candidate+"?ref="+encodeURIComponent(branch)); if(f.type==="file"&&typeof f.content==="string") return candidate; }catch{}
  }
  const tree=await githubFetch<{truncated?:boolean;tree?:Array<{type?:string;path?:string}>}>(token,"/repos/"+repo+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1");
  if(tree?.truncated===true) throw new Error("Deze repository is te groot om automatisch en volledig te doorzoeken. Kies eerst expliciet het bestand dat RankFix mag aanpassen.");
  const rawTree=Array.isArray(tree?.tree)?tree.tree:[];
  if(rawTree.length>12000) throw new Error("Deze repository bevat te veel bestanden voor veilige automatische bestandsselectie. Kies eerst expliciet het doelbestand.");
  const files=rawTree.filter((x): x is {type?:string;path:string}=>x.type==="blob"&&typeof x.path==="string"&&safeFixTarget(x.path));
  const ranked=files.map((f)=>{ const p=f.path.toLowerCase(); let score=0; if(/(index|layout|document)/.test(p)) score+=5; if(/\.(html?|tsx|jsx|vue|php)$/.test(p)) score+=3; if(issueText.includes("social")&&/(head|layout|index|document)/.test(p)) score+=5; if(issueText.includes("canonical")&&/(head|layout|index|document)/.test(p)) score+=5; if(p.includes("template")) score+=2; return {path:f.path,score}; }).sort((a,b)=>b.score-a.score);
  if(!ranked[0]) throw new Error("RankFix kon geen geschikt bestand vinden voor deze fix.");
  return ranked[0].path;
}
function slug(v:string){ return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,42)||"seo-fix"; }
function normalizeHostname(value:string){
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; }
}
function normalizeScanUrl(value:string){
  try {
    const url=new URL(value);
    url.hash="";
    url.hostname=url.hostname.toLowerCase().replace(/^www\./,"");
    url.pathname=url.pathname.replace(/\/+$/,"")||"/";
    return url.toString();
  } catch { return value.trim().replace(/\/+$/,""); }
}

function validateCanonicalTarget(proposed:string,targetUrl:string): string[] {
  const errors:string[]=[];
  const canonical=proposed.match(/alternates\s*:\s*\{[\s\S]*?canonical\s*:\s*[\"']([^\"']+)[\"']/i)?.[1]
    || proposed.match(/<link\s+rel=[\"']canonical[\"']\s+href=[\"']([^\"']+)[\"']/i)?.[1]
    || "";
  if(!canonical) return errors;
  const targetHost=normalizeHostname(targetUrl);
  const canonicalHost=normalizeHostname(canonical);
  if(!targetHost || !canonicalHost || canonicalHost!==targetHost){
    errors.push("Canonical-URL wijst naar een ander domein dan de gescande site.");
  }
  return errors;
}
function validateRequestedFixCompletion(current:string, proposed:string, issue:string): { errors:string[]; currentAlreadySatisfied:boolean } {
  const text=issue.toLowerCase();
  const errors:string[]=[];
  const wantsOgTitle=/og[: -]?title|open graph.*title/.test(text);
  const wantsOgDescription=/og[: -]?description|open graph.*description/.test(text);
  const wantsOgImage=/og[: -]?image|open graph.*image/.test(text);
  const hasMetaProperty=(v:string,property:string)=>{
    const source=v.toLowerCase().replace(/\s+/g," ");
    const p=property.toLowerCase();
    const tagPattern=new RegExp("<meta[^>]+(?:property|name)=[\"\']"+p+"[\"\'][^>]+content=[\"\'][^\"\']+[\"\']","i");
    const reversedPattern=new RegExp("<meta[^>]+content=[\"\'][^\"\']+[\"\'][^>]+(?:property|name)=[\"\']"+p+"[\"\']","i");
    return tagPattern.test(source)||reversedPattern.test(source);
  };
  const hasOpenGraphField=(v:string,field:string)=>{
    const block=v.match(/openGraph\s*:\s*\{([\s\S]*?)\}/i)?.[1]||"";
    return new RegExp("\\b"+field+"\\b\\s*:\\s*[\"\'][^\"\']+[\"\']","i").test(block);
  };
  const hasOgTitle=(v:string)=>hasMetaProperty(v,"og:title")||hasOpenGraphField(v,"title");
  const hasOgDescription=(v:string)=>hasMetaProperty(v,"og:description")||hasOpenGraphField(v,"description");
  const hasOgImage=(v:string)=>hasMetaProperty(v,"og:image")||/openGraph\s*:\s*\{[\s\S]*?\b(?:images|image)\b\s*:\s*[^}]+/i.test(v);
  const checks=[[wantsOgTitle,hasOgTitle,"og:title"],[wantsOgDescription,hasOgDescription,"og:description"],[wantsOgImage,hasOgImage,"og:image"]] as const;
  let requestedCount=0; let currentSatisfied=0;
  for(const [requested,checker,label] of checks){ if(!requested) continue; requestedCount++; if(checker(current)) currentSatisfied++; if(!checker(proposed)) errors.push("FIX_MISSING:"+label); }
  return {errors,currentAlreadySatisfied:requestedCount>0&&currentSatisfied===requestedCount};
}


function hasOgMetaTag(value:string,property:string){
  const p=property.replace(":","\\:");
  return new RegExp("<meta[^>]+(?:property|name)=[\"\']"+p+"[\"\'][^>]+content=[\"\'][^\"\']+[\"\']","i").test(value)
    || new RegExp("<meta[^>]+content=[\"\'][^\"\']+[\"\'][^>]+(?:property|name)=[\"\']"+p+"[\"\']","i").test(value);
}
function hasOgOpenGraphField(value:string,field:string){
  const block=value.match(/openGraph\s*:\s*\{([\s\S]*?)\}/i)?.[1]||"";
  return new RegExp("\\b"+field+"\\b\\s*:\\s*[\"\'][^\"\']+[\"\']","i").test(block);
}
function buildDeterministicOgFix(filePath:string,current:string,issue:string,context:string): {content:string;summary:string}|null {
  const text=issue.toLowerCase();
  if(!/og[: -]?title|og[: -]?description|og[: -]?image|open graph/.test(text)) return null;
  const getContext=(label:string)=>context.split("\n").find((line)=>line.toLowerCase().startsWith(label.toLowerCase()+":"))?.slice(label.length+1).trim()||"";
  const title=getContext("OG title")||getContext("Current title");
  const description=getContext("OG description")||getContext("Current description");
  const image=getContext("OG image")||getContext("Existing page image candidate");
  const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const wantsTitle=/og[: -]?title|open graph.*title/.test(text);
  const wantsDescription=/og[: -]?description|open graph.*description/.test(text);
  const wantsImage=/og[: -]?image|open graph.*image/.test(text);
  let content=current;
  if(/\.(html?|php|vue)$/i.test(filePath)){
    const tags=[
      wantsTitle&&title&&!hasOgMetaTag(content,"og:title")?'<meta property="og:title" content="'+esc(title)+'">':"",
      wantsDescription&&description&&!hasOgMetaTag(content,"og:description")?'<meta property="og:description" content="'+esc(description)+'">':"",
      wantsImage&&image&&!hasOgMetaTag(content,"og:image")?'<meta property="og:image" content="'+esc(image)+'">':""
    ].filter(Boolean);
    if(!tags.length) return null;
    content=content.replace(/<\/head>/i,tags.join("\n")+"\n</head>");
  } else if(/\.(tsx|jsx|ts|js)$/i.test(filePath)){
    const additions:string[]=[];
    if(wantsTitle&&title&&!hasOgOpenGraphField(content,"title")) additions.push('title: "'+title.replace(/\\/g,"\\\\").replace(/"/g,'\\\"')+'"');
    if(wantsDescription&&description&&!hasOgOpenGraphField(content,"description")) additions.push('description: "'+description.replace(/\\/g,"\\\\").replace(/"/g,'\\\"')+'"');
    if(wantsImage&&image&&!/openGraph[\s\S]*?images?\s*:/i.test(content)) additions.push('images: ["'+image.replace(/\\/g,"\\\\").replace(/"/g,'\\\"')+'"]');
    if(!additions.length) return null;
    const openGraphMatch=content.match(/openGraph\s*:\s*\{/i);
    if(openGraphMatch){
      const pos=content.indexOf("{",openGraphMatch.index!)+1;
      const existing=content.slice(pos).trim().length>0;
      content=content.slice(0,pos)+"\n    "+additions.join(",\n    ")+(existing?",":"")+content.slice(pos);
    } else {
      const metadataMatch=content.match(/metadata\s*:\s*\{/i);
      if(!metadataMatch) return null;
      const pos=content.indexOf("{",metadataMatch.index!)+1;
      content=content.slice(0,pos)+"\n  openGraph: {\n    "+additions.join(",\n    ")+"\n  },"+content.slice(pos);
    }
  } else return null;
  return {content,summary:"RankFix heeft de ontbrekende Open Graph-metadata veilig toegevoegd met bestaande scanwaarden."};
}
class FixProviderError extends Error {
  constructor(public readonly code:"AI_UNAVAILABLE"|"AI_PROVIDER_ERROR"|"AI_INVALID_OUTPUT",message:string){
    super(message);
    this.name="FixProviderError";
  }
}
async function generateCodeFix(filePath:string,fileContent:string,issue:string,context:string,issueId:string){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new FixProviderError("AI_UNAVAILABLE","OPENAI_API_KEY is missing from the runtime.");
  const model=process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  const input=[
    "You are RankFix AI. Modify this repository file to implement exactly one SEO/GEO fix.",
    "Return ONLY valid JSON: {summary:string,content:string}. content is the COMPLETE replacement file, not a diff.",
    "Preserve behavior and make the smallest safe change. Never invent business facts, branding, URLs, image files, or add secrets.",
    "The selected audit issue_id is: "+issueId+". Change ONLY what is necessary to resolve that exact issue_id. Do not opportunistically fix any other SEO/GEO issue in the file.",
    "If the requested issue is not already satisfied, you MUST make a concrete change in the returned file. Never return the CURRENT FILE unchanged unless the issue is already satisfied.",
    "For Open Graph/social metadata issues, change only the specific Open Graph fields required by the selected issue. Never rewrite the normal meta description or title as a side effect. If exact safe values for a requested OG field are not present in trusted scan context or existing file content, leave that field unchanged rather than inventing it.",
    "For META_DESCRIPTION_MISSING or META_DESCRIPTION_GUIDANCE, change only the normal meta description. Do not change og:title, og:description, title, H1, canonical, structured data, or unrelated content.",
    "For META_TITLE_MISSING or META_TITLE_GUIDANCE, change only the normal metadata title. Do not change descriptions, Open Graph fields, H1, canonical, structured data, or unrelated content.",
    "For H1_MISSING, change only the minimum markup needed to provide one H1. Do not rewrite its visible text or metadata.",
    "Do not change existing site identity, brand name, metadata title, or metadata description unless that exact selected issue_id requires that exact field to change.",
    "If the scan context contains an existing live-site OG image URL, you may use that exact URL for og:image; do not invent a different image URL.",
    "Do not modify dependencies or unrelated functionality.",
    "File: "+filePath,
    "Issue: "+issue,
    "Context: "+context.slice(0,6000),
    "CURRENT FILE:",
    fileContent.slice(0,120000)
  ].join("\n\n");
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model,input,max_output_tokens:12000})
  });
  if(!response.ok){
    const errorText=await response.text();
    let detail="";
    try{
      const parsed=JSON.parse(errorText);
      detail=typeof parsed?.error?.message==="string"?parsed.error.message:errorText.slice(0,500);
    }catch{
      detail=errorText.slice(0,500);
    }
    console.error("GitHub Fix AI provider error",response.status,detail);
    throw new FixProviderError("AI_PROVIDER_ERROR",`AI provider returned HTTP ${response.status}.`);
  }
  const rawData:unknown=await response.json();
  const data=rawData&&typeof rawData==="object"?rawData as Record<string,unknown>:{};
  const output=Array.isArray(data.output)?data.output:[];
  const text=typeof data.output_text==="string"?data.output_text:output.flatMap((item)=>{
    const record=item&&typeof item==="object"?item as Record<string,unknown>:{};
    return Array.isArray(record.content)?record.content:[];
  }).map((item)=>{
    const record=item&&typeof item==="object"?item as Record<string,unknown>:{};
    return typeof record.text==="string"?record.text:"";
  }).join("");
  const clean=text.replace(/^\`\`\`json\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  let parsed:unknown;
  try { parsed=JSON.parse(clean); }
  catch(error){
    console.error("GitHub Fix AI returned invalid JSON", error instanceof Error ? error.message : "invalid JSON");
    throw new FixProviderError("AI_INVALID_OUTPUT","AI provider returned invalid structured output.");
  }
  if(!parsed||typeof parsed!=="object") throw new FixProviderError("AI_INVALID_OUTPUT","AI provider returned invalid structured output.");
  const result=parsed as Record<string,unknown>;
  if(typeof result.content!=="string"||typeof result.summary!=="string") throw new FixProviderError("AI_INVALID_OUTPUT","AI provider returned invalid structured output.");
  return {content:result.content,summary:result.summary};
}

function localizeProviderError(code:FixProviderError["code"],language:"nl"|"en"|"de"|"fr"|"it"|"es"){
  const copy={
    AI_UNAVAILABLE:{nl:"AI Fix is tijdelijk niet beschikbaar.",en:"AI Fix is temporarily unavailable.",de:"AI Fix ist vorübergehend nicht verfügbar.",fr:"AI Fix est temporairement indisponible.",it:"AI Fix è temporaneamente non disponibile.",es:"AI Fix no está disponible temporalmente."},
    AI_PROVIDER_ERROR:{nl:"AI Fix kon de provider niet bereiken. Probeer later opnieuw.",en:"AI Fix could not reach the provider. Try again later.",de:"AI Fix konnte den Anbieter nicht erreichen. Versuche es später erneut.",fr:"AI Fix n’a pas pu joindre le fournisseur. Réessayez plus tard.",it:"AI Fix non è riuscito a raggiungere il provider. Riprova più tardi.",es:"AI Fix no pudo contactar con el proveedor. Inténtalo más tarde."},
    AI_INVALID_OUTPUT:{nl:"AI Fix ontving geen veilige geldige wijziging. Probeer opnieuw.",en:"AI Fix did not receive a safe valid change. Try again.",de:"AI Fix hat keine sichere gültige Änderung erhalten. Versuche es erneut.",fr:"AI Fix n’a pas reçu de modification valide et sûre. Réessayez.",it:"AI Fix non ha ricevuto una modifica valida e sicura. Riprova.",es:"AI Fix no recibió un cambio válido y seguro. Inténtalo de nuevo."}
  } as const;
  return copy[code][language];
}

function localizeFixError(message:string,language:"nl"|"en"|"de"|"fr"|"it"|"es"){
  if(language==="nl") return message;
  const translations:Record<string,Record<"en"|"de"|"fr"|"it"|"es",string>>={
    "Kies expliciet welke GitHub-repository bij deze website hoort voordat RankFix een codefix maakt.":{en:"Choose the GitHub repository for this website before RankFix creates a code fix.",de:"Wähle das GitHub-Repository für diese Website aus, bevor RankFix einen Codefix erstellt.",fr:"Choisissez le dépôt GitHub associé à ce site avant que RankFix ne crée une correction.",it:"Scegli il repository GitHub associato a questo sito prima che RankFix crei una correzione.",es:"Elige el repositorio de GitHub asociado a este sitio antes de que RankFix cree una corrección."},
    "De gekozen GitHub-repository kon niet veilig worden bevestigd.":{en:"The selected GitHub repository could not be safely verified.",de:"Das ausgewählte GitHub-Repository konnte nicht sicher bestätigt werden.",fr:"Le dépôt GitHub sélectionné n’a pas pu être vérifié en toute sécurité.",it:"Il repository GitHub selezionato non è stato verificato in modo sicuro.",es:"No se pudo verificar de forma segura el repositorio de GitHub seleccionado."},
    "Deze GitHub-repository is gearchiveerd of uitgeschakeld en kan niet veilig worden aangepast.":{en:"This GitHub repository is archived or disabled and cannot be safely modified.",de:"Dieses GitHub-Repository ist archiviert oder deaktiviert und kann nicht sicher geändert werden.",fr:"Ce dépôt GitHub est archivé ou désactivé et ne peut pas être modifié en toute sécurité.",it:"Questo repository GitHub è archiviato o disabilitato e non può essere modificato in modo sicuro.",es:"Este repositorio de GitHub está archivado o deshabilitado y no se puede modificar de forma segura."},
    "De gekoppelde GitHub-account heeft geen bevestigde schrijfrechten op deze repository.":{en:"The connected GitHub account does not have confirmed write access to this repository.",de:"Das verbundene GitHub-Konto hat keine bestätigten Schreibrechte für dieses Repository.",fr:"Le compte GitHub connecté ne dispose pas d’un accès en écriture confirmé à ce dépôt.",it:"L’account GitHub collegato non dispone di accesso in scrittura confermato a questo repository.",es:"La cuenta de GitHub conectada no tiene acceso de escritura confirmado a este repositorio."},
    "Dit bestand valt buiten de veilige RankFix-codefixlijst.":{en:"This file is outside RankFix’s safe code-fix list.",de:"Diese Datei liegt außerhalb der sicheren RankFix-Codefix-Liste.",fr:"Ce fichier ne figure pas dans la liste sûre des corrections de code RankFix.",it:"Questo file non rientra nell’elenco sicuro delle correzioni di codice RankFix.",es:"Este archivo está fuera de la lista segura de correcciones de código de RankFix."},
    "RankFix kon geen geschikt bestand vinden voor deze fix.":{en:"RankFix could not find a suitable file for this fix.",de:"RankFix konnte keine geeignete Datei für diesen Fix finden.",fr:"RankFix n’a pas trouvé de fichier adapté à cette correction.",it:"RankFix non ha trovato un file adatto a questa correzione.",es:"RankFix no encontró un archivo adecuado para esta corrección."},
    "Canonical-URL wijst naar een ander domein dan de gescande site.":{en:"The canonical URL points to a different domain than the scanned site.",de:"Die Canonical-URL verweist auf eine andere Domain als die gescannte Website.",fr:"L’URL canonique pointe vers un domaine différent du site analysé.",it:"L’URL canonico punta a un dominio diverso dal sito analizzato.",es:"La URL canónica apunta a un dominio diferente del sitio analizado."},
    "Het doelbestand is gevoelig voor dependencies, deployment, database of automatisering en mag niet automatisch worden aangepast.":{en:"The target file is sensitive to dependencies, deployment, database, or automation and cannot be modified automatically.",de:"Die Zieldatei betrifft Abhängigkeiten, Deployment, Datenbank oder Automatisierung und darf nicht automatisch geändert werden.",fr:"Le fichier cible concerne les dépendances, le déploiement, la base de données ou l’automatisation et ne peut pas être modifié automatiquement.",it:"Il file di destinazione riguarda dipendenze, deployment, database o automazione e non può essere modificato automaticamente.",es:"El archivo de destino afecta a dependencias, despliegue, base de datos o automatización y no puede modificarse automáticamente."},
    "Het doelbestand valt buiten de toegestane webbronbestanden voor automatische RankFix-wijzigingen.":{en:"The target file is outside the web source files allowed for automatic RankFix changes.",de:"Die Zieldatei liegt außerhalb der für automatische RankFix-Änderungen erlaubten Webquelldateien.",fr:"Le fichier cible ne fait pas partie des fichiers source web autorisés pour les modifications automatiques RankFix.",it:"Il file di destinazione non rientra nei file sorgente web consentiti per le modifiche automatiche RankFix.",es:"El archivo de destino no está entre los archivos fuente web permitidos para cambios automáticos de RankFix."},
    "De voorgestelde wijziging raakt meer dan 120 regels en is te groot voor een automatische SEO/GEO-codefix.":{en:"The proposed change affects more than 120 lines and is too large for an automatic SEO/GEO code fix.",de:"Die vorgeschlagene Änderung betrifft mehr als 120 Zeilen und ist zu groß für einen automatischen SEO/GEO-Codefix.",fr:"La modification proposée touche plus de 120 lignes et est trop importante pour une correction automatique SEO/GEO.",it:"La modifica proposta interessa più di 120 righe ed è troppo grande per una correzione automatica SEO/GEO.",es:"El cambio propuesto afecta a más de 120 líneas y es demasiado grande para una corrección automática SEO/GEO."},
    "De voorgestelde GitHub-wijziging is leeg.":{en:"The proposed GitHub change is empty.",de:"Die vorgeschlagene GitHub-Änderung ist leer.",fr:"La modification GitHub proposée est vide.",it:"La modifica GitHub proposta è vuota.",es:"El cambio de GitHub propuesto está vacío."},
    "De AI-output bevat mogelijk destructieve of geheime gegevens.":{en:"The AI output may contain destructive commands or secret data.",de:"Die AI-Ausgabe enthält möglicherweise destruktive Befehle oder geheime Daten.",fr:"La sortie AI peut contenir des commandes destructrices ou des données secrètes.",it:"L’output AI potrebbe contenere comandi distruttivi o dati segreti.",es:"La salida de AI puede contener comandos destructivos o datos secretos."},
    "De AI-fix wijzigt de bestaande site-identiteit in de metadata.":{en:"The AI fix changes the existing site identity in metadata.",de:"Der AI-Fix ändert die bestehende Website-Identität in den Metadaten.",fr:"La correction AI modifie l’identité existante du site dans les métadonnées.",it:"La correzione AI modifica l’identità esistente del sito nei metadati.",es:"La corrección AI cambia la identidad existente del sitio en los metadatos."},
    "De AI-fix wijzigt de bestaande metadata-beschrijving zonder dat dit is gevraagd.":{en:"The AI fix changes the existing metadata description without this being requested.",de:"Der AI-Fix ändert die bestehende Meta-Beschreibung, obwohl dies nicht angefordert wurde.",fr:"La correction AI modifie la description des métadonnées sans que cela ait été demandé.",it:"La correzione AI modifica la descrizione dei metadati senza che sia stato richiesto.",es:"La corrección AI cambia la descripción de metadatos sin que se haya solicitado."},
    "De AI-fix zet een andere merk-/paginatitel in Open Graph-metadata.":{en:"The AI fix sets a different brand/page title in Open Graph metadata.",de:"Der AI-Fix setzt einen anderen Marken-/Seitentitel in den Open-Graph-Metadaten.",fr:"La correction AI définit un autre titre de marque/page dans les métadonnées Open Graph.",it:"La correzione AI imposta un titolo di brand/pagina diverso nei metadati Open Graph.",es:"La corrección AI establece un título de marca/página diferente en los metadatos Open Graph."},
    "De AI-fix zet een andere beschrijving in Open Graph-metadata.":{en:"The AI fix sets a different description in Open Graph metadata.",de:"Der AI-Fix setzt eine andere Beschreibung in den Open-Graph-Metadaten.",fr:"La correction AI définit une autre description dans les métadonnées Open Graph.",it:"La correzione AI imposta una descrizione diversa nei metadati Open Graph.",es:"La corrección AI establece una descripción diferente en los metadatos Open Graph."},
    "Open Graph-metadata gevonden; controleer dat waarden en eventuele afbeeldingen bij de bestaande site-identiteit passen.":{en:"Open Graph metadata found; verify that values and images match the existing site identity.",de:"Open-Graph-Metadaten gefunden; prüfe, ob Werte und Bilder zur bestehenden Website-Identität passen.",fr:"Métadonnées Open Graph détectées ; vérifiez que les valeurs et images correspondent à l’identité existante du site.",it:"Metadati Open Graph rilevati; verifica che valori e immagini corrispondano all’identità esistente del sito.",es:"Se encontraron metadatos Open Graph; comprueba que los valores y las imágenes coincidan con la identidad existente del sitio."},
    "Het doelbestand is geen standaard web-templatebestand.":{en:"The target file is not a standard web template file.",de:"Die Zieldatei ist keine standardmäßige Web-Template-Datei.",fr:"Le fichier cible n’est pas un fichier de modèle web standard.",it:"Il file di destinazione non è un file template web standard.",es:"El archivo de destino no es un archivo de plantilla web estándar."},
    "De AI-fix is buiten verhouding groot ten opzichte van het bestaande bestand.":{en:"The AI fix is disproportionately large compared with the existing file.",de:"Der AI-Fix ist im Verhältnis zur bestehenden Datei unverhältnismäßig groß.",fr:"La correction AI est disproportionnée par rapport au fichier existant.",it:"La correzione AI è sproporzionatamente grande rispetto al file esistente.",es:"La corrección AI es desproporcionadamente grande en comparación con el archivo existente."}
  };
  const known=translations[message]?.[language];
  if(known) return known;
  // Never expose unexpected GitHub/provider/database details to customers.
  const generic={
    nl:"GitHub Fix kon niet veilig worden voltooid. Probeer opnieuw of controleer de GitHub-koppeling.",
    en:"GitHub Fix could not be completed safely. Try again or check the GitHub connection.",
    de:"GitHub Fix konnte nicht sicher abgeschlossen werden. Versuche es erneut oder prüfe die GitHub-Verbindung.",
    fr:"GitHub Fix n’a pas pu être terminé en toute sécurité. Réessayez ou vérifiez la connexion GitHub.",
    it:"GitHub Fix non è stato completato in modo sicuro. Riprova o controlla la connessione GitHub.",
    es:"GitHub Fix no pudo completarse de forma segura. Inténtalo de nuevo o revisa la conexión con GitHub."
  } as const;
  return generic[language];
}

function estimateChangedLines(before:string,after:string){
  const normalize=(line:string)=>line.trimEnd();
  const counts=new Map<string,number>();
  for(const raw of before.split("\n")){
    const line=normalize(raw);
    if(!line.trim()) continue;
    counts.set(line,(counts.get(line)||0)+1);
  }
  let matched=0;
  let meaningfulAfter=0;
  for(const raw of after.split("\n")){
    const line=normalize(raw);
    if(!line.trim()) continue;
    meaningfulAfter++;
    const available=counts.get(line)||0;
    if(available>0){ matched++; counts.set(line,available-1); }
  }
  const meaningfulBefore=[...before.split("\n")].filter(line=>line.trim()).length;
  return { changed:Math.max(meaningfulBefore,meaningfulAfter)-matched, meaningfulBefore, meaningfulAfter };
}

export async function POST(request:Request){
  let language:"nl"|"en"|"de"|"fr"|"it"|"es"="nl";
  try{
    const user=await getCurrentUser();
    if(!user) {
      const acceptLanguage=(request.headers.get("accept-language")||"").toLowerCase();
      const requested=(acceptLanguage.match(/(?:^|,|\s)(nl|en|de|fr|it|es)(?:-|;|,|$)/)?.[1]||"nl") as typeof language;
      const loginCopy={nl:"Login vereist.",en:"Login required.",de:"Anmeldung erforderlich.",fr:"Connexion requise.",it:"Accesso richiesto.",es:"Inicio de sesión requerido."} as const;
      return NextResponse.json({error:loginCopy[requested]},{status:401});
    }
    await ensureDatabase();
    const body=await request.json();
    const planResult=await getDb().query("SELECT plan_code FROM users WHERE id=$1 LIMIT 1",[user.id]);
    const planCode=String(planResult.rows[0]?.plan_code||"free").toLowerCase();
    const supportedLanguages=["nl","en","de","fr","it","es"] as const;
    type FixLanguage=(typeof supportedLanguages)[number];
    language=supportedLanguages.includes(body?.language as FixLanguage)?body.language as FixLanguage:"nl";
    const msg=(nl:string,en:string,de:string,fr:string,it:string,es:string)=>({nl,en,de,fr,it,es} as Record<FixLanguage,string>)[language];
    if(planCode==="free") return NextResponse.json({error:msg("AI- en GitHub-fixes zijn beschikbaar met een betaald abonnement. Je bestaande scanrapport blijft beschikbaar.","AI and GitHub fixes are available with a paid plan. Your existing scan report remains available.","AI- und GitHub-Fixes sind mit einem kostenpflichtigen Tarif verfügbar. Dein bestehender Scanbericht bleibt verfügbar.","Les correctifs IA et GitHub sont disponibles avec une offre payante. Votre rapport d’analyse existant reste disponible.","Le correzioni AI e GitHub sono disponibili con un piano a pagamento. Il rapporto di scansione esistente resta disponibile.","Las correcciones de IA y GitHub están disponibles con un plan de pago. Tu informe de análisis existente seguirá disponible."),code:"PAID_PLAN_REQUIRED"},{status:403});
    const requestedRepo=typeof body?.repo==="string"?body.repo.trim():"";
    const requestedPath=typeof body?.path==="string"?body.path.trim():"";
    let issue=typeof body?.issue==="string"?body.issue.trim():"";
    const issueId=typeof body?.issue_id==="string"?body.issue_id.trim():"";
    let context=typeof body?.context==="string"?body.context:"";
    const scanId=typeof body?.scan_id==="string"?body.scan_id.trim():"";
    const baseBranch=typeof body?.baseBranch==="string"&&/^[A-Za-z0-9._/-]{1,120}$/.test(body.baseBranch)?body.baseBranch:"main";
    const previewOnly=body?.preview===true;
    // Preview is read-only: it must not consume the PR/code-write rate limit.
    // Only a confirmed publish request can create a branch/commit/PR.
    if(!previewOnly && !await consumeRateLimit("github-fix",String(user.id),12,3600)){
      return NextResponse.json({error:msg("Te veel codefix-publicaties. Probeer later opnieuw.","Too many code-fix publications. Try again later.","Zu viele Codefix-Veröffentlichungen. Versuche es später erneut.","Trop de publications de correctifs. Réessayez plus tard.","Troppe pubblicazioni di correzioni. Riprova più tardi.","Demasiadas publicaciones de correcciones. Inténtalo más tarde.")},{status:429});
    }
    if((requestedRepo&&!safeRepo(requestedRepo))||(requestedPath&&!safeFixTarget(requestedPath))||!issueId||!scanId) return NextResponse.json({error:msg("Ongeldige fixgegevens: scan_id en issue_id zijn verplicht.","Invalid fix data: scan_id and issue_id are required.","Ungültige Fix-Daten: scan_id und issue_id sind erforderlich.","Données de correction invalides : scan_id et issue_id sont requis.","Dati di correzione non validi: scan_id e issue_id sono obbligatori.","Datos de corrección no válidos: scan_id e issue_id son obligatorios.")},{status:400});
    const fixPolicy=getFixPolicy(issueId);
    if(fixPolicy.category==="C"||!fixPolicy.safe_type){
      return NextResponse.json({error:msg("Deze bevinding is niet toegestaan voor een automatische GitHub-codefix. RankFix vereist hier handmatige controle.","This finding is not eligible for an automatic GitHub code fix. RankFix requires manual review.","Dieser Befund ist nicht für einen automatischen GitHub-Codefix geeignet. RankFix erfordert eine manuelle Prüfung.","Ce problème ne peut pas être corrigé automatiquement via GitHub. RankFix exige une vérification manuelle.","Questo problema non è idoneo a una correzione automatica GitHub. RankFix richiede un controllo manuale.","Este problema no admite una corrección automática de GitHub. RankFix requiere una revisión manual."),issue_id:issueId,fix_category:fixPolicy.category},{status:422});
    }
    await ensureDatabase();
    const trustedScan=await getDb().query("SELECT final_url,result FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",[scanId,user.id]);
    if(!trustedScan.rowCount) return NextResponse.json({error:msg("Deze scan bestaat niet of hoort niet bij dit account.","This scan does not exist or does not belong to this account.","Dieser Scan existiert nicht oder gehört nicht zu diesem Konto.","Cette analyse n’existe pas ou n’appartient pas à ce compte.","Questa scansione non esiste o non appartiene a questo account.","Este análisis no existe o no pertenece a esta cuenta.")},{status:404});
    const scanRow=trustedScan.rows[0];
    const scanResult=scanRow.result||{};
    const trustedChecks=[
      ...(Array.isArray(scanResult?.seo?.checks)?scanResult.seo.checks:[]),
      ...(Array.isArray(scanResult?.geo?.checks)?scanResult.geo.checks:[])
    ];
    const trustedCheck=trustedChecks.find((check:Record<string,unknown>)=>String(check.issue_id||check.rule_id||"")===issueId);
    if(!trustedCheck) return NextResponse.json({error:msg("Deze bevinding kon niet in de opgeslagen scan worden bevestigd.","This finding could not be confirmed in the saved scan.","Dieser Befund konnte im gespeicherten Scan nicht bestätigt werden.","Ce problème n’a pas pu être confirmé dans l’analyse enregistrée.","Questo problema non è stato confermato nella scansione salvata.","Este problema no pudo confirmarse en el análisis guardado.")},{status:404});
    const trustedStatus=String(trustedCheck?.issue_status||trustedCheck?.status||"").toUpperCase();
    const trustedConfidence=String(trustedCheck?.confidence||"").toLowerCase();
    const trustedEvidence=trustedCheck?.evidence;
    const hasTrustedEvidence=!!trustedEvidence && trustedEvidence.found !== null && trustedEvidence.found !== undefined && trustedEvidence.found !== "";
    if(!["FAIL","WARNING"].includes(trustedStatus) || trustedConfidence==="low" || !hasTrustedEvidence){
      return NextResponse.json({error:msg(
        "Deze bevinding is niet voldoende bewezen voor een automatische GitHub-codefix. Controleer de scan eerst handmatig.",
        "This finding is not sufficiently proven for an automatic GitHub code fix. Review the scan first.",
        "Dieser Befund ist für einen automatischen GitHub-Codefix nicht ausreichend bestätigt. Prüfe zuerst den Scan.",
        "Ce problème n’est pas suffisamment confirmé pour une correction GitHub automatique. Vérifiez d’abord l’analyse.",
        "Questo problema non è sufficientemente verificato per una correzione GitHub automatica. Controlla prima la scansione.",
        "Este problema no está suficientemente confirmado para una corrección automática de GitHub. Revisa primero el análisis."
      ),issue_id:issueId,status:trustedStatus||"UNABLE_TO_CONFIRM",confidence:trustedConfidence||"low"},{status:422});
    }
    issue=String(trustedCheck.title||issueId)+": "+String(trustedCheck.fix||trustedCheck.message||"");
    context=[trustedCheck.message,trustedCheck.fix,trustedCheck?.evidence?.details].filter(Boolean).map(String).join("\n").slice(0,6000);
    const trustedUrl=String(scanRow.final_url||"");

    const connection=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
    if(!connection.rowCount) return NextResponse.json({error:msg("Verbind eerst GitHub via je dashboard.","Connect GitHub from your dashboard first.","Verbinde zuerst GitHub über dein Dashboard.","Connectez d’abord GitHub depuis votre tableau de bord.","Collega prima GitHub dalla dashboard.","Conecta primero GitHub desde tu panel.")},{status:409});
    const token=decryptToken(connection.rows[0].access_token_encrypted);
    const scannedHost=normalizeHostname(trustedUrl);
    let effectiveRepo=requestedRepo;
    let effectiveBaseBranch=baseBranch;
    let existingMapping:{repository?:string;base_branch?:string}|null=null;
    if(scannedHost){
      const saved=await getDb().query(
        "SELECT repository,base_branch FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",
        [user.id,scannedHost]
      );
      if(saved.rowCount){
        existingMapping=saved.rows[0];
        effectiveRepo=String(existingMapping.repository||"");
        effectiveBaseBranch=String(existingMapping.base_branch||baseBranch);
      } else if(!requestedRepo){
        return NextResponse.json({error:msg("Kies eenmalig de GitHub-repository die bij deze website hoort.","Choose the GitHub repository for this website once.","Wähle einmalig das GitHub-Repository für diese Website aus.","Choisissez une fois le dépôt GitHub associé à ce site.","Scegli una volta il repository GitHub associato a questo sito.","Elige una vez el repositorio de GitHub asociado a este sitio."),website:scannedHost},{status:409});
      }
    }
    let verifiedRepo;
    try{
      verifiedRepo=await chooseRepository(token,effectiveRepo);
    }catch(error){
      const raw=error instanceof Error?error.message:"GitHub fix mislukt.";
      throw new Error(localizeFixError(raw,language));
    }
    const repo=verifiedRepo.fullName;
    effectiveBaseBranch=verifiedRepo.defaultBranch;
    if(scannedHost){
      if(existingMapping && requestedRepo && requestedRepo.toLowerCase()!==repo.toLowerCase()){
        return NextResponse.json({error:msg("Deze website is al aan een andere GitHub-repository gekoppeld. RankFix gebruikt de opgeslagen websitekoppeling en wijzigt die niet automatisch.","This website is already linked to another GitHub repository. RankFix uses the saved website mapping and does not change it automatically.","Diese Website ist bereits mit einem anderen GitHub-Repository verknüpft. RankFix verwendet die gespeicherte Zuordnung und ändert sie nicht automatisch.","Ce site est déjà associé à un autre dépôt GitHub. RankFix utilise l’association enregistrée et ne la modifie pas automatiquement.","Questo sito è già collegato a un altro repository GitHub. RankFix usa il collegamento salvato e non lo modifica automaticamente.","Este sitio ya está vinculado a otro repositorio de GitHub. RankFix usa la vinculación guardada y no la cambia automáticamente."),website:scannedHost,repository:repo},{status:409});
      }
      await getDb().query(
        "INSERT INTO website_repositories (user_id,website_host,repository,base_branch,verified_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (user_id,website_host) DO UPDATE SET base_branch=EXCLUDED.base_branch,verified_at=NOW(),updated_at=NOW()",
        [user.id,scannedHost,repo,effectiveBaseBranch]
      );
    }
    let path:string;
    try{
      path=await chooseFile(token,repo,effectiveBaseBranch,requestedPath,issue);
    }catch(error){
      const raw=error instanceof Error?error.message:"GitHub fix mislukt.";
      throw new Error(localizeFixError(raw,language));
    }
    const file=await githubFetch<{type?:string;content?:string;sha:string}>(token,"/repos/"+repo+"/contents/"+path+"?ref="+encodeURIComponent(effectiveBaseBranch));
    if(file.type!=="file"||typeof file.content!=="string") return NextResponse.json({error:msg("Dit bestand kan niet worden bewerkt.","This file cannot be edited.","Diese Datei kann nicht bearbeitet werden.","Ce fichier ne peut pas être modifié.","Questo file non può essere modificato.","Este archivo no se puede editar.")},{status:400});
    const current=Buffer.from(file.content.replace(/\n/g,""),"base64").toString("utf8");
    if(current.length>120000) return NextResponse.json({error:msg("Bestand is te groot voor een veilige AI-codefix.","The file is too large for a safe AI code fix.","Die Datei ist zu groß für einen sicheren AI-Codefix.","Le fichier est trop volumineux pour une correction de code AI sûre.","Il file è troppo grande per una correzione di codice AI sicura.","El archivo es demasiado grande para una corrección de código AI segura.")},{status:413});
    const deterministicOgFix=buildDeterministicOgFix(path,current,issue,context);
    const generated=deterministicOgFix || await generateCodeFix(path,current,issue,context,issueId);
    if(generated.content.length>180000) return NextResponse.json({error:msg("AI-output is te groot voor een veilige wijziging.","AI output is too large for a safe change.","Die AI-Ausgabe ist zu groß für eine sichere Änderung.","La sortie AI est trop volumineuse pour une modification sûre.","L’output AI è troppo grande per una modifica sicura.","La salida de AI es demasiado grande para un cambio seguro.")},{status:422});
    if(!generated.content.trim() || /(?:\[YOUR_[^\]]*\]|\bTODO\b|CHANGE_ME|REPLACE_ME|INSERT_[A-Z_]+)/i.test(generated.content)) return NextResponse.json({error:msg("AI-output bevat lege inhoud of placeholders.","AI output contains empty content or placeholders.","Die AI-Ausgabe enthält leere Inhalte oder Platzhalter.","La sortie AI contient du contenu vide ou des espaces réservés.","L’output AI contiene contenuti vuoti o segnaposto.","La salida de AI contiene contenido vacío o marcadores de posición.")},{status:422});
    // GitHub fixes contain a complete source file, not a single SEO field.
    // The SEO value validator is intentionally not applied to the whole file,
    // because it can mistake unrelated source-code text for placeholders/field markup.
    const githubValidation=validateGithubFix({current,proposed:generated.content,filePath:path,issue});
    githubValidation.errors = githubValidation.errors.map((error:string)=>localizeFixError(error,language));
    githubValidation.warnings = githubValidation.warnings.map((warning:string)=>localizeFixError(warning,language));
    const canonicalErrors=validateCanonicalTarget(generated.content,trustedUrl);
    if(canonicalErrors.length) githubValidation.errors.push(...canonicalErrors.map((error:string)=>localizeFixError(error,language)));

    const completion=validateRequestedFixCompletion(current,generated.content,issue);
    if(completion.errors.length) githubValidation.errors.push(...completion.errors.map((error:string)=>{
      if(error.startsWith("FIX_MISSING:")){
        const label=error.slice("FIX_MISSING:".length);
        return msg(
          "De gevraagde verbetering voor "+label+" staat niet in de voorgestelde code.",
          "The requested improvement for "+label+" is missing from the proposed code.",
          "Die angeforderte Verbesserung für "+label+" fehlt im vorgeschlagenen Code.",
          "L’amélioration demandée pour "+label+" est absente du code proposé.",
          "Il miglioramento richiesto per "+label+" non è presente nel codice proposto.",
          "La mejora solicitada para "+label+" no está presente en el código propuesto."
        );
      }
      return localizeFixError(error,language);
    }));
    const currentBytes=Buffer.byteLength(current,"utf8");
    const proposedBytes=Buffer.byteLength(generated.content,"utf8");
    const changedBytes=Math.abs(proposedBytes-currentBytes);
    const currentLines=current.split("\n");
    const proposedLines=generated.content.split("\n");
    const lineGrowth=Math.max(0,proposedLines.length-currentLines.length);
    const changeEstimate=estimateChangedLines(current,generated.content);
    const changedRatio=changeEstimate.meaningfulBefore
      ? changeEstimate.changed/changeEstimate.meaningfulBefore
      : changeEstimate.changed>0 ? 1 : 0;
    const sizeRatio=currentBytes ? proposedBytes/currentBytes : 1;
    if(changedBytes>50000 || lineGrowth>500 || changeEstimate.changed>250 || changedRatio>0.35 || sizeRatio<0.65 || sizeRatio>1.5){
      githubValidation.errors.push(msg("De voorgestelde wijziging raakt te veel van het bestand voor één automatische RankFix-fix.","The proposed change affects too much of the file for a single automatic RankFix fix.","Die vorgeschlagene Änderung betrifft zu viel der Datei für einen einzelnen automatischen RankFix-Fix.","La modification proposée affecte une trop grande partie du fichier pour une seule correction automatique RankFix.","La modifica proposta interessa una parte troppo ampia del file per una singola correzione automatica RankFix.","El cambio propuesto afecta demasiado al archivo para una sola corrección automática de RankFix."));
    }
    if(!githubValidation.valid || githubValidation.errors.length) return NextResponse.json({error:msg("AI-codefix is geblokkeerd door de GitHub veiligheidscontrole.","The AI code fix was blocked by the GitHub safety check.","Der AI-Codefix wurde von der GitHub-Sicherheitsprüfung blockiert.","La correction de code AI a été bloquée par le contrôle de sécurité GitHub.","La correzione di codice AI è stata bloccata dal controllo di sicurezza GitHub.","La corrección de código AI fue bloqueada por la comprobación de seguridad de GitHub."),validation:githubValidation},{status:422});

    if(completion.currentAlreadySatisfied){
      return NextResponse.json({success:true,alreadyApplied:true,status:"already_ok",summary:msg("Deze verbetering is al aanwezig. RankFix hoefde niets aan te passen.","This improvement is already present. RankFix did not need to change anything.","Diese Verbesserung ist bereits vorhanden. RankFix musste nichts ändern.","Cette amélioration est déjà présente. RankFix n’a rien eu à modifier.","Questo miglioramento è già presente. RankFix non ha dovuto modificare nulla.","Esta mejora ya está presente. RankFix no tuvo que cambiar nada."),repository:repo,path});
    }

    const normalizeFile=(value:string)=>value.replace(/\r\n/g,"\n").replace(/[ \t]+$/gm,"").trim();
    if(normalizeFile(current)===normalizeFile(generated.content)){
      return NextResponse.json({success:false,status:"fix_not_applied",error:msg("RankFix kon de gevraagde verbetering niet aantoonbaar in het bestand plaatsen. Er is niets gewijzigd.","RankFix could not verifiably apply the requested improvement to the file. Nothing was changed.","RankFix konnte die angeforderte Verbesserung nicht nachweisbar in der Datei anwenden. Es wurde nichts geändert.","RankFix n’a pas pu appliquer de manière vérifiable l’amélioration demandée au fichier. Rien n’a été modifié.","RankFix non è riuscito ad applicare in modo verificabile il miglioramento richiesto al file. Non è stato modificato nulla.","RankFix no pudo aplicar de forma verificable la mejora solicitada al archivo. No se modificó nada."),repository:repo,path},{status:422});
    }

    if(previewOnly){
      const beforeLines=current.split("\n");
      const afterLines=generated.content.split("\n");
      let prefix=0;
      while(prefix<beforeLines.length&&prefix<afterLines.length&&beforeLines[prefix]===afterLines[prefix]) prefix++;
      let suffix=0;
      while(suffix<beforeLines.length-prefix&&suffix<afterLines.length-prefix&&beforeLines[beforeLines.length-1-suffix]===afterLines[afterLines.length-1-suffix]) suffix++;
      const beforeChanged=beforeLines.slice(prefix,Math.min(beforeLines.length-suffix,prefix+80));
      const afterChanged=afterLines.slice(prefix,Math.min(afterLines.length-suffix,prefix+80));
      return NextResponse.json({
        success:true,status:"preview",summary:generated.summary,repository:repo,path,
        preview:{startLine:prefix+1,before:beforeChanged,after:afterChanged,truncated:(beforeLines.length-prefix-suffix>80)||(afterLines.length-prefix-suffix>80),changedLines:changeEstimate.changed}
      });
    }

    const branch="rankfix/"+Date.now()+"-"+slug(issue);
    const baseRef=await githubFetch<{object:{sha:string}}>(token,"/repos/"+repo+"/git/ref/heads/"+encodeURIComponent(effectiveBaseBranch));
    await githubFetch<unknown>(token,"/repos/"+repo+"/git/refs",{method:"POST",body:JSON.stringify({ref:"refs/heads/"+branch,sha:baseRef.object.sha})});
    await githubFetch<unknown>(token,"/repos/"+repo+"/contents/"+path,{
      method:"PUT",
      body:JSON.stringify({message:"fix: RankFix "+slug(issue),content:Buffer.from(generated.content,"utf8").toString("base64"),branch,sha:file.sha})
    });
    const pr=await githubFetch<{number?:number;html_url?:string}>(token,"/repos/"+repo+"/pulls",{
      method:"POST",
      body:JSON.stringify({title:"RankFix: "+generated.summary.slice(0,70),head:branch,base:effectiveBaseBranch,body:"## RankFix AI fix\n\n"+generated.summary+"\n\nGenerated by RankFix AI. Review the diff before merging.\n\nTarget: "+path})
    });
    const db=getDb();
    const scannedUrl = normalizeScanUrl(trustedUrl);
    if (scannedUrl && issueId) {
      await db.query(
        "INSERT INTO pending_fixes (user_id,scanned_url,issue_id,status,repository,file_path,pr_number) VALUES ($1,$2,$3,'PREPARED',$4,$5,$6)",
        [user.id,scannedUrl,issueId,repo,path,Number(pr.number)||null]
      );
    }

    return NextResponse.json({
      success:true,
      status:"prepared",
      summary:generated.summary,
      repository:repo,
      path,
      branch,
      issue_id:issueId,
      verification:{
        required:true,
        state:"WAITING_FOR_MERGE_AND_RESCAN",
        scanned_url:scannedUrl,
        message:"De fix is voorbereid. RankFix bevestigt het probleem pas als opgelost nadat de PR is gemerged en een nieuwe scan hetzelfde issue_id niet meer als FAIL of WARNING teruggeeft."
      },
      pr:{number:pr.number,url:pr.html_url,title:pr.title}
    });
  }catch(error){
    if(error instanceof FixProviderError){
      return NextResponse.json({error:localizeProviderError(error.code,language)},{status:error.code==="AI_UNAVAILABLE"?503:502});
    }
    const raw=error instanceof Error?error.message:"GitHub fix mislukt.";
    return NextResponse.json({error:localizeFixError(raw,language)},{status:500});
  }
}
