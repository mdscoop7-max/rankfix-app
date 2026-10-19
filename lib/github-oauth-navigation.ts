export function githubReturnPath(value: string | null | undefined) {
  if (!value || value.length > 2000 || !/^\/dashboard(?:[/?]|$)/.test(value) || /[\\\r\n]/.test(value)) return "/dashboard/github";
  try { const parsed = new URL(value, "https://rankfix.invalid"); return parsed.origin === "https://rankfix.invalid" && /^\/dashboard(?:[/?]|$)/.test(parsed.pathname) ? parsed.pathname + parsed.search + parsed.hash : "/dashboard/github"; }
  catch { return "/dashboard/github"; }
}

export function githubReturnStatus(path: string, status: string) {
  const target = new URL(githubReturnPath(path), "https://rankfix.invalid");
  target.searchParams.set("github", status);
  return target.pathname + target.search + target.hash;
}

export function githubOAuthConfiguration(origin: string, env: Record<string, string | undefined>) {
  if (!env.GITHUB_CLIENT_ID?.trim() || !env.GITHUB_CLIENT_SECRET?.trim()) return { ready: false, reason: "not_configured" };
  try {
    const callback = new URL(env.GITHUB_CALLBACK_URL || origin + "/api/github/callback");
    if (callback.origin !== origin || callback.pathname !== "/api/github/callback") return { ready: false, reason: "callback_mismatch" };
  } catch { return { ready: false, reason: "not_configured" }; }
  return { ready: true, reason: null };
}
