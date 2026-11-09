"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Boxes, RefreshCw, ShoppingBag, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetConnectionsQuery, useGetSyncRunsQuery, useStartSyncMutation } from "@/services/connectionsApi";
import { useGetMerchantProfileQuery } from "@/services/merchantApi";
import { getApiErrorMessage } from "@/lib/api-error";
import type { SyncResource } from "@/types/merchant.types";

const resourceLinks: { key: string; label: string; href: string; icon: typeof Boxes }[] = [
  { key: "products", label: "Products", href: "products", icon: Boxes },
  { key: "orders", label: "Orders", href: "orders", icon: ShoppingBag },
  { key: "customers", label: "Customers", href: "customers", icon: Users },
];

export function ConnectionDetailPage() {
  const params = useParams<{ connectionId: string }>();
  const connectionId = params.connectionId;
  const connections = useGetConnectionsQuery();
  const profile = useGetMerchantProfileQuery();
  const runs = useGetSyncRunsQuery(connectionId, { pollingInterval: 5000 });
  const [startSync, syncState] = useStartSyncMutation();
  const connection = connections.data?.find((item) => item.id === connectionId);
  const isOwner = profile.data?.role === "OWNER";

  async function queueSync(resource: SyncResource) {
    try { await startSync({ connectionId, resource }).unwrap(); }
    catch { /* Error shown inline below. */ }
  }

  if (connections.isLoading) return <QuerySkeleton rows={3} />;
  if (connections.isError) return <QueryError title="Couldn’t load this connection" onRetry={() => void connections.refetch()} />;
  if (!connection) return <EmptyState title="Connection not found" description="This store may have been disconnected or is no longer available in your workspace." action={<Button asChild variant="outline" className="rounded-lg"><Link href="/connections">Back to connections</Link></Button>} />;

  return <div className="space-y-8">
    <PageHeader eyebrow="Salla connection" title={connection.storeName ?? "Store details"} description={connection.storeDomain ?? `Store ID ${connection.externalStoreId}`} action={isOwner && connection.status === "CONNECTED" ? <Button className="h-10 rounded-lg" disabled={syncState.isLoading} onClick={() => void queueSync("ALL")}><RefreshCw className={`mr-2 size-4 ${syncState.isLoading ? "animate-spin" : ""}`} />{syncState.isLoading ? "Queueing sync…" : "Sync all data"}</Button> : undefined} />
    <div className="grid gap-4 md:grid-cols-3"><Card><CardContent className="p-5"><p className="text-xs font-medium text-muted-foreground">Connection status</p><div className="mt-3"><StatusBadge status={connection.status} /></div></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs font-medium text-muted-foreground">Connected</p><p className="mt-3 text-sm font-medium">{formatDate(connection.connectedAt)}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs font-medium text-muted-foreground">Last verified</p><p className="mt-3 text-sm font-medium">{connection.verifiedAt ? formatDate(connection.verifiedAt) : "Not available"}</p></CardContent></Card></div>
    {syncState.error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{getApiErrorMessage(syncState.error)}</p>}
    <section className="space-y-4"><div><h2 className="text-base font-semibold">Store data</h2><p className="mt-1 text-sm text-muted-foreground">Browse read-only data imported from this store.</p></div><div className="grid gap-3 md:grid-cols-3">{resourceLinks.map(({ key, label, href, icon: Icon }) => <Link key={key} href={`/${href}?connectionId=${encodeURIComponent(connection.id)}`} className="group flex items-center justify-between rounded-xl border bg-card p-4 transition hover:border-primary/30"><span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-primary/8 text-primary"><Icon className="size-[18px]" /></span><span className="text-sm font-medium">{label}</span></span><span className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">→</span></Link>)}</div></section>
    <section className="space-y-4"><div className="flex items-end justify-between"><div><h2 className="text-base font-semibold">Recent sync activity</h2><p className="mt-1 text-sm text-muted-foreground">Up to 20 recent runs. New runs appear automatically.</p></div>{isOwner && connection.status === "CONNECTED" && <Button variant="outline" size="sm" className="rounded-lg" disabled={syncState.isLoading} onClick={() => void queueSync("ALL")}><RefreshCw className="mr-2 size-3.5" />Run sync</Button>}</div>
      {runs.isLoading ? <QuerySkeleton rows={3} /> : runs.isError ? <QueryError title="Couldn’t load sync activity" onRetry={() => void runs.refetch()} /> : runs.data?.length ? <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Import</TableHead><TableHead>Status</TableHead><TableHead>Records</TableHead><TableHead>Started</TableHead><TableHead className="pr-4 text-right">Run ID</TableHead></TableRow></TableHeader><TableBody>{runs.data.map((run) => <TableRow key={run.id}><TableCell className="min-w-40 pl-4"><p className="font-medium">{run.resource}</p>{run.status === "FAILED" && run.errorMessage && <p className="mt-1 max-w-xs text-xs text-destructive">{run.errorMessage}</p>}</TableCell><TableCell><StatusBadge status={run.status} /></TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground"><span className="tabular-nums">{run.fetchedCount.toLocaleString()}</span> fetched <span className="px-1">·</span> <span className="tabular-nums">{run.upsertedCount.toLocaleString()}</span> saved</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(run.createdAt)}</TableCell><TableCell className="pr-4 text-right"><Badge variant="outline" className="rounded-full font-mono text-[10px]">{run.id.slice(0, 8)}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title="No syncs yet" description="Start the initial import to bring your store’s products, customers, and orders into Tarmeez." action={isOwner && <Button className="rounded-lg" onClick={() => void queueSync("ALL")} disabled={syncState.isLoading}><RefreshCw className="mr-2 size-4" />Start initial sync</Button>} />}
    </section>
  </div>;
}

function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
