import DashboardWorkspace from "./workspace";
import DatabaseFreeQaDashboard from "./database-free-qa";
import { isDatabaseFreeQaPreview } from "@/lib/database-free-qa";

export default function Dashboard() {
  return isDatabaseFreeQaPreview() ? <DatabaseFreeQaDashboard /> : <DashboardWorkspace />;
}
