import {Suspense} from "react";
import {notFound} from "next/navigation";
import QaEvidenceExport from "@/components/qa-evidence-export";

// Local/preview QA only, like the TestLab itself. Read-only evidence export.
export default function TestLabEvidenceExportPage() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  return <Suspense fallback={<p>Export laden…</p>}><QaEvidenceExport /></Suspense>;
}
