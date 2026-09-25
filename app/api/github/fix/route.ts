import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import { decryptToken, githubFetch } from "@/lib/github";
import { validateFix } from "@/lib/seo-fix-validator";
import { validateGithubFix } from "@/lib/github-fix-validator";
import { getFixPolicy } from "@/lib/fix-policy";

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
  const repo=await githubFetch<any>(token,"/repos/"+requested);
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
    try{ const f=await githubFetch<any>(token,"/repos/"+repo+"/contents/"+candidate+"?ref="+encodeURIComponent(branch)); if(f.type==="file"&&typeof f.content==="string") return candidate; }catch{}
  }
  const tree=await githubFetch<any>(token,"/repos/"+repo+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1");
  const files=Array.isArray(tree?.tree)?tree.tree.filter((x:any)=>x.type==="blob"&&typeof x.path==="string"&&safeFixTarget(x.path)):[];
  const ranked=files.map((f:any)=>{ const p=f.path.toLowerCase(); let score=0; if(/(index|layout|document)/.test(p)) score+=5; if(/\.(html?|tsx|jsx|vue|php)$/.test(p)) score+=3; if(issueText.includes("social")&&/(head|layout|index|document)/.test(p)) score+=5; if(issueText.includes("canonical")&&/(head|layout|index|document)/.test(p)) score+=5; if(p.includes("template")) score+=2; return {path:f.path,score}; }).sort((a:any,b:any)=>b.score-a.score);
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
  for(const [requested,checker,label] of checks){ if(!requested) continue; requestedCount++; if(checker(current)) currentSatisfied++; if(!checker(proposed)) errors.push("De gevraagde verbetering voor "+label+" staat niet in de voorgestelde code."); }
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
async function generateCodeFix(filePath:string,fileContent:string,issue:string,context:string){
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) throw new Error("OPENAI_API_KEY ontbreekt in de Render runtime. Controleer Environment Variables van rankfix-app en deploy opnieuw.");
  const model=process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
  const input=[
    "You are RankFix AI. Modify this repository file to implement exactly one SEO/GEO fix.",
    "Return ONLY valid JSON: {summary:string,content:string}. content is the COMPLETE replacement file, not a diff.",
    "Preserve behavior and make the smallest safe change. Never invent business facts, branding, URLs, image files, or add secrets.",
    "If the requested issue is not already satisfied, you MUST make a concrete change in the returned file. Never return the CURRENT FILE unchanged unless the issue is already satisfied.",
    "For Open Graph/social metadata issues, implement every requested og:title, og:description, and og:image field that is missing, using the exact values supplied by the scan context.",
    "Do not change existing site identity, brand name, metadata title, or metadata description unless the issue explicitly requests a rebrand.",
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
    throw new Error(`OpenAI API fout (${response.status}): ${detail}`);
  }
  const data=await response.json();
  const text=typeof data?.output_text==="string"?data.output_text:data?.output?.flatMap((x:any)=>x?.content||[]).map((x:any)=>x?.text||"").join("")||"";
  const clean=text.replace(/^\`\`\`json\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  const parsed=JSON.parse(clean);
  if(typeof parsed.content!=="string"||typeof parsed.summary!=="string") throw new Error("AI-output is ongeldig.");
  return parsed;
}

export async function POST(request:Request){
  try{
    const user=await getCurrentUser();
    if(!user) return NextResponse.json({error:"Login vereist."},{status:401});
    const body=await request.json();
    const requestedRepo=typeof body?.repo==="string"?body.repo.trim():"";
    const requestedPath=typeof body?.path==="string"?body.path.trim():"";
    let issue=typeof body?.issue==="string"?body.issue.trim():"";
    const issueId=typeof body?.issue_id==="string"?body.issue_id.trim():"";
    let context=typeof body?.context==="string"?body.context:"";
    const scanId=typeof body?.scan_id==="string"?body.scan_id.trim():"";
    const baseBranch=typeof body?.baseBranch==="string"&&/^[A-Za-z0-9._/-]{1,120}$/.test(body.baseBranch)?body.baseBranch:"main";
    if((requestedRepo&&!safeRepo(requestedRepo))||(requestedPath&&!safeFixTarget(requestedPath))||!issueId||!scanId) return NextResponse.json({error:"Ongeldige fixgegevens: scan_id en issue_id zijn verplicht."},{status:400});
    const fixPolicy=getFixPolicy(issueId);
    if(fixPolicy.category==="C"||!fixPolicy.safe_type){
      return NextResponse.json({error:"Deze bevinding is niet toegestaan voor een automatische GitHub-codefix. RankFix vereist hier handmatige controle.",issue_id:issueId,fix_category:fixPolicy.category},{status:422});
    }
    await ensureDatabase();
    const trustedScan=await getDb().query("SELECT final_url,result FROM scans WHERE id=$1 AND user_id=$2 LIMIT 1",[scanId,user.id]);
    if(!trustedScan.rowCount) return NextResponse.json({error:"Deze scan bestaat niet of hoort niet bij dit account."},{status:404});
    const scanRow=trustedScan.rows[0];
    const scanResult=scanRow.result||{};
    const trustedChecks=[
      ...(Array.isArray(scanResult?.seo?.checks)?scanResult.seo.checks:[]),
      ...(Array.isArray(scanResult?.geo?.checks)?scanResult.geo.checks:[])
    ];
    const trustedCheck=trustedChecks.find((check:any)=>String(check?.issue_id||check?.rule_id||"")===issueId);
    if(!trustedCheck) return NextResponse.json({error:"Deze bevinding kon niet in de opgeslagen scan worden bevestigd."},{status:404});
    issue=String(trustedCheck.title||issueId)+": "+String(trustedCheck.fix||trustedCheck.message||"");
    context=[trustedCheck.message,trustedCheck.fix,trustedCheck?.evidence?.details].filter(Boolean).map(String).join("\n").slice(0,6000);
    const trustedUrl=String(scanRow.final_url||"");

    const connection=await getDb().query("SELECT access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
    if(!connection.rowCount) return NextResponse.json({error:"Verbind eerst GitHub via je dashboard."},{status:409});
    const token=decryptToken(connection.rows[0].access_token_encrypted);
    const scannedHost=normalizeHostname(trustedUrl);
    let effectiveRepo=requestedRepo;
    let effectiveBaseBranch=baseBranch;
    if(!effectiveRepo && scannedHost){
      const saved=await getDb().query(
        "SELECT repository,base_branch FROM website_repositories WHERE user_id=$1 AND website_host=$2 LIMIT 1",
        [user.id,scannedHost]
      );
      if(saved.rowCount){
        effectiveRepo=String(saved.rows[0].repository||"");
        effectiveBaseBranch=String(saved.rows[0].base_branch||baseBranch);
      }
    }
    const verifiedRepo=await chooseRepository(token,effectiveRepo);
    const repo=verifiedRepo.fullName;
    effectiveBaseBranch=verifiedRepo.defaultBranch;
    if(scannedHost){
      const existingMapping=await getDb().query(
        "SELECT repository, base_branch FROM website_repositories WHERE user_id=$1 AND website_host=$2",
        [user.id,scannedHost]
      );
      if(existingMapping.rowCount && String(existingMapping.rows[0].repository).toLowerCase()!==repo.toLowerCase()){
        return NextResponse.json({error:"Deze website is al aan een andere GitHub-repository gekoppeld. Wijzig eerst bewust de websitekoppeling voordat RankFix code aanpast.",website:scannedHost,repository:existingMapping.rows[0].repository},{status:409});
      }
      await getDb().query(
        "INSERT INTO website_repositories (user_id,website_host,repository,base_branch,verified_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (user_id,website_host) DO UPDATE SET base_branch=EXCLUDED.base_branch,verified_at=NOW(),updated_at=NOW()",
        [user.id,scannedHost,repo,effectiveBaseBranch]
      );
    }
    const path=await chooseFile(token,repo,effectiveBaseBranch,requestedPath,issue);
    const file=await githubFetch<any>(token,"/repos/"+repo+"/contents/"+path+"?ref="+encodeURIComponent(effectiveBaseBranch));
    if(file.type!=="file"||typeof file.content!=="string") return NextResponse.json({error:"Dit bestand kan niet worden bewerkt."},{status:400});
    const current=Buffer.from(file.content.replace(/\n/g,""),"base64").toString("utf8");
    if(current.length>120000) return NextResponse.json({error:"Bestand is te groot voor een veilige AI-codefix."},{status:413});
    const deterministicOgFix=buildDeterministicOgFix(path,current,issue,context);
    const generated=deterministicOgFix || await generateCodeFix(path,current,issue,context);
    if(generated.content.length>180000) return NextResponse.json({error:"AI-output is te groot voor een veilige wijziging."},{status:422});
    if(!generated.content.trim() || /(?:\[YOUR_[^\]]*\]|\bTODO\b|CHANGE_ME|REPLACE_ME|INSERT_[A-Z_]+)/i.test(generated.content)) return NextResponse.json({error:"AI-output bevat lege inhoud of placeholders."},{status:422});
    // GitHub fixes contain a complete source file, not a single SEO field.
    // The SEO value validator is intentionally not applied to the whole file,
    // because it can mistake unrelated source-code text for placeholders/field markup.
    const githubValidation=validateGithubFix({current,proposed:generated.content,filePath:path,issue});
    const canonicalErrors=validateCanonicalTarget(generated.content,trustedUrl);
    if(canonicalErrors.length) githubValidation.errors.push(...canonicalErrors);

    const completion=validateRequestedFixCompletion(current,generated.content,issue);
    if(completion.errors.length) githubValidation.errors.push(...completion.errors);
    if(!githubValidation.valid) return NextResponse.json({error:"AI-codefix is geblokkeerd door de GitHub veiligheidscontrole.",validation:githubValidation},{status:422});

    if(completion.currentAlreadySatisfied){
      return NextResponse.json({success:true,alreadyApplied:true,status:"already_ok",summary:"Deze verbetering is al aanwezig. RankFix hoefde niets aan te passen.",repository:repo,path});
    }

    const normalizeFile=(value:string)=>value.replace(/\r\n/g,"\n").replace(/[ \t]+$/gm,"").trim();
    if(normalizeFile(current)===normalizeFile(generated.content)){
      return NextResponse.json({success:false,status:"fix_not_applied",error:"RankFix kon de gevraagde verbetering niet aantoonbaar in het bestand plaatsen. Er is niets gewijzigd.",repository:repo,path},{status:422});
    }

    const branch="rankfix/"+Date.now()+"-"+slug(issue);
    const baseRef=await githubFetch<any>(token,"/repos/"+repo+"/git/ref/heads/"+encodeURIComponent(effectiveBaseBranch));
    await githubFetch<any>(token,"/repos/"+repo+"/git/refs",{method:"POST",body:JSON.stringify({ref:"refs/heads/"+branch,sha:baseRef.object.sha})});
    await githubFetch<any>(token,"/repos/"+repo+"/contents/"+path,{
      method:"PUT",
      body:JSON.stringify({message:"fix: RankFix "+slug(issue),content:Buffer.from(generated.content,"utf8").toString("base64"),branch,sha:file.sha})
    });
    const pr=await githubFetch<any>(token,"/repos/"+repo+"/pulls",{
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

    return NextResponse.json({success:true,summary:generated.summary,repository:repo,path,branch,pr:{number:pr.number,url:pr.html_url,title:pr.title}});
  }catch(error){ return NextResponse.json({error:error instanceof Error?error.message:"GitHub fix mislukt."},{status:500}); }
}
