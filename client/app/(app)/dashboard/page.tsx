import type { Metadata } from "next";
import { DashboardView } from "@/features/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard · Chronicle" };

// A synchronous server page: the shell prerenders and the numbers load in the browser,
// because they depend on who is signed in.
export default function DashboardPage() {
  return <DashboardView />;
}
