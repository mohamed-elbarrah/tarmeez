import { CampaignDetailPage } from "@/components/features/ads/CampaignDetailPage";

export const metadata = { title: "Campaign — Tarmeez" };

export default async function CampaignRoutePage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <CampaignDetailPage campaignId={campaignId} />;
}
