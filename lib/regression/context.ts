// Marks a scanner call as an internal, read-only regression scan. Only server
// code can enter this context (the secret-protected internal route); no request
// header, cookie or body field can set it. Inside it the scanner never reads a
// session, never writes scan history or usage, and skips the public per-network
// rate limit, which the regression run replaces with its own lease and budget.
import { AsyncLocalStorage } from "node:async_hooks";

type RegressionContext = { runKey: string; siteId: string };

const storage = new AsyncLocalStorage<RegressionContext>();

export function runAsRegressionScan<T>(context: RegressionContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(Object.freeze({ ...context }), fn);
}

export function regressionScanContext(): RegressionContext | null {
  return storage.getStore() || null;
}
