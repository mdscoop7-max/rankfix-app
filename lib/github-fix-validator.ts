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
  const title = value.match(/(?:^|[,{\n][ \t\r\n]*)title[ \t\r\n]*:[ \t\r\n]*["']([^"']{1,200})["']/i)?.[1];
  const description = value.match(/(?:^|[,{\n][ \t\r\n]*)description[ \t\r\n]*:[ \t\r\n]*["']([^"']{1,300})["']/i)?.[1];
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
}): GithubFixValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issueText = input.issue.toLowerCase();
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
  const allowsRebrand = /rebrand|branding|brandnaam|naam wijzigen|site name|website name/i.test(issueText);

  if (!allowsRebrand && before.title && after.title && before.title !== after.title) {
    errors.push("De AI-fix wijzigt de bestaande site-identiteit in de metadata.");
  }
  if (!allowsRebrand && before.description && after.description && before.description !== after.description) {
    errors.push("De AI-fix wijzigt de bestaande metadata-beschrijving zonder dat dit is gevraagd.");
  }
  if (!allowsRebrand && !/og[: -]?title|open graph.*title/i.test(issueText) && before.title && after.openGraphTitle && before.title !== after.openGraphTitle) {
    errors.push("De AI-fix zet een andere merk-/paginatitel in Open Graph-metadata.");
  }
  if (!allowsRebrand && !/og[: -]?description|open graph.*description/i.test(issueText) && before.description && after.openGraphDescription && before.description !== after.openGraphDescription) {
    errors.push("De AI-fix zet een andere beschrijving in Open Graph-metadata.");
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
