// The ONE definition of "this server runs in secure local QA mode" (shared by
// access control in lib/local-qa.ts and by /api/scan/version). Development
// server, not on Vercel, and a 64-hex QA token supplied at start.
export function localQaEnabled() {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL && /^[a-f0-9]{64}$/i.test(process.env.RF_LOCAL_QA_TOKEN || "");
}
