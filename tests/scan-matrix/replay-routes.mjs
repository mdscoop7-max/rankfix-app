// Replay fidelity (8 Nov 2026): the replay answers only what was RECORDED.
//  - a recorded page: its recorded status and content;
//  - a recorded failure WITH an HTTP status >= 400 (404, 410, 403, 429, 503 ...):
//    that real status;
//  - a recorded failure WITHOUT a usable status (timeout, partial read, status 200
//    but not audited) and every URL that was never recorded: "not recorded". The
//    fetch then fails like an unanswered request, so RankFix reports "niet
//    bevestigd" instead of an invented 404.
// REPLAY_UNRECORDED=legacy404 restores the old behaviour (everything unknown is
// 404) only to compare against older replay dumps.

export const NOT_RECORDED = "REPLAY_NOT_RECORDED";

/** Route entry for one recorded sample page that was not audited. */
export function failedPageRoute(page) {
  const status = Number(page.httpStatus || 0);
  if (status >= 400) return { status, html: "<html><head><title>Recorded error</title></head><body>Recorded HTTP " + status + "</body></html>" };
  return { notRecorded: true };
}

/** The replay's answer for a URL; throws like an unanswered request when nothing was recorded. */
export function replayResponse(routes, input, mode = process.env.REPLAY_UNRECORDED || "honest") {
  const u = new URL(typeof input === "string" ? input : input.url);
  const hit = routes.get(u.host + u.pathname + u.search) || routes.get(u.host + u.pathname) || routes.get(u.host + u.pathname.replace(/\/$/, "")) || routes.get(u.host + u.pathname + "/");
  if (hit?.location) return new Response(null, { status: hit.status, headers: { location: hit.location } });
  if (hit && !hit.notRecorded) return new Response(hit.html, { status: hit.status, headers: { "content-type": "text/html; charset=utf-8" } });
  if (mode === "legacy404") return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  const error = new TypeError("fetch failed");
  error.cause = { code: NOT_RECORDED, message: `${u.toString()} is not in the recording` };
  throw error;
}
