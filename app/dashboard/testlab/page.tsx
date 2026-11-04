import {notFound} from "next/navigation";
import TestLab144 from "@/components/qa-testlab";
import "../dashboard.css";
import "./testlab.css";

// Deliberately not present on production. The catalog API separately checks
// the authenticated internal-tester UUID before returning any test targets.
export default async function TestLabPage({searchParams}: {searchParams: Promise<{catalog?: string | string[]}>}) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  const requested = (await searchParams).catalog;
  const catalog = typeof requested === "string" && ["commerce","fresh144","mkb48"].includes(requested) ? requested : "baseline";
  return <TestLab144 key={catalog} requestedCatalog={catalog} />;
}
