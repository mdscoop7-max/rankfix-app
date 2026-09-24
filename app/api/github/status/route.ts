import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db-init";
import { getDb } from "@/lib/db";
import { decryptToken, githubFetch } from "@/lib/github";

export async function GET() {
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({connected:false},{status:401});
  await ensureDatabase();
  const r=await getDb().query("SELECT github_login,scopes,connected_at,access_token_encrypted FROM github_connections WHERE user_id=$1",[user.id]);
  if(!r.rowCount) return NextResponse.json({connected:false});
  try {
    const ghUser=await githubFetch<any>(decryptToken(r.rows[0].access_token_encrypted),"/user");
    return NextResponse.json({connected:true,connection:{github_login:ghUser.login,scopes:r.rows[0].scopes,connected_at:r.rows[0].connected_at}});
  } catch(error) {
    const message=error instanceof Error?error.message:"GitHub-authenticatie mislukt.";
    if(/bad credentials|401|unauthorized/i.test(message)){
      await getDb().query("DELETE FROM github_connections WHERE user_id=$1",[user.id]);
      return NextResponse.json({connected:false,reauthorize:true,error:"De GitHub-token is verlopen of ingetrokken. Verbind GitHub opnieuw."});
    }
    return NextResponse.json({connected:false,error:message},{status:500});
  }
}
