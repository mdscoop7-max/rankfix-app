import {notFound} from "next/navigation";
import TestLab144 from "@/components/qa-testlab";
import "../../dashboard.css";
import "../testlab.css";

// International QA is absent from production and uses authenticated tester API.
export default function InternationalTestLabPage() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") notFound();
  return <TestLab144 variant="international" />;
}
