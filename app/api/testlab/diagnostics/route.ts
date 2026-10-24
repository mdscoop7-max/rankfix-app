import {NextResponse} from "next/server";
import {scanRuntime} from "@/lib/scan-runtime";
// QA-only, no secrets or account IDs disclosed.
export async function GET() {
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"QA_ONLY"},{status:404});
 return NextResponse.json({
  commit:scanRuntime().commitSha,environment:process.env.VERCEL_ENV,
  workflowSystemIdAvailable:Boolean(process.env.VERCEL_DEPLOYMENT_ID),
  internalTesterConfigured:Boolean(process.env.RANKFIX_INTERNAL_TEST_USER_ID),
  databaseConfigured:Boolean(process.env.DATABASE_URL),
  secretConfigured:Boolean(process.env.SESSION_SECRET)
 },{headers:{"Cache-Control":"no-store"}});
}