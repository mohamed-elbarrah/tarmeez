"use client";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CustomerRecord, OrderRecord, ProductRecord } from "@/types/merchant.types";

interface RecordDetailSheetProps {
  resource: "products" | "orders" | "customers";
  record: ProductRecord | OrderRecord | CustomerRecord | null;
  onOpenChange: (open: boolean) => void;
}

export function RecordDetailSheet({ resource, record, onOpenChange }: RecordDetailSheetProps) {
  const title = record ? recordTitle(resource, record) : "Record details";
  return <Sheet open={!!record} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
    <SheetHeader className="border-b px-6 py-6 pr-14"><Badge variant="outline" className="w-fit rounded-full capitalize">{resource.slice(0, -1)} details</Badge><SheetTitle className="mt-1 text-xl">{title}</SheetTitle><SheetDescription>Imported from your connected store. This information is read-only.</SheetDescription></SheetHeader>
    {record && <div className="space-y-7 px-6 py-6">{resource === "products" ? <ProductDetails record={record as ProductRecord} /> : resource === "orders" ? <OrderDetails record={record as OrderRecord} /> : <CustomerDetails record={record as CustomerRecord} />}</div>}
  </SheetContent></Sheet>;
}

function ProductDetails({ record }: { record: ProductRecord }) {
  return <>
    <section><SectionHeading>Catalog</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Product name" value={record.name} /><Detail label="SKU" value={record.sku} /><Detail label="Type" value={record.productType} /><Detail label="Status" value={record.status} /><Detail label="Product ID" value={record.externalId} mono /></div>{record.description && <div className="mt-4"><p className="text-xs text-muted-foreground">Description</p><p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-6">{record.description}</p></div>}</section>
    <section><SectionHeading>Price & availability</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Price" value={formatMoney(record.price, record.currency)} /><Detail label="Sale price" value={formatMoney(record.salePrice, record.currency)} /><Detail label="Quantity" value={record.quantity === null ? null : String(record.quantity)} /><Detail label="Availability" value={record.isAvailable === null ? null : record.isAvailable ? "Available" : "Unavailable"} /></div></section>
    <section><SectionHeading>Sync information</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Source updated" value={formatDate(record.sourceUpdatedAt)} /><Detail label="Last synced" value={formatDate(record.lastSyncedAt)} /></div></section>
  </>;
}

function OrderDetails({ record }: { record: OrderRecord }) {
  return <>
    <section><SectionHeading>Order summary</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Reference" value={record.reference ? `#${record.reference}` : null} /><Detail label="Status" value={record.status} /><Detail label="Order ID" value={record.externalId} mono /><Detail label="Placed" value={formatDate(record.sourceCreatedAt)} /><Detail label="Customer record ID" value={record.customerId ?? null} mono /></div></section>
    <section><SectionHeading>Amounts</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Subtotal" value={formatMoney(record.subtotal, record.currency)} /><Detail label="Discount" value={formatMoney(record.discountTotal, record.currency)} /><Detail label="Shipping" value={formatMoney(record.shippingTotal, record.currency)} /><Detail label="Tax" value={formatMoney(record.taxTotal, record.currency)} /><Detail label="Total" value={formatMoney(record.total, record.currency)} emphasize /></div></section>
    <section><div className="flex items-center justify-between"><SectionHeading>Line items</SectionHeading><span className="text-xs text-muted-foreground">{record.items?.length ?? 0} items</span></div>{record.items?.length ? <div className="mt-3 overflow-hidden rounded-lg border"><Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-3">Item</TableHead><TableHead>Qty</TableHead><TableHead className="pr-3 text-right">Total</TableHead></TableRow></TableHeader><TableBody>{record.items.map((item) => <TableRow key={item.id}><TableCell className="max-w-52 pl-3"><p className="truncate font-medium">{item.name ?? "Unnamed item"}</p>{item.sku && <p className="mt-0.5 text-xs text-muted-foreground">{item.sku}</p>}</TableCell><TableCell>{item.quantity ?? "—"}</TableCell><TableCell className="pr-3 text-right tabular-nums">{formatMoney(item.total, item.currency ?? record.currency)}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="mt-3 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">No line items were returned for this order.</p>}</section>
    <section><SectionHeading>Sync information</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Source updated" value={formatDate(record.sourceUpdatedAt)} /><Detail label="Last synced" value={formatDate(record.lastSyncedAt)} /></div></section>
  </>;
}

function CustomerDetails({ record }: { record: CustomerRecord }) {
  return <>
    <section><SectionHeading>Customer profile</SectionHeading><div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4"><Detail label="Name" value={record.name} /><Detail label="Customer ID" value={record.externalId} mono /><Detail label="City" value={record.city} /><Detail label="Country" value={record.country} /><Detail label="Added to store" value={formatDate(record.sourceCreatedAt)} /><Detail label="Last updated" value={formatDate(record.sourceUpdatedAt)} /></div></section>
    <section className="rounded-lg border border-muted bg-muted/30 p-4"><p className="text-sm font-medium">Contact details hidden</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Email and phone are personal data. They’re not shown until the workspace’s access and retention policies are defined.</p></section>
    <section><SectionHeading>Sync information</SectionHeading><div className="mt-3"><Detail label="Last synced" value={formatDate(record.lastSyncedAt)} /></div></section>
  </>;
}

function Detail({ label, value, mono = false, emphasize = false }: { label: string; value: string | null; mono?: boolean; emphasize?: boolean }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1.5 break-words text-sm ${emphasize ? "font-semibold" : "font-medium"} ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p></div>;
}

function SectionHeading({ children }: { children: React.ReactNode }) { return <h3 className="text-sm font-semibold">{children}</h3>; }
function recordTitle(resource: RecordDetailSheetProps["resource"], record: RecordDetailSheetProps["record"]): string {
  if (!record) return "Record details";
  if (resource === "products") return (record as ProductRecord).name || "Product details";
  if (resource === "orders") { const order = record as OrderRecord; return order.reference ? `Order #${order.reference}` : `Order ${order.externalId}`; }
  return (record as CustomerRecord).name || "Customer details";
}
function formatDate(value: string | null): string { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function formatMoney(value: string | number | null, currency: string | null): string {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: currency ? "currency" : "decimal", currency: currency || undefined, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${amount.toLocaleString()}${currency ? ` ${currency}` : ""}`; }
}
