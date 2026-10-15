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
}): boolean {
  const thinClientShell = input.visibleWords < 80 && input.scriptCount >= 4;
  return thinClientShell || (input.frameworkSignal && input.visibleWords < 180);
}
