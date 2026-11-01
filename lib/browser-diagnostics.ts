/** Bounded browser evidence, independent of SEO/GEO scoring. No host allow/deny lists. */
export type BrowserFailureCategory = "scanner_blocked" | "blocked" | "cancelled" | "network_error" | "timeout" | "unknown";
export type BrowserAbortCause = "resource_filtered" | "request_cap" | "public_url_guard" | "interception_error";
export type BrowserRequestFailure = {
  url: string; resourceType: string; errorCode: string | null; errorText: string | null;
  category: BrowserFailureCategory; cause: string; interceptionError: string | null; sameSite: boolean | null;
  /** ERR_BLOCKED_BY_CLIENT alone does not establish that the request was tracking. */
  tracking: "unconfirmed";
};
export type BrowserUrlComparison = {
  sameSite: boolean; comparableDocument: boolean; wwwChanged: boolean;
  protocolChanged: boolean; pathChanged: boolean; queryChanged: boolean;
};
export function compareBrowserUrls(requested: string, final: string): BrowserUrlComparison {
  const a = new URL(requested), b = new URL(final);
  const host = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");
  const sameSite = host(a) === host(b);
  const pathChanged = a.pathname !== b.pathname;
  const queryChanged = a.search !== b.search;
  return { sameSite, comparableDocument: sameSite && a.port === b.port && !pathChanged && !queryChanged,
    wwwChanged: sameSite && a.hostname !== b.hostname, protocolChanged: a.protocol !== b.protocol, pathChanged, queryChanged };
}
export function browserRequestFailure(input: { url: string; resourceType: string; errorText?: string | null; abortCause?: BrowserAbortCause; interceptionError?: string }, requestedUrl: string): BrowserRequestFailure {
  const errorText = input.errorText?.slice(0, 300) || null;
  const errorCode = errorText?.match(/\b(?:net::)?(ERR_[A-Z0-9_]+)\b/)?.[1] || null;
  let category: BrowserFailureCategory = "unknown", cause = "browser_cause_unavailable";
  if (input.abortCause) { category = "scanner_blocked"; cause = input.abortCause; }
  else if (errorCode && /TIMED_OUT|TIMEOUT/.test(errorCode)) { category = "timeout"; cause = "browser_timeout"; }
  else if (errorCode === "ERR_ABORTED") { category = "cancelled"; cause = "browser_cancelled"; }
  else if (errorCode?.startsWith("ERR_BLOCKED_")) { category = "blocked"; cause = errorCode === "ERR_BLOCKED_BY_CLIENT" ? "client_blocked_tracking_unconfirmed" : "browser_blocked"; }
  else if (errorCode && /^ERR_(?:NAME_|DNS_|CONNECTION_|INTERNET_|NETWORK_|PROXY_|TUNNEL_|SSL_|CERT_|ADDRESS_|EMPTY_RESPONSE|CONTENT_LENGTH_MISMATCH|HTTP2_|QUIC_)/.test(errorCode)) { category = "network_error"; cause = "browser_network_error"; }
  let sameSite: boolean | null = null;
  try { sameSite = compareBrowserUrls(requestedUrl, input.url).sameSite; } catch { /* e.g. a blocked non-HTTP URL */ }
  return { url: input.url.slice(0, 2000), resourceType: input.resourceType, errorCode, errorText, category, cause, interceptionError: input.interceptionError?.slice(0, 300) || null, sameSite, tracking: "unconfirmed" };
}
export type BrowserDiagnostics = {
  requestedUrl: string; finalUrl: string; urlComparison: BrowserUrlComparison;
  redirects: { from: string; to: string; status: number }[]; redirectsTruncated: number;
  requestFailures: BrowserRequestFailure[]; failuresTruncated: number;
  failureCounts: Record<BrowserFailureCategory, number>; filteredRequests: number;
  navigationError: { name: string; message: string; category: "timeout" | "other" } | null;
};
export function createBrowserDiagnostics(requestedUrl: string) {
  const requestFailures: BrowserRequestFailure[] = [], redirects: BrowserDiagnostics["redirects"] = [];
  const failureCounts: BrowserDiagnostics["failureCounts"] = { scanner_blocked: 0, blocked: 0, cancelled: 0, network_error: 0, timeout: 0, unknown: 0 };
  let failuresTruncated = 0, redirectsTruncated = 0, filteredRequests = 0;
  return {
    filtered() { filteredRequests++; },
    failed(input: Parameters<typeof browserRequestFailure>[0]) {
      const failure = browserRequestFailure(input, requestedUrl);
      failureCounts[failure.category]++;
      if (requestFailures.length < 50) requestFailures.push(failure); else failuresTruncated++;
    },
    redirected(from: string, to: string, status: number) {
      if (redirects.length < 20) redirects.push({ from: from.slice(0, 2000), to: to.slice(0, 2000), status }); else redirectsTruncated++;
    },
    snapshot(finalUrl: string, navigationError: BrowserDiagnostics["navigationError"] = null): BrowserDiagnostics {
      return { requestedUrl, finalUrl, urlComparison: compareBrowserUrls(requestedUrl, finalUrl), redirects: [...redirects], redirectsTruncated,
        requestFailures: [...requestFailures], failuresTruncated, failureCounts: { ...failureCounts }, filteredRequests, navigationError };
    },
  };
}
