/** Keep the scan UI responsive when a hosting proxy drops the request.
 * This does not cancel work already started on the server or assert a scan failed.
 * The server normally applies its own shorter, 270-second hard limit.
 */
export async function fetchScanResponse(body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 285_000);
  try {
    return await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("De scan heeft niet op tijd geantwoord. Controleer je scanhistorie voordat je opnieuw start.");
    }
    if (error instanceof TypeError) {
      throw new Error("De verbinding met RankFix is verbroken tijdens de scan. De scan is mogelijk nog bezig. Controleer eerst je scanhistorie.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
