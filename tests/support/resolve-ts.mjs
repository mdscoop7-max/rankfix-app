// Test-only module resolution that mirrors tsconfig/Next.js behaviour:
// "@/x" maps to the repository root and extensionless relative imports resolve
// to ".ts" files. Production builds use Next.js resolution and never load this.
import { register } from "node:module";

register(new URL("./resolve-ts-hooks.mjs", import.meta.url));
