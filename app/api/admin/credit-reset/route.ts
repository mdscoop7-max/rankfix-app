import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

const TEST_EMAIL = "mdscoop7@gmail.com";
const TEST_CREDITS = 25;

export async function POST() {
  try {
    await ensureDatabase();
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Log eerst in." }, { status: 401 });
    }

    if (String(user.email).toLowerCase() !== TEST_EMAIL) {
      return NextResponse.json({ error: "Niet toegestaan." }, { status: 403 });
    }

    const result = await getDb().query(
      "UPDATE users SET credits=$1 WHERE id=$2 RETURNING credits",
      [TEST_CREDITS, user.id]
    );

    return NextResponse.json({
      success: true,
      credits: result.rows[0]?.credits ?? TEST_CREDITS,
    });
  } catch (error) {
    console.error("Temporary credit reset error:", error);
    return NextResponse.json({ error: "Credits resetten mislukt." }, { status: 500 });
  }
}
