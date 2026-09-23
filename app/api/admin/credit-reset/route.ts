import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const TARGET_EMAIL = "mdscoop7@gmail.com";

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.email.toLowerCase() !== TARGET_EMAIL) {
    return NextResponse.json({ error: "Niet geautoriseerd." }, { status: 403 });
  }

  const result = await getDb().query(
    "UPDATE users SET credits=25 WHERE id=$1 RETURNING id,email,credits",
    [user.id]
  );

  return NextResponse.json({ user: result.rows[0] });
}
