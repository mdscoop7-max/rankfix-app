/** Parse scan responses safely: proxies may return an empty or HTML body.
 * Do not assume that a completed HTTP exchange contains valid JSON.
 */
export async function readScanJson(response: Response): Promise<any> {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) {
    throw new Error("RankFix heeft geen scanresultaat teruggestuurd. Mogelijk is de verbinding met de server onderbroken. Controleer eerst je scanhistorie voordat je opnieuw scant.");
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("invalid-json-shape");
    }
    return data;
  } catch {
    throw new Error("RankFix heeft een ongeldig of onvolledig scanantwoord ontvangen. Controleer eerst je scanhistorie voordat je opnieuw scant.");
  }
}
