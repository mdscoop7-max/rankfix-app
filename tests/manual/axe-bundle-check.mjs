// After `next build`: axe-core must NOT be bundled into the server output,
// otherwise axe.source is minified wrapper code and fails in the browser
// with "t is not defined" (QA 144). Run: node tests/manual/axe-bundle-check.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../../.next/server", import.meta.url).pathname;
const hits = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(name) && st.size > 50_000) { const t = readFileSync(p, "utf8"); if (/axe\.source|u\.source="\("\+r\.toString\(\)/.test(t) || /node_modules_axe-core/.test(name)) hits.push(p); } } };
walk(root);
if (hits.length) { console.error("axe-core is bundled in:", hits); process.exit(1); }
console.log("AXE_NOT_BUNDLED_OK");
