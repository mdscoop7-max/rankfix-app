import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET() {
  await ensureDatabase();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log eerst in." }, { status: 401 });
  const result = await getDb().query("SELECT id,rating,review_text,company_name,website,status,created_at,updated_at FROM reviews WHERE user_id=$1 LIMIT 1",[user.id]);
  return NextResponse.json({ review: result.rows[0] || null });
}

export async function PUT(request: Request) {
  await ensureDatabase();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log eerst in." }, { status: 401 });
  const body = await request.json();
  const language = typeof body?.language==="string"&&["nl","en","de","fr","it","es"].includes(body.language)?body.language:"nl";
  const tr=(v:Record<string,string>)=>v[language]||v.nl;
  const rating = Number(body?.rating);
  const reviewText = typeof body?.reviewText === "string" ? body.reviewText.trim() : "";
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim().slice(0,120) : "";
  const website = typeof body?.website === "string" ? body.website.trim().slice(0,300) : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error:tr({nl:"Kies 1 tot 5 sterren.",en:"Choose 1 to 5 stars.",de:"Wähle 1 bis 5 Sterne.",fr:"Choisissez de 1 à 5 étoiles.",it:"Scegli da 1 a 5 stelle.",es:"Elige de 1 a 5 estrellas."}) },{status:400});
  if (reviewText.length < 10 || reviewText.length > 1500) return NextResponse.json({ error:tr({nl:"Schrijf een review van 10 tot 1500 tekens.",en:"Write a review of 10 to 1500 characters.",de:"Schreibe eine Bewertung mit 10 bis 1500 Zeichen.",fr:"Rédigez un avis de 10 à 1500 caractères.",it:"Scrivi una recensione da 10 a 1500 caratteri.",es:"Escribe una reseña de 10 a 1500 caracteres."}) },{status:400});
  const result = await getDb().query(`INSERT INTO reviews(user_id,rating,review_text,company_name,website,status) VALUES($1,$2,$3,$4,$5,'PENDING')
    ON CONFLICT(user_id) DO UPDATE SET rating=EXCLUDED.rating,review_text=EXCLUDED.review_text,company_name=EXCLUDED.company_name,website=EXCLUDED.website,status='PENDING',updated_at=NOW()
    RETURNING id,rating,review_text,company_name,website,status,created_at,updated_at`,[user.id,rating,reviewText,companyName||null,website||null]);
  return NextResponse.json({ review:result.rows[0], message:tr({nl:"Bedankt. Je review staat klaar voor controle.",en:"Thank you. Your review is ready for moderation.",de:"Danke. Deine Bewertung wartet auf Prüfung.",fr:"Merci. Votre avis est prêt à être vérifié.",it:"Grazie. La tua recensione è pronta per la verifica.",es:"Gracias. Tu reseña está lista para revisión."}) });
}

export async function DELETE() {
  await ensureDatabase();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error:"Log eerst in." },{status:401});
  await getDb().query("DELETE FROM reviews WHERE user_id=$1",[user.id]);
  return NextResponse.json({ ok:true });
}