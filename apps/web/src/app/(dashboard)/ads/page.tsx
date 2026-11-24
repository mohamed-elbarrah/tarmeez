import { redirect } from "next/navigation";
import { MarketingOverview } from "@/components/features/ads/preview/MarketingOverview";

export const metadata = { title: "Marketing Overview — Tarmeez" };

export default async function AdsRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; days?: string }>;
}) {
  const { accountId, days } = await searchParams;
  if (typeof accountId === "string" && accountId)
    redirect(`/ads/meta/live?accountId=${encodeURIComponent(accountId)}`);
  return <MarketingOverview days={days === "7" ? 7 : 30} />;
}
