"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Store, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConnectSallaDialog } from "@/components/features/connections/ConnectSallaDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDisconnectConnectionMutation, useGetConnectionsQuery, useStartSyncMutation } from "@/services/connectionsApi";
import { useGetMerchantProfileQuery } from "@/services/merchantApi";
import { getApiErrorMessage } from "@/lib/api-error";
import type { StoreConnection } from "@/types/merchant.types";

export function ConnectionsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const profileQuery = useGetMerchantProfileQuery();
  const profile = profileQuery.data;
  const connections = useGetConnectionsQuery(undefined, { pollingInterval: dialogOpen ? 5000 : 0 });
  const isOwner = profile?.role === "OWNER";

  return <div className="space-y-8">
    <PageHeader eyebrow="Integrations" title="Connections" description="Connect your commerce platform and monitor the health of each store." action={isOwner ? <Button className="h-10 rounded-lg" onClick={() => setDialogOpen(true)}><Store className="mr-2 size-4" />Connect Salla</Button> : undefined} />
    {profileQuery.isError && <QueryError title="Couldn’t verify workspace permissions" onRetry={() => void profileQuery.refetch()} />}
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-semibold">Your stores</h2><p className="mt-1 text-sm text-muted-foreground">Credentials stay encrypted; Tarmeez only reads store data.</p></div><Badge variant="outline" className="shrink-0 rounded-full">Salla · Read only</Badge></div>
      {connections.isLoading ? <QuerySkeleton rows={3} /> : connections.isError ? <QueryError title="Couldn’t load connections" onRetry={() => void connections.refetch()} /> : connections.data?.length ? <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Store</TableHead><TableHead>Platform</TableHead><TableHead>Status</TableHead><TableHead>Connected</TableHead><TableHead className="pr-4 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{connections.data.map((connection) => <ConnectionRow key={connection.id} connection={connection} isOwner={isOwner} />)}</TableBody></Table></div> : <EmptyState title="No stores connected yet" description={isOwner ? "Connect your Salla store to securely import products, customers, and orders." : "A workspace owner can connect a Salla store. Once connected, its status and imported data will appear here."} action={isOwner ? <Button className="rounded-lg" onClick={() => setDialogOpen(true)}><Store className="mr-2 size-4" />Connect Salla</Button> : undefined} />}
    </section>
    <ConnectSallaDialog open={dialogOpen} onOpenChange={setDialogOpen} connections={connections.data ?? []} />
  </div>;
}

function ConnectionRow({ connection, isOwner }: { connection: StoreConnection; isOwner: boolean }) {
  const [startSync, syncState] = useStartSyncMutation();
  const [disconnect, setDisconnect] = useState(false);
  const [disconnectConnection, disconnectState] = useDisconnectConnectionMutation();
  async function runSync() {
    try { await startSync({ connectionId: connection.id, resource: "ALL" }).unwrap(); }
    catch { /* Error shown inline. */ }
  }
  async function confirmDisconnect() {
    try { await disconnectConnection(connection.id).unwrap(); setDisconnect(false); }
    catch { /* Error shown in the confirmation dialog. */ }
  }
  const canSync = isOwner && connection.status === "CONNECTED";
  return <TableRow>
    <TableCell className="min-w-56 pl-4"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><Store className="size-4" /></span><div className="min-w-0"><p className="truncate font-medium">{connection.storeName ?? "Salla store"}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{connection.storeDomain ?? `Store ID ${connection.externalStoreId}`}</p></div></div></TableCell>
    <TableCell><Badge variant="outline" className="rounded-full">Salla</Badge></TableCell>
    <TableCell><StatusBadge status={connection.status} /></TableCell>
    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(connection.connectedAt)}</TableCell>
    <TableCell className="pr-4"><div className="flex items-center justify-end gap-1.5"><Button asChild variant="outline" size="sm" className="h-8 rounded-lg"><Link href={`/connections/${connection.id}`}>Details <ArrowRight className="ml-1.5 size-3.5" /></Link></Button>{canSync && <Button size="sm" className="h-8 rounded-lg" disabled={syncState.isLoading} onClick={() => void runSync()}><RefreshCw className={`mr-1.5 size-3.5 ${syncState.isLoading ? "animate-spin" : ""}`} />{syncState.isLoading ? "Queueing" : "Sync"}</Button>}{isOwner && <Button variant="ghost" size="icon" aria-label={`Disconnect ${connection.storeName ?? "Salla store"}`} onClick={() => setDisconnect(true)} className="size-8 text-muted-foreground hover:text-destructive"><Unplug className="size-4" /></Button>}</div>{(syncState.error || disconnectState.error) && <p role="alert" className="mt-1 text-right text-xs text-destructive">{getApiErrorMessage(syncState.error ?? disconnectState.error)}</p>}
      <AlertDialog open={disconnect} onOpenChange={setDisconnect}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect this store?</AlertDialogTitle><AlertDialogDescription>This clears the saved Salla credentials. Previously imported records remain in Tarmeez and won’t be refreshed.</AlertDialogDescription>{disconnectState.error && <p role="alert" className="text-sm text-destructive">{getApiErrorMessage(disconnectState.error)}</p>}</AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={disconnectState.isLoading}>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" onClick={(event) => { event.preventDefault(); void confirmDisconnect(); }} disabled={disconnectState.isLoading}>{disconnectState.isLoading ? "Disconnecting…" : "Disconnect store"}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </TableCell>
  </TableRow>;
}

function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
