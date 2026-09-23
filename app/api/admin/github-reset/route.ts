import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const TARGET_EMAIL = "mdscoop7@gmail.com";

export async function POST() {
  const user = await getCurrentUser();

  if (!user || user.email.toLowerCase() !== TARGET_EMAIL) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
  }

  await getDb().query(
    "DELETE FROM github_connections WHERE user_id=$1",
    [user.id]
  );

  return NextResponse.json({
    success: true,
    message: "GitHub-verbinding verwijderd. Verbind GitHub opnieuw."
  });
}
