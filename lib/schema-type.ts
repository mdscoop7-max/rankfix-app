// A JSON-LD "@type" counts as structured-data evidence only when it is a
// schema.org type name. CMS/component JSON in ld+json script tags
// ("mi-aem-…/components/content/universal-footer") is not schema.org and must
// never pass, fail or steer a structured-data or sector check.
const SCHEMA_ORG_PREFIX = /^(?:https?:\/\/(?:www\.)?schema\.org\/|schema:)/i;
const SCHEMA_TYPE_NAME = /^[A-Za-z][A-Za-z0-9]{1,63}$/;

export function normalizeSchemaType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(SCHEMA_ORG_PREFIX, "");
  return SCHEMA_TYPE_NAME.test(name) ? name : null;
}

/** Normalized schema.org types of one JSON-LD object (string or array "@type"). */
export function schemaTypesOf(value: unknown): string[] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>)["@type"] : undefined;
  return (Array.isArray(raw) ? raw : [raw]).map(normalizeSchemaType).filter((type): type is string => Boolean(type));
}
