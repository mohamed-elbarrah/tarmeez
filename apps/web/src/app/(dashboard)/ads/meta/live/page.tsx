import { Suspense } from "react";
import { AdsPage } from "@/components/features/ads/AdsPage";
import { QuerySkeleton } from "@/components/common/QueryState";

export const metadata = { title: "Live Meta Campaigns — Tarmeez" };

export default function LiveMetaCampaignsPage() {
  return (
    <Suspense fallback={<QuerySkeleton rows={5} />}>
      <AdsPage />
    </Suspense>
  );
}
