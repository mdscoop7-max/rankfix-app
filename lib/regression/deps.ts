// Production wiring for the regression routes: real database, the real scanner
// route handler (invoked in-process inside the read-only regression context)
// and the single e-mail notifier.
import { getDb } from "@/lib/db";
import { sendRegressionReportEmail } from "@/lib/email";
import { CRAWLER_VERSION, RULES_VERSION } from "@/lib/seo-rules";
import { SCORE_MODEL_VERSION } from "@/lib/audit-score";
import { POST as scanRoute } from "@/app/api/scan/route";
import { runAsRegressionScan } from "./context.ts";
import type { Deps } from "./service.ts";

export function productionDeps(runKey: string, siteIdForScan = "n/a"): Deps {
  return {
    query: (sql, params) => getDb().query(sql, params as unknown[]),
    version: {
      crawler: CRAWLER_VERSION,
      rules: RULES_VERSION,
      scoreModel: SCORE_MODEL_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || null,
    },
    scan: (url) => runAsRegressionScan({ runKey, siteId: siteIdForScan }, async () => {
      // A fresh request without cookies or forwarded headers: the scanner sees
      // no session, and the regression context disables history and usage.
      const request = new Request("http://rankfix.internal/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, mode: "both", language: "nl", dashboard: false }),
      });
      const response = await scanRoute(request);
      let body: unknown = null;
      try { body = await response.json(); } catch {}
      return { httpStatus: response.status, body };
    }),
    notify: async ({ runKey: key, markdown, regressions }) => {
      const to = (process.env.REGRESSION_ALERT_EMAIL || process.env.HEALTH_ALERT_EMAIL || process.env.ADMIN_EMAIL || "").trim();
      if (!to) throw new Error("NO_ALERT_RECIPIENT");
      await sendRegressionReportEmail({ to, runKey: key, markdown, regressions });
    },
  };
}
