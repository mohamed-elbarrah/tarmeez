"use client";

import Link from "next/link";
import { Activity, ArrowRight, Boxes, CircleCheck, PlugZap, ShoppingBag, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useGetConnectionsQuery, useGetSyncRunsQuery } from "@/services/connectionsApi";
import { useGetMerchantProfileQuery } from "@/services/merchantApi";
import type { StoreConnection } from "@/types/merchant.types";

export function OverviewPage() {
  const profile = useGetMerchantProfileQuery();
  const connections = useGetConnectionsQuery();

  return <div className="space-y-8">
    <PageHeader eyebrow="Merchant workspace" title={`Good to see you${profile.data?.user.name ? `, ${profile.data.user.name.split(" ")[0]}` : ""}`} description="Your store connection and data syncs, in one place." action={<Button asChild className="h-10 rounded-lg"><Link href="/connections"><PlugZap className="mr-2 size-4" />{connections.data?.length ? "Manage connections" : "Connect a store"}</Link></Button>} />
    {profile.isLoading ? <QuerySkeleton rows={1} /> : profile.isError ? <QueryError onRetry={() => void profile.refetch()} /> : <div className="grid gap-4 sm:grid-cols-3">
      <SummaryCard icon={Activity} label="Store connections" value={connections.isLoading ? "…" : String(connections.data?.filter((item) => item.status === "CONNECTED").length ?? 0)} detail="Active connections" />
      <SummaryCard icon={CircleCheck} label="Workspace status" value={profile.data?.merchant.status === "ACTIVE" ? "Active" : "Paused"} detail={`You’re a ${profile.data?.role.toLowerCase() ?? "member"}`} />
      <SummaryCard icon={Users} label="Your access" value={profile.data?.role === "OWNER" ? "Owner" : "Viewer"} detail={profile.data?.role === "OWNER" ? "You manage this workspace" : "Read-only workspace access"} />
    </div>}

    {connections.isLoading ? <QuerySkeleton rows={2} /> : connections.isError ? <QueryError title="Couldn’t load your store connections" onRetry={() => void connections.refetch()} /> : connections.data?.length ? <section className="space-y-4"><div className="flex items-end justify-between"><div><h2 className="text-base font-semibold tracking-tight">Connected stores</h2><p className="mt-1 text-sm text-muted-foreground">Connection health and latest import activity.</p></div><Button asChild variant="ghost" size="sm"><Link href="/connections">View all <ArrowRight className="ml-1 size-3.5" /></Link></Button></div><div className="grid gap-4 xl:grid-cols-2">{connections.data.map((connection) => <ConnectionOverviewCard key={connection.id} connection={connection} />)}</div></section> : <EmptyState title="Connect your first store" description="Connect Salla to bring your products, customers, and orders into Tarmeez." action={<Button asChild className="rounded-lg"><Link href="/connections">Explore connections <ArrowRight className="ml-2 size-4" /></Link></Button>} />}

    <section className="grid gap-4 md:grid-cols-2"><NextStepCard icon={Boxes} title="Explore your catalog" description="Browse imported products and their latest synced details." href="/products" /><NextStepCard icon={ShoppingBag} title="Review orders" description="See imported orders and line items from your connected store." href="/orders" /></section>
  </div>;
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <Card className="gap-3 py-5"><CardContent className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="grid size-9 place-items-center rounded-lg bg-primary/8 text-primary"><Icon className="size-[18px]" /></span></CardContent></Card>;
}

function ConnectionOverviewCard({ connection }: { connection: StoreConnection }) {
  const runs = useGetSyncRunsQuery(connection.id);
  const latest = runs.data?.[0];
  return <Link href={`/connections/${connection.id}`} className="group rounded-xl border bg-card p-5 transition hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{connection.storeName ?? "Salla store"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{connection.storeDomain ?? connection.externalStoreId}</p></div><StatusBadge status={connection.status} /></div>
    <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground"><span>{runs.isLoading ? "Checking sync…" : runs.isError ? "Could not load latest sync" : latest ? `${latest.resource} · ${latest.upsertedCount.toLocaleString()} records` : "No sync run yet"}</span>{latest && <Badge variant="outline" className="rounded-full">{latest.status.toLowerCase()}</Badge>}</div>
  </Link>;
}

function NextStepCard({ icon: Icon, title, description, href }: { icon: typeof Boxes; title: string; description: string; href: string }) {
  return <Card className="transition hover:border-primary/25"><CardHeader className="flex flex-row items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary"><Icon className="size-5" /></span><div className="space-y-1"><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div></CardHeader><CardContent><Button asChild variant="outline" size="sm" className="rounded-lg"><Link href={href}>Open <ArrowRight className="ml-2 size-3.5" /></Link></Button></CardContent></Card>;
}
