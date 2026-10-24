import {notFound} from "next/navigation";
import TestLab144 from "@/components/qa-testlab";
import "../dashboard.css";
import "./testlab.css";

// Deliberately not present on production. The catalog API separately checks
// the authenticated internal-tester UUID before returning any test targets.
export default function TestLabPage() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  return <TestLab144 />;
}
