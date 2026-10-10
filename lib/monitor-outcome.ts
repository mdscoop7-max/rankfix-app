/**
 * Decides whether a scheduled monitor result is real downtime worth an alert.
 *
 * - OK: never an alert.
 * - SCANNER_BLOCKED (401/403/405/451/WAF, SSRF refusal): only RankFix is affected;
 *   this is never reported as website downtime.
 * - TEMPORARY (429/408/502/503/504, timeouts, resets): only alerts when it persists
 *   for two consecutive checks.
 * - HTTP_ERROR / ERROR (404/410/500, DNS, expired certificate, refused connection):
 *   alerts once when the site changes from healthy to failing.
 */
export type MonitorStatus = "OK" | "HTTP_ERROR" | "ERROR" | "TEMPORARY" | "SCANNER_BLOCKED";

const FAILING = new Set(["HTTP_ERROR", "ERROR"]);

export function decideMonitorOutcome(input: { status: string; previousStatus: string | null; previousConsecutiveFailures: number }) {
  const { status, previousStatus } = input;
  if (status === "OK" || status === "SCANNER_BLOCKED") return { becameUnavailable: false, outage: false };
  const alreadyAlerted = FAILING.has(previousStatus || "") || (previousStatus === "TEMPORARY" && input.previousConsecutiveFailures >= 2);
  if (status === "TEMPORARY") {
    // The counter already includes earlier temporary failures; this check makes it +1.
    const persistent = previousStatus === "TEMPORARY" && input.previousConsecutiveFailures >= 1;
    return { becameUnavailable: persistent && !alreadyAlerted, outage: persistent };
  }
  return { becameUnavailable: !alreadyAlerted, outage: true };
}
