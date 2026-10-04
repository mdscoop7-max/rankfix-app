import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

const languages = ["nl", "en", "fr", "es", "it", "de"] as const;
type Language = (typeof languages)[number];

const messages: Record<Language, { login: string; invalid: string }> = {
  nl: { login: "Login vereist.", invalid: "Ongeldige taal." },
  en: { login: "Login required.", invalid: "Invalid language." },
  de: { login: "Anmeldung erforderlich.", invalid: "Ungültige Sprache." },
  fr: { login: "Connexion requise.", invalid: "Langue invalide." },
  it: { login: "Accesso richiesto.", invalid: "Lingua non valida." },
  es: { login: "Inicio de sesión requerido.", invalid: "Idioma no válido." },
};

function requestLanguage(request?: Request): Language {
  if (!request) return "nl";
  const raw = request.headers.get("accept-language")?.toLowerCase() || "";
  return languages.find((language) => raw.startsWith(language) || raw.includes(`,${language}`) || raw.includes(` ${language}`)) || "nl";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: messages[requestLanguage(request)].login }, { status: 401 });
  await ensureDatabase();
  const result = await getDb().query("SELECT language FROM user_preferences WHERE user_id=$1", [user.id]);
  return NextResponse.json({ language: result.rows[0]?.language || "nl" });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: messages[requestLanguage(request)].login }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!languages.includes(body.language)) return NextResponse.json({ error: messages[requestLanguage(request)].invalid }, { status: 400 });
  await ensureDatabase();
  await getDb().query("INSERT INTO user_preferences (user_id, language) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET language=EXCLUDED.language,updated_at=NOW()", [user.id, body.language]);
  return NextResponse.json({ language: body.language });
}
