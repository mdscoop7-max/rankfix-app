/**
 * JSON for PostgreSQL jsonb columns.
 *
 * Scan reports contain text cut with fixed-length slices. A slice can split an
 * emoji (a UTF-16 surrogate pair) and leave a lone surrogate; JSON.stringify
 * then emits "\ud83c", which PostgreSQL rejects for jsonb ("invalid input
 * syntax for type json"). A NUL character is rejected as well ("unsupported
 * Unicode escape sequence"). Either one turned a completed scan into
 * SCAN_HISTORY_SAVE_FAILED (QA #186, 23 Oct 2026: a retail homepage with
 * emoji promotions). Strings are made well-formed (lone surrogates become
 * U+FFFD) and NUL is removed; everything else is unchanged.
 */
export function jsonbSafeString(value: string): string {
  const wellFormed = typeof value.toWellFormed === "function" ? value.toWellFormed() : value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
  return wellFormed.includes("\u0000") ? wellFormed.replace(/\u0000/g, "") : wellFormed;
}

export function jsonbStringify(value: unknown): string {
  return JSON.stringify(value, function replacer(this: unknown, _key: string, item: unknown) {
    if (typeof item === "string") return jsonbSafeString(item);
    if (item && typeof item === "object" && !Array.isArray(item) && Object.getPrototypeOf(item) === Object.prototype) {
      // Keys can carry the same characters (e.g. headings used as map keys).
      let dirty = false;
      for (const key of Object.keys(item)) if (jsonbSafeString(key) !== key) { dirty = true; break; }
      if (dirty) return Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([k, v]) => [jsonbSafeString(k), v]));
    }
    return item;
  });
}
