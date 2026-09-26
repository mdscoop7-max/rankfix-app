import { redirect } from "next/navigation";

export default function DashboardScan() {
  // Keep one scan experience and one scan engine: dashboard scan links use
  // the same public SEO + GEO scanner instead of maintaining a second UI.
  redirect("/#scan");
}
