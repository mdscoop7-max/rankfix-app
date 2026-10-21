/**
 * Evidence-first classification for a discovered HTML anchor.
 *
 * Literal client-template expressions are not actionable destination URLs
 * before client rendering has resolved them. Requesting an artificial URL
 * (and obtaining 404) does not prove that a visitor sees a broken link.
 *
 * Keep this generic and conservative: valid currency, query strings and
 * ordinary '$' paths are not suppressed. If a rendered DOM still exposes a
 * broken expression, callers can report it as its own markup defect.
 */
export type LinkHrefClassification = "url" | "template_unresolved";

export function classifyDiscoveredLinkHref(value: string): LinkHrefClassification {
  const href = String(value || "").trim();
  if (!href) return "url";
  // Match URL-encoded template braces and dollar signs too.
  let decoded = href;
  try { decoded = decodeURIComponent(href); } catch {}
  if (/\$\{[^{}]+\}|\{\{[^{}]+\}\}|<%[\s\S]+?%>/u.test(decoded)) return "template_unresolved";
  // Relative href populated by a runtime framework expression, including
  // $parent.collectionUrl and /$scope.route.path, never $5-specials.
  if (/(?:^|\/)\$[a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)+(?:$|[/?#])/u.test(decoded)) return "template_unresolved";
  return "url";
}

export function classifyLinkAuditInputs<T extends { sourceHref: string }>(anchors: readonly T[]) {
  const actionable: T[] = [];
  const unresolvedTemplates: T[] = [];
  for (const item of anchors) {
    (classifyDiscoveredLinkHref(item.sourceHref) === "template_unresolved" ? unresolvedTemplates : actionable).push(item);
  }
  return { actionable, unresolvedTemplates };
}
