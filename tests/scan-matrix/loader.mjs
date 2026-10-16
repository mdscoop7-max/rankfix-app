// Module hooks for the offline scan matrix: resolve "@/..." aliases and
// extensionless imports, stub DB/auth, skip DNS checks and make the headless
// browser controllable (globalThis.__RF_RENDER) so no network or Chromium is used.
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "../..");
const stubs = { "/lib/db.ts": "stubs-db.mjs", "/lib/db-init.ts": "stubs-dbinit.mjs", "/lib/auth.ts": "stubs-auth.mjs" };
const fileFor = (base) => [base + ".ts", base + ".tsx", base + "/index.ts", base].find((c) => existsSync(c) && /\.\w+$/.test(c));
async function inner(spec, ctx, next) {
  if (spec.startsWith("@/")) { const f = fileFor(ROOT + "/" + spec.slice(2)); if (f) return { url: pathToFileURL(f).href, shortCircuit: true }; }
  if (spec.startsWith(".") && ctx.parentURL?.startsWith("file:")) {
    const base = fileURLToPath(new URL(spec, ctx.parentURL));
    if (!/\.\w+$/.test(base) || !existsSync(base)) { const f = fileFor(base); if (f) return { url: pathToFileURL(f).href, shortCircuit: true }; }
  }
  if (spec === "next/server" || spec === "next/headers") return next(spec + ".js", ctx);
  return next(spec, ctx);
}
export async function resolve(spec, ctx, next) {
  const r = await inner(spec, ctx, next);
  for (const [suffix, file] of Object.entries(stubs)) if (r.url === pathToFileURL(ROOT + suffix).href) return { url: pathToFileURL(resolvePath(HERE, file)).href, shortCircuit: true };
  return r;
}
export async function load(url, ctx, next) {
  if (url === pathToFileURL(ROOT + "/lib/safe-fetch.ts").href) {
    return { format: "module-typescript", source: readFileSync(new URL(url), "utf8").replace("await assertPublicDns(current.hostname);", ""), shortCircuit: true };
  }
  if (url === pathToFileURL(ROOT + "/lib/headless-render.ts").href) {
    const src = readFileSync(new URL(url), "utf8").replace(/export async function renderPublicPage\(([^)]*)\)([^{]*)\{/, "export async function renderPublicPage($1)$2{ if (globalThis.__RF_RENDER) return globalThis.__RF_RENDER(arguments[0]); throw new Error('RENDER_UNAVAILABLE_IN_MATRIX');");
    return { format: "module-typescript", source: src, shortCircuit: true };
  }
  return next(url, ctx);
}
