/**
 * Remove invisible paste artifacts at the edges of a website URL.
 * U+2060 (WORD JOINER), for example, is NOT removed by String.trim()
 * and becomes a bogus /%E2%81%A0 path segment during URL parsing.
 *
 * Keep internal characters intact: legitimate internationalized paths may
 * contain format characters and must never be silently rewritten.
 */
export function normalizeScanUrlInput(value: string): string {
  return String(value || "").replace(
    /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/gu,
    "",
  );
}
