import { NextResponse } from "next/server";
import { scanRuntime } from "@/lib/scan-runtime";

export async function GET() {
  return NextResponse.json(scanRuntime(), {headers:{"Cache-Control":"no-store"}});
}
