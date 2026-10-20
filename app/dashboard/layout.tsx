import type { Metadata } from "next";
import AiAssistant from "@/components/ai-assistant";
import { DashboardAssistantProvider } from "@/components/dashboard-assistant-context";
import DashboardNavigation from "./navigation";
import { isDatabaseFreeQaPreview } from "@/lib/database-free-qa";
import "./readability.css";

// Private application pages: never indexed, no canonical or hreflang.
export const metadata: Metadata = {
  title: "Dashboard | RankFix AI",
  robots: { index: false, follow: false },
  alternates: { canonical: null, languages: {} },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (isDatabaseFreeQaPreview()) return <div className="rankfix-dashboard">{children}</div>;
  return <DashboardAssistantProvider><div className="rankfix-dashboard"><DashboardNavigation />{children}<AiAssistant dashboard host /></div></DashboardAssistantProvider>;
}
