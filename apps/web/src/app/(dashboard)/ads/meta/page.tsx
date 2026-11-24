import { MetaCampaignPreview } from "@/components/features/ads/preview/MetaCampaignPreview";

export const metadata = { title: "Meta Campaigns — Tarmeez" };

export default async function MetaCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; campaign?: string; days?: string }>;
}) {
  const { status, campaign, days } = await searchParams;
  return (
    <MetaCampaignPreview
      key={JSON.stringify([status, campaign, days])}
      status={status}
      campaign={campaign}
      days={days === "7" ? 7 : 30}
    />
  );
}
