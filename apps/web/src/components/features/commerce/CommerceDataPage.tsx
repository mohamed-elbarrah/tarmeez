"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RecordDetailSheet } from "@/components/features/commerce/RecordDetailSheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGetConnectionsQuery, useGetCustomersQuery, useGetOrdersQuery, useGetProductsQuery } from "@/services/connectionsApi";
import type { CustomerRecord, OrderRecord, ProductRecord } from "@/types/merchant.types";

type Resource = "products" | "orders" | "customers";
interface CommerceDataPageProps { resource: Resource }
const titles: Record<Resource, string> = { products: "Products", orders: "Orders", customers: "Customers" };
const PAGE_SIZE = 25;

export function CommerceDataPage({ resource }: CommerceDataPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedConnectionId = searchParams.get("connectionId") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const connections = useGetConnectionsQuery();
  const [selectedRecord, setSelectedRecord] = useState<ProductRecord | OrderRecord | CustomerRecord | null>(null);
  const connectionId = requestedConnectionId || connections.data?.[0]?.id || "";
  const isProduct = resource === "products";
  const isOrder = resource === "orders";
  const products = useGetProductsQuery({ connectionId, page, perPage: PAGE_SIZE }, { skip: !connectionId || !isProduct });
  const orders = useGetOrdersQuery({ connectionId, page, perPage: PAGE_SIZE }, { skip: !connectionId || !isOrder });
  const customers = useGetCustomersQuery({ connectionId, page, perPage: PAGE_SIZE }, { skip: !connectionId || resource !== "customers" });
  const result = isProduct ? products : isOrder ? orders : customers;
  const connection = connections.data?.find((item) => item.id === connectionId);

  useEffect(() => {
    if (!connections.data?.length) return;
    if (!requestedConnectionId || !connections.data.some((item) => item.id === requestedConnectionId)) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("connectionId", connections.data[0].id);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [connections.data, pathname, requestedConnectionId, router, searchParams]);

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("connectionId", connectionId);
    if (nextPage <= 1) next.delete("page"); else next.set("page", String(nextPage));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function setConnection(nextConnectionId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("connectionId", nextConnectionId);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const rows = isProduct ? products.data?.data : isOrder ? orders.data?.data : customers.data?.data;
  const meta = isProduct ? products.data?.meta : isOrder ? orders.data?.meta : customers.data?.meta;
  const fetching = result.isLoading;
  const failed = result.isError;

  return <div className="space-y-7">
    <PageHeader eyebrow="Store data" title={titles[resource]} description={resource === "customers" ? "Customer records synced from your store. Contact details are intentionally not surfaced here until data-access policies are defined." : `Read-only ${resource} records from your connected commerce store.`} action={connections.data?.length ? <label className="flex items-center gap-2 text-sm"><span className="sr-only">Select store</span><Store className="size-4 text-muted-foreground" /><select aria-label="Select store" value={connectionId} onChange={(event) => setConnection(event.target.value)} className="h-10 min-w-44 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{connections.data.map((item) => <option key={item.id} value={item.id}>{item.storeName ?? item.storeDomain ?? "Salla store"}</option>)}</select></label> : undefined} />
    {connections.isLoading ? <QuerySkeleton rows={3} /> : connections.isError ? <QueryError title="Couldn’t load connected stores" onRetry={() => void connections.refetch()} /> : !connections.data?.length ? <EmptyState title="No connected store" description="Connect a Salla store before browsing imported commerce data." action={<Button asChild className="rounded-lg"><Link href="/connections">Connect a store</Link></Button>} /> : connection && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">Showing records from</span><span className="text-sm font-medium">{connection.storeName ?? connection.storeDomain}</span><StatusBadge status={connection.status} /></div><p className="text-xs text-muted-foreground">Synced {formatDate(connection.verifiedAt ?? connection.connectedAt)}</p></div>
      {fetching ? <QuerySkeleton rows={6} /> : failed ? <QueryError title={`Couldn’t load ${resource}`} onRetry={() => void result.refetch()} /> : rows?.length ? <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><DataTableHeader resource={resource} /></TableHeader><TableBody>{resource === "products" ? (rows as ProductRecord[]).map((item) => <ProductRow key={item.id} item={item} onViewDetails={() => setSelectedRecord(item)} />) : resource === "orders" ? (rows as OrderRecord[]).map((item) => <OrderRow key={item.id} item={item} onViewDetails={() => setSelectedRecord(item)} />) : (rows as CustomerRecord[]).map((item) => <CustomerRow key={item.id} item={item} onViewDetails={() => setSelectedRecord(item)} />)}</TableBody></Table><div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{meta?.total.toLocaleString() ?? 0} records · Page {meta?.page ?? page} of {Math.max(meta?.totalPages ?? 1, 1)}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="mr-1 size-3.5" />Previous</Button><Button variant="outline" size="sm" className="h-8 rounded-lg" disabled={!meta || page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next<ChevronRight className="ml-1 size-3.5" /></Button></div></div></div> : <EmptyState title={`No ${resource} imported yet`} description="Start a sync for this store. Imported records will appear here when the run completes." action={<Button asChild variant="outline" className="rounded-lg"><Link href={`/connections/${connection.id}`}>View sync activity</Link></Button>} />}
      <p className="text-xs text-muted-foreground">Data is read-only and reflects the latest completed imports. Search and filters aren’t available for this endpoint yet.</p>
    </>}
    <RecordDetailSheet resource={resource} record={selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)} />
  </div>;
}

function DataTableHeader({ resource }: { resource: Resource }) {
  if (resource === "products") return <TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Product</TableHead><TableHead>SKU</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Price</TableHead><TableHead>Availability</TableHead><TableHead className="pr-4 text-right">Details</TableHead></TableRow>;
  if (resource === "orders") return <TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Order</TableHead><TableHead>Status</TableHead><TableHead>Items</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead className="pr-4 text-right">Details</TableHead></TableRow>;
  return <TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Customer</TableHead><TableHead>Location</TableHead><TableHead>Added</TableHead><TableHead>Record ID</TableHead><TableHead className="pr-4 text-right">Details</TableHead></TableRow>;
}

function ProductRow({ item, onViewDetails }: { item: ProductRecord; onViewDetails: () => void }) {
  return <TableRow><TableCell className="max-w-64 pl-4"><p className="truncate font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.productType ?? "Product"}</p></TableCell><TableCell className="text-muted-foreground">{item.sku || "—"}</TableCell><TableCell><Badge variant="outline" className="rounded-full">{item.status ?? "Unknown"}</Badge></TableCell><TableCell className="text-right tabular-nums">{formatMoney(item.salePrice ?? item.price, item.currency)}</TableCell><TableCell>{item.isAvailable === null ? "—" : item.isAvailable ? <span className="text-emerald-700">Available</span> : <span className="text-muted-foreground">Unavailable</span>}</TableCell><TableCell className="pr-4 text-right"><DetailsButton onClick={onViewDetails} label="View product details" /></TableCell></TableRow>;
}

function OrderRow({ item, onViewDetails }: { item: OrderRecord; onViewDetails: () => void }) {
  return <TableRow><TableCell className="pl-4"><p className="font-medium">{item.reference ? `#${item.reference}` : `Order ${item.externalId}`}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.externalId}</p></TableCell><TableCell><Badge variant="outline" className="rounded-full">{item.status ?? "Unknown"}</Badge></TableCell><TableCell className="text-muted-foreground">{item.items?.length ?? 0}</TableCell><TableCell className="text-muted-foreground">{formatDate(item.sourceCreatedAt)}</TableCell><TableCell className="font-medium tabular-nums">{formatMoney(item.total, item.currency)}</TableCell><TableCell className="pr-4 text-right"><DetailsButton onClick={onViewDetails} label="View order details" /></TableCell></TableRow>;
}

function CustomerRow({ item, onViewDetails }: { item: CustomerRecord; onViewDetails: () => void }) {
  return <TableRow><TableCell className="pl-4"><p className="font-medium">{item.name || "Unnamed customer"}</p><p className="mt-1 text-xs text-muted-foreground">Customer record</p></TableCell><TableCell className="text-muted-foreground">{[item.city, item.country].filter(Boolean).join(", ") || "—"}</TableCell><TableCell className="text-muted-foreground">{formatDate(item.sourceCreatedAt)}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{item.externalId}</TableCell><TableCell className="pr-4 text-right"><DetailsButton onClick={onViewDetails} label="View customer details" /></TableCell></TableRow>;
}

function DetailsButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2.5 text-primary" onClick={onClick} aria-label={label}><Eye className="mr-1.5 size-3.5" />Details</Button>;
}

function formatDate(value: string | null): string { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—"; }
function formatMoney(value: string | number | null, currency: string | null): string {
  if (value === null) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: currency ? "currency" : "decimal", currency: currency || undefined, maximumFractionDigits: 2 }).format(parsed); }
  catch { return `${parsed.toLocaleString()}${currency ? ` ${currency}` : ""}`; }
}
