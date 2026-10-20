export type GithubFixValidation = { valid: boolean; errors: string[]; warnings: string[] };
const ALLOWED_WEB_EXTENSIONS = new Set([".tsx",".ts",".jsx",".js",".html",".htm",".vue",".php"]);
const FORBIDDEN_BASENAMES = new Set([
  "package.json","package-lock.json","pnpm-lock.yaml","yarn.lock","bun.lockb",
  ".env",".env.local",".env.production",".env.development",
  "next.config.js","next.config.mjs","next.config.ts","vite.config.js","vite.config.ts",
  "dockerfile","render.yaml","vercel.json"
]);
const FORBIDDEN_PATH_PARTS = [
  ".github/","node_modules/","migrations/","prisma/","database/","db/","scripts/"
];

function pathPolicyError(filePath:string): string | null {
  const normalized=filePath.replace(/\\/g,"/").toLowerCase();
  const base=normalized.split("/").pop()||"";
  if(FORBIDDEN_BASENAMES.has(base)||FORBIDDEN_PATH_PARTS.some((part)=>normalized.includes(part))){
    return "Het doelbestand is gevoelig voor dependencies, deployment, database of automatisering en mag niet automatisch worden aangepast.";
  }
  const dot=base.lastIndexOf(".");
  const ext=dot>=0?base.slice(dot):"";
  if(!ALLOWED_WEB_EXTENSIONS.has(ext)){
    return "Het doelbestand valt buiten de toegestane webbronbestanden voor automatische RankFix-wijzigingen.";
  }
  return null;
}

function changedLineCount(before:string,after:string){
  const a=before.replace(/\r\n/g,"\n").split("\n");
  const b=after.replace(/\r\n/g,"\n").split("\n");
  const max=Math.max(a.length,b.length);
  let changed=0;
  for(let i=0;i<max;i++) if(a[i]!==b[i]) changed++;
  return changed;
}


function extractMetadataIdentity(value: string): {
  title?: string;
  description?: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
} {
  // HTML and JS/TS metadata: also detect deletion of existing fields.
  const htmlTitle = value.match(/<title\b[^>]*>([^<]*)<\/title\s*>/i)?.[1];
  const htmlDescription = [...value.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => {
    const name = tag.match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1]?.toLowerCase();
    return name === "description" ? tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] : undefined;
  }).find((entry) => entry !== undefined);
  const title = htmlTitle ?? value.match(/(?:^|[,{\n][ \t\r\n]*)title[ \t\r\n]*:[ \t\r\n]*["']([^"']{1,200})["']/i)?.[1];
  const description = htmlDescription ?? value.match(/(?:^|[,{\n][ \t\r\n]*)description[ \t\r\n]*:[ \t\r\n]*["']([^"']{1,300})["']/i)?.[1];
  const openGraphBlock = value.match(/openGraph[ \t\r\n]*:[ \t\r\n]*\{([\s\S]*?)\}/i)?.[1] || "";
  const openGraphTitle = openGraphBlock.match(/title[ \t\r\n]*:[ \t\r\n]*["']([^"']{1,200})["']/i)?.[1];
  const openGraphDescription = openGraphBlock.match(/description[ \t\r\n]*:[ \t\r\n]*["']([^"']{1,300})["']/i)?.[1];
  return { title, description, openGraphTitle, openGraphDescription };
}

export function validateGithubFix(input: {
  current: string;
  proposed: string;
  filePath: string;
  issue: string;
  issueId?: string;
}): GithubFixValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Only a trusted issue ID from the scan can authorize a change. Natural
  // language and AI output must never enlarge the set of allowed fields.
  const rule = String(input.issueId || "").trim().toUpperCase();
  const allowsMetaTitleChange = ["TITLE","META_TITLE_MISSING","META_TITLE_GUIDANCE","SITE_TITLE_MISSING"].includes(rule);
  const allowsMetaDescriptionChange = ["DESCRIPTION","META_DESCRIPTION_MISSING","META_DESCRIPTION_GUIDANCE","SITE_DESCRIPTION_MISSING"].includes(rule);
  const allowsSocialChange = ["SOCIAL","SOCIAL_METADATA_INCOMPLETE"].includes(rule);
  const pathError=pathPolicyError(input.filePath);
  if(pathError) errors.push(pathError);
  const changedLines=changedLineCount(input.current,input.proposed);
  if(changedLines>120){
    errors.push("De voorgestelde wijziging raakt meer dan 120 regels en is te groot voor een automatische SEO/GEO-codefix.");
  }

  if (!input.proposed.trim()) errors.push("De voorgestelde GitHub-wijziging is leeg.");
  if (/\b(?:rm\s+-rf|drop\s+table|delete\s+from|private[_-]?key)\b/i.test(input.proposed)) {
    errors.push("De AI-output bevat mogelijk destructieve of geheime gegevens.");
  }

  const before = extractMetadataIdentity(input.current);
  const after = extractMetadataIdentity(input.proposed);
  // Fail closed on unrelated edits, additions and removals of critical metadata.
  if (!allowsMetaTitleChange && before.title !== after.title &&
      (before.title !== undefined || after.title !== undefined)) {
    errors.push("De AI-fix wijzigt de bestaande site-identiteit in de metadata.");
  }
  if (!allowsMetaDescriptionChange && before.description !== after.description &&
      (before.description !== undefined || after.description !== undefined)) {
    errors.push("De AI-fix wijzigt de bestaande metadata-beschrijving zonder dat dit is gevraagd.");
  }
  if (!allowsSocialChange && before.openGraphTitle !== after.openGraphTitle &&
      (before.openGraphTitle !== undefined || after.openGraphTitle !== undefined)) {
    errors.push("De AI-fix wijzigt de Open Graph-titel buiten het bewezen scanprobleem.");
  }
  if (!allowsSocialChange && before.openGraphDescription !== after.openGraphDescription &&
      (before.openGraphDescription !== undefined || after.openGraphDescription !== undefined)) {
    errors.push("De AI-fix wijzigt de Open Graph-beschrijving buiten het bewezen scanprobleem.");
  }

  if (/openGraph[ \t\r\n]*:[ \t\r\n]*\{|og:image|images[ \t\r\n]*:[ \t\r\n]*\[/i.test(input.proposed)) {
    warnings.push("Open Graph-metadata gevonden; controleer dat waarden en eventuele afbeeldingen bij de bestaande site-identiteit passen.");
  }

  if (!input.filePath.match(/\.(tsx|ts|jsx|js|html|vue|php)$/i)) {
    warnings.push("Het doelbestand is geen standaard web-templatebestand.");
  }

  if (input.proposed.length > input.current.length * 3 + 5000) {
    errors.push("De AI-fix is buiten verhouding groot ten opzichte van het bestaande bestand.");
  }

  return { valid: errors.length === 0, errors, warnings };
}
