import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
const firstFile = (base) => candidates(base).find((file) => existsSync(file) && statSync(file).isFile());

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base && !path.extname(base)) {
    const file = firstFile(base);
    if (file) return nextResolve(pathToFileURL(file).href, context);
  } else if (base && specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(base).href, context);
  }
  return nextResolve(specifier, context);
}
