/**
 * Shared report exports are public-facing: URLs in representative page samples
 * can contain OAuth state, buyer flags, tokens or signed redirect parameters.
 * Keep full scan records untouched for audit provenance, but strip query and
 * fragment from every report URL before rendering, printing, copying or sharing.
 */
export function publicReportUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return value;
    return parsed.origin + parsed.pathname;
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

export function redactReportText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"'\x60]+/gi, match => {
    const trailing = match.match(/[),.;!]+$/)?.[0] ?? "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return publicReportUrl(url) + trailing;
  });
}
