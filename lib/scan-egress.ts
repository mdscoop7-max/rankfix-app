export const SCAN_EGRESS_ERROR = "SCAN_INFRASTRUCTURE_EGRESS";

// This reserved transport address identifies the scan environment's tunnel.
// A generic Envoy 503, an upstream error alone, or a website challenge does not.
export function isScanEgressFailure(status: number, body: string): boolean {
  return status === 503
    && body.trimStart().startsWith("upstream connect error or disconnect/reset before headers.")
    && /remote address:\s*envoy:\/\/cloudflare_https_tunnel\//.test(body);
}

/** Inspect only a bounded copy; preserve ordinary website responses verbatim. */
export async function assertScanEgressAvailable(response: Response): Promise<void> {
  if (response.status !== 503 || !/text\/plain/i.test(response.headers.get("content-type") || "")) return;
  const copy = response.clone();
  const reader = copy.body?.getReader();
  if (!reader) return;
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("EGRESS_PROBE_TIMEOUT")), 1000); });
  try {
    while (total < 1024) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      const take = value.subarray(0, 1024 - total);
      chunks.push(take); total += take.byteLength;
    }
  } catch {
    // An unreadable/slow body is not evidence of this specific infrastructure fault.
    return;
  } finally {
    clearTimeout(timer);
    // Do not await cancellation of a tee branch: the original body still belongs
    // to the caller, and awaiting it here would wait for that caller to consume it.
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = new TextDecoder().decode(bytes);
  if (isScanEgressFailure(response.status, body)) {
    void response.body?.cancel().catch(() => {});
    throw new Error(SCAN_EGRESS_ERROR);
  }
  // A gateway says it could not obtain origin headers. Keep the observed 503,
  // but do not attribute it to either the target or RankFix without evidence.
  if (body.trimStart().startsWith("upstream connect error or disconnect/reset before headers.")) {
    void response.body?.cancel().catch(() => {});
    throw new Error("UPSTREAM_RESPONSE_UNCONFIRMED", { cause: { observedHttpStatus: response.status } });
  }
}
