export type GithubFixValidation = { valid: boolean; errors: string[]; warnings: string[] };

function extractMetadataIdentity(value: string): { title?: string; description?: string; openGraphTitle?: string; openGraphDescription?: string } {
  const title = value.match(/(?:^|[,{\\n]\\s*)title\\s*:\\s*["']([^"']{1,200})["']/i)?.[1];
  const description = value.match(/(?:^|[,{\\n]\\s*)description\\s*:\\s*["']([^"']{1,300})["']/i)?.[1];
  const openGraphBlock = value.match(/openGraph\\s*:\\s*\\{([\\s\\S]*?)\\}/i)?.[1] || "";
  const openGraphTitle = openGraphBlock.match(/title\\s*:\\s*["']([^"']{1,200})["']/i)?.[1];
  const openGraphDescription = openGraphBlock.match(/description\\s*:\\s*["']([^"']{1,300})["']/i)?.[1];
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

  if (!allowsRebrand && before.title && after.openGraphTitle && before.title !== after.openGraphTitle) {
    errors.push("De AI-fix zet een andere merk-/paginatitel in Open Graph-metadata.");
  }
  if (!allowsRebrand && before.description && after.openGraphDescription && before.description !== after.openGraphDescription) {
    errors.push("De AI-fix zet een andere beschrijving in Open Graph-metadata.");
  }

  if (/openGraph\s*:\s*\{|og:image|images\s*:\s*\[/i.test(input.proposed)) {
    warnings.push("Open Graph-afbeelding gevonden; controleer dat het bestand in de repository bestaat.");
  }

  if (!input.filePath.match(/\.(tsx|ts|jsx|js|html|vue|php)$/i)) {
    warnings.push("Het doelbestand is geen standaard web-templatebestand.");
  }

  if (input.proposed.length > input.current.length * 3 + 5000) {
    errors.push("De AI-fix is buiten verhouding groot ten opzichte van het bestaande bestand.");
  }

  return { valid: errors.length === 0, errors, warnings };
}
