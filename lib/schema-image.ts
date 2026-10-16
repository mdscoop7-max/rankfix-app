// Product images in JSON-LD come as a URL, an ImageObject ({url|contentUrl}),
// an array of either, or an @id reference to an ImageObject elsewhere in the
// @graph (Yoast/WooCommerce: "image": {"@id": "…#primaryimage"}). A reference
// without a resolvable URL is not proof of an image.

type Node = Record<string, unknown>;

/** Every JSON-LD node with an @id, found anywhere in the parsed documents. */
export function indexJsonLdIds(roots: unknown[]): Map<string, Node> {
  const index = new Map<string, Node>();
  const queue: unknown[] = [...roots];
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const value = queue.shift();
    if (Array.isArray(value)) { queue.push(...value); continue; }
    if (!value || typeof value !== "object") continue;
    const node = value as Node;
    if (typeof node["@id"] === "string" && Object.keys(node).length > 1) index.set(node["@id"] as string, node);
    for (const nested of Object.values(node)) if (nested && typeof nested === "object") queue.push(nested);
  }
  return index;
}

/** The first resolvable image URL, or null. */
export function resolveSchemaImage(value: unknown, index?: Map<string, Node>): string | null {
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (!item || typeof item !== "object") continue;
    let node = item as Node;
    if (typeof node["@id"] === "string" && !node.url && !node.contentUrl && index?.has(node["@id"] as string)) node = index.get(node["@id"] as string)!;
    for (const key of ["url", "contentUrl"]) if (typeof node[key] === "string" && (node[key] as string).trim()) return (node[key] as string).trim();
  }
  return null;
}
