// F3 (7 Nov 2026): ONE incident attribution for scanner, JSON, report, dashboard
// and TestLab. Dependency-free so the portable TestLab scripts can run it as-is.
// lib/scan-incident.ts re-exports attributeIncident from here.

const SESSION = /^(SESSION_EXPIRED|AUTH_REQUIRED_RANKFIX)$/;
const QUOTA = /WEBSITE_LIMIT|SCAN_LIMIT|QUOTA_EXCEEDED|PLAN_LIMIT|SCAN_RATE_LIMIT$/;
const INFRA = /DATABASE|INFRASTRUCTURE|AUTH_LOOKUP_UNAVAILABLE|HISTORY_SAVE|^SCAN_TIMEOUT$/;
const INPUT = /^(INVALID_URL|UNSAFE_URL|SHARE_LINK_UNRESOLVED|SCAN_URL_DECODE_ERROR)$/;
const SITE = /^(HTTP_BLOCKED|HTTP_AUTH_REQUIRED|CHALLENGE_OR_INTERSTITIAL|SITE_RATE_LIMITED|HTTP_NOT_FOUND|HTTP_PAYMENT_REQUIRED|SITE_TLS_INVALID|SITE_DOMAIN_NOT_FOUND|HTTP_SERVER_ERROR|SITE_ERROR_PAGE|EMPTY_HTML|NOT_HTML|PARKED_DOMAIN|UNVERIFIED_NOT_FOUND)$/;
const NETWORK = /^(FETCH_[A-Z_]+|BODY_TIMEOUT|REDIRECT_LOOP|REDIRECT_LIMIT|RESPONSE_TOO_LARGE)$/;

/** Who caused an incident, from the API status and the stable reason code only. */
/**
 * @param {number} apiHttpStatus
 * @param {string} reasonCode
 * @returns {"target_site"|"network"|"rankfix_session"|"rankfix_quota"|"rankfix_input"|"rankfix_infrastructure"|"rankfix_engine"}
 */
export function attributeIncident(apiHttpStatus, reasonCode) {
  const code = String(reasonCode || "");
  // The website's own 429 is a site limit, never a RankFix quota.
  if (code === "SITE_RATE_LIMITED") return "target_site";
  if (SESSION.test(code)) return "rankfix_session";
  if (INFRA.test(code)) return "rankfix_infrastructure";
  if (QUOTA.test(code)) return "rankfix_quota";
  if (INPUT.test(code)) return "rankfix_input";
  if (SITE.test(code)) return "target_site";
  if (NETWORK.test(code)) return "network";
  if (apiHttpStatus === 401) return "rankfix_session";
  if (apiHttpStatus === 402 || apiHttpStatus === 429) return "rankfix_quota";
  if (apiHttpStatus === 400) return "rankfix_input";
  if (apiHttpStatus === 503) return "rankfix_infrastructure";
  return "rankfix_engine";
}

