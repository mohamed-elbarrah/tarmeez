"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Megaphone, RefreshCw } from "lucide-react";
import { useGetAdAccountsQuery, useGetAdCampaignsQuery, useSyncAdAccountMutation } from "@/services/adsApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getApiErrorMessage } from "@/lib/api-error";

export function AdsPage() {
  const params = useSearchParams();
  const accounts = useGetAdAccountsQuery();
  const selectedId = params.get("accountId") ?? accounts.data?.[0]?.id ?? "";
  const campaigns = useGetAdCampaignsQuery({ accountId: selectedId, page: 1, perPage: 50 }, { skip: !selectedId });
  const [sync, syncState] = useSyncAdAccountMutation();
  const selected = accounts.data?.find((account) => account.id === selectedId);

  if (accounts.isLoading) return <div className="space-y-6"><PageHeader eyebrow="Advertising" title="Meta Ads" description="Monitor campaigns from your connected Meta ad accounts." /><QuerySkeleton rows={5} /></div>;
  if (accounts.isError) return <div className="space-y-6"><PageHeader eyebrow="Advertising" title="Meta Ads" description="Monitor campaigns from your connected Meta ad accounts." /><QueryError title="Couldn’t load Meta accounts" onRetry={() => void accounts.refetch()} /></div>;
  if (!accounts.data?.length) return <div className="space-y-6"><PageHeader eyebrow="Advertising" title="Meta Ads" description="Monitor campaigns from your connected Meta ad accounts." /><EmptyState title="No Meta accounts connected" description="Connect a Meta ad account from the Connections page before monitoring campaigns." action={<Button asChild className="rounded-lg"><Link href="/connections">Open connections</Link></Button>} /></div>;

  async function refresh() { try { await sync(selectedId).unwrap(); } catch { /* Error is shown beside the action. */ } }
  return <div className="space-y-7"><PageHeader eyebrow="Advertising" title="Meta Ads" description="Monitor campaigns and delivery status across your connected accounts." action={<Button variant="outline" className="min-h-11 rounded-lg" disabled={syncState.isLoading} onClick={() => void refresh()}><RefreshCw className={`mr-2 size-4 ${syncState.isLoading ? "animate-spin" : ""}`} />{syncState.isLoading ? "Queueing…" : "Refresh account"}</Button>} />
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Megaphone className="size-5" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{selected?.name}</p><p className="text-xs text-muted-foreground">{selected?.currency ?? "Currency unavailable"} · {selected?.reportingTimeZone ?? "Time zone unavailable"}</p></div></div><div className="flex flex-wrap gap-2">{accounts.data.map((account) => <Button key={account.id} asChild variant={account.id === selectedId ? "default" : "outline"} size="sm" className="min-h-10 rounded-lg"><Link href={`/ads?accountId=${account.id}`}>{account.name}</Link></Button>)}</div></section>
    {syncState.error && <p role="alert" className="text-sm text-destructive">{getApiErrorMessage(syncState.error)}</p>}
    {campaigns.isLoading ? <QuerySkeleton rows={6} /> : campaigns.isError ? <QueryError title="Couldn’t load campaigns" onRetry={() => void campaigns.refetch()} /> : !campaigns.data?.data.length ? <EmptyState title="No campaign data yet" description="The first Meta import may still be running. Refresh this account after a moment." /> : <div className="overflow-x-auto rounded-xl border bg-card"><Table className="min-w-[880px]"><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Campaign</TableHead><TableHead>Configured</TableHead><TableHead>Effective</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Impressions</TableHead><TableHead className="text-right">Clicks</TableHead><TableHead className="pr-4 text-right"> </TableHead></TableRow></TableHeader><TableBody>{campaigns.data.data.map((campaign) => { const metric = campaign.dailyMetrics[0]; return <TableRow key={campaign.id}><TableCell className="max-w-72 pl-4"><p className="truncate font-medium">{campaign.name}</p><p className="mt-1 text-xs text-muted-foreground">{campaign.objective ?? "Objective unavailable"}</p></TableCell><TableCell><StatusBadge status={campaign.configuredStatus ?? "UNKNOWN"} /></TableCell><TableCell><Badge variant="outline" className="rounded-full">{campaign.effectiveStatus ?? "Unknown"}</Badge></TableCell><TableCell className="text-right">{formatMoney(metric?.spend, metric?.currency ?? selected?.currency)}</TableCell><TableCell className="text-right">{formatCount(metric?.impressions)}</TableCell><TableCell className="text-right">{formatCount(metric?.clicks)}</TableCell><TableCell className="pr-4 text-right"><Button asChild variant="outline" size="sm" className="min-h-10 rounded-lg"><Link href={`/ads/campaigns/${campaign.id}`}>Details <ArrowRight className="ml-1.5 size-3.5" /></Link></Button></TableCell></TableRow>; })}</TableBody></Table></div>}
  </div>;
}

function formatCount(value: string | null | undefined) { return value ? new Intl.NumberFormat().format(Number(value)) : "—"; }
function formatMoney(value: string | null | undefined, currency: string | null | undefined) { if (!value) return "—"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD", maximumFractionDigits: 2 }).format(Number(value)); } catch { return `${value} ${currency ?? ""}`; } }
