// TestLab outcome rules shared by the dashboard TestLab and scripts/testlab/run.mjs.
//
// QA 144-site test (24 Oct 2026): a run that stopped on an expired session
// stored that website as "login" and resuming skipped it, so the website was
// never scanned. A RankFix-side stop (session, quota, infrastructure, the
// browser losing its connection to RankFix, a QA redeploy) is NOT a result
// for the website: it is kept as "pending" and processed again on resume.

/** Statuses that describe the WEBSITE (or a finished scan) and end its turn. */
export const FINAL_STATUSES = new Set(["succes", "site_geblokkeerd", "site_onbereikbaar", "netwerk_website", "timeout", "scan_mislukt"]);
/** Statuses caused by RankFix or the runner: the same website must be retried. */
export const RUNNER_STATUSES = new Set(["login", "quota", "infrastructuur", "verbinding_rankfix"]);

/**
 * Status for one scan answer. `incident.attribution` (from the scan API) wins
 * over code/status heuristics, so a website's own 429 is never a RankFix quota
 * and an expired RankFix session is never a website problem.
 * @param {{ok:boolean,status:number,data?:any,clientError?:string|null}} answer
 */
export function classifyScanAnswer(answer) {
  if (answer.clientError) return "verbinding_rankfix";
  const data = answer.data || {};
  if (answer.ok && data.success === true) return "succes";
  const code = String(data.code || data.errorCode || "");
  const attribution = data.incident?.attribution;
  if (attribution === "rankfix_session") return "login";
  if (attribution === "rankfix_quota") return "quota";
  if (attribution === "rankfix_infrastructure") return "infrastructuur";
  if (attribution === "target_site") {
    if (/HTTP_NOT_FOUND|HTTP_SERVER_ERROR|SITE_ERROR_PAGE|EMPTY_HTML|NOT_HTML|PARKED_DOMAIN/.test(code)) return "site_onbereikbaar";
    return "site_geblokkeerd";
  }
  if (attribution === "network") return /TIMEOUT/.test(code) ? "timeout" : "netwerk_website";
  // Older deployments without incident evidence.
  if (/SITE_RATE_LIMITED|HTTP_AUTH_REQUIRED|BLOCKED|CHALLENGE|CAPTCHA|ROBOTS/.test(code)) return "site_geblokkeerd";
  if (/SESSION/.test(code) || answer.status === 401) return "login";
  if (/DATABASE|INFRASTRUCTURE|AUTH_LOOKUP|DB_|SERVER_CONFIG/.test(code)) return "infrastructuur";
  if (/WEBSITE_LIMIT|SCAN_LIMIT|QUOTA|RATE_LIMIT/.test(code) || answer.status === 402 || answer.status === 429) return "quota";
  if (/HTTP_NOT_FOUND|HTTP_SERVER_ERROR|SITE_ERROR_PAGE|NON_CONTENT|PARKED_DOMAIN|EMPTY_HTML/.test(code)) return "site_onbereikbaar";
  if (/TIMEOUT|TIMED_OUT/.test(code)) return "timeout";
  if (/^FETCH_|REDIRECT_LOOP|REDIRECT_LIMIT/.test(code)) return "netwerk_website";
  return "scan_mislukt";
}

/** True when the run must stop (and the same website is retried later). */
export function stopsRun(status) {
  return RUNNER_STATUSES.has(status);
}

/** A stored row ends the website's turn only with a final status. */
export function isFinalResult(row) {
  return Boolean(row) && FINAL_STATUSES.has(row.status);
}

/**
 * Websites still to process, in catalogue order: never tested, or only a
 * runner-side (pending) row. Each host appears once.
 * @template {{host:string}} S
 * @param {S[]} sites
 * @param {Array<{host:string,status:string}>} results
 * @returns {S[]}
 */
export function resumeQueue(sites, results) {
  const byHost = new Map(results.map((row) => [row.host, row]));
  const seen = new Set();
  return sites.filter((site) => {
    if (seen.has(site.host)) return false;
    seen.add(site.host);
    return !isFinalResult(byHost.get(site.host));
  });
}

/** Replace the row for one host (no duplicates) and keep catalogue-independent order stable. */
export function upsertResult(results, row) {
  return [...results.filter((r) => r.host !== row.host), row];
}

/**
 * Runner-side answers become a pending row that documents why the run
 * stopped without judging the website.
 */
export function pendingRow(row) {
  return { ...row, pending: true, finalForWebsite: false };
}
