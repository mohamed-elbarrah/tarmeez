import type { Metadata } from "next";
import { OverviewPage } from "@/components/features/dashboard/OverviewPage";

export const metadata: Metadata = { title: "Overview | Tarmeez" };

export default function MerchantOverviewRoute() {
  return <OverviewPage />;
}
