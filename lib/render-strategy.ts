// A scan can need the same browser evidence at several quality gates.
// Cache the in-flight promise (including failures) to prevent repeated browser
// launches, inconsistent HTML, and extra load on the scanned website.
export function renderOnce<T>(work: () => Promise<T>): () => Promise<T> {
  let attempt: Promise<T> | undefined;
  return () => {
    if (!attempt) attempt = Promise.resolve().then(work);
    return attempt;
  };
}

// Framework markers in already substantive server-side HTML are not by
// themselves a reason to launch Chromium for every representative page.
export function representativeNeedsJavaScriptRendering(input: {
  visibleWords: number;
  scriptCount: number;
  frameworkSignal: boolean;
  dynamicEvidenceRelevant?: boolean;
}): boolean {
  const thinClientShell = input.visibleWords < 80 && input.scriptCount >= 4;
  // Nuxt/Next/Vue/Angular/React pages are rendered even with rich SSR:
  // hydration may add canonical, metadata, labels, prices or structured data.
  return input.frameworkSignal || thinClientShell;
}

// Retry a transient browser timeout once, centrally and within a bounded
// second attempt. Never retry SSRF blocks, WAF/CAPTCHA or missing Chromium.
export async function renderWithRetry<T>(render: (timeoutMs: number)=>Promise<T>,
  firstTimeoutMs = 12000, retryTimeoutMs = 7000): Promise<T> {
  try { return await render(firstTimeoutMs); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/RENDER_TIMEOUT|Navigation timeout|Target closed|net::ERR_CONNECTION_RESET|net::ERR_CONNECTION_CLOSED/i.test(message)
      || /URL_|DNS|CHROME_NOT_INSTALLED|RENDER_BUSY|BLOCKED/i.test(message)) throw error;
    return render(retryTimeoutMs);
  }
}
