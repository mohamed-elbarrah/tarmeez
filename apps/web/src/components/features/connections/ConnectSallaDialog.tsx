"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useStartSallaConnectionMutation } from "@/services/connectionsApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, Store } from "lucide-react";
import type { StoreConnection } from "@/types/merchant.types";

interface ConnectSallaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: StoreConnection[];
}

export function ConnectSallaDialog({ open, onOpenChange, connections }: ConnectSallaDialogProps) {
  const [start, { data: intent, isLoading, error, reset }] = useStartSallaConnectionMutation();
  const [storeUrl, setStoreUrl] = useState("");
  const [now, setNow] = useState(0);
  const expectedHost = useMemo(() => extractHost(storeUrl), [storeUrl]);
  const matchingConnection = intent ? connections.find((connection) => connection.status === "CONNECTED" && connection.storeDomain && normalizeHost(connection.storeDomain) === expectedHost) : undefined;
  const expired = !!intent && now > 0 && new Date(intent.expiresAt).getTime() <= now;

  useEffect(() => {
    if (!intent || matchingConnection) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [intent, matchingConnection]);
  function handleClose(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  function finishConnection() {
    reset();
    setStoreUrl("");
    handleClose(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeInput(storeUrl);
    try { await start({ storeUrl: normalized }).unwrap(); }
    catch { /* Error is displayed below. */ }
  }

  const secondsLeft = intent && now > 0 ? Math.max(0, Math.ceil((new Date(intent.expiresAt).getTime() - now) / 1000)) : 0;
  return <Dialog open={open} onOpenChange={handleClose}><DialogContent className="gap-5 sm:max-w-lg">
    <DialogHeader><div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Store className="size-5" /></div><DialogTitle>{matchingConnection ? "Salla is connected" : intent ? "Authorize your store" : "Connect a Salla store"}</DialogTitle><DialogDescription>{matchingConnection ? "Your store is linked to this workspace. You can now start importing its data." : intent ? "Continue to Salla in a new tab, approve access, then return here. We’ll detect the connection automatically." : "Enter your public storefront domain. We’ll send you to Salla to approve secure, read-only access."}</DialogDescription></DialogHeader>
    {!intent && <form id="connect-salla-form" onSubmit={handleSubmit} className="space-y-3"><label htmlFor="storeUrl" className="text-sm font-medium">Storefront URL</label><Input id="storeUrl" type="url" inputMode="url" required value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} placeholder="https://your-store.salla.sa" autoComplete="url" className="h-11 rounded-lg" /><p className="text-xs leading-5 text-muted-foreground">Use the public store domain—not an admin or temporary preview link.</p>{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}</form>}
    {intent && !matchingConnection && <div className="rounded-xl border bg-muted/40 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Waiting for Salla approval</p><p className="mt-1 text-xs text-muted-foreground">{expectedHost}</p></div><span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{expired ? "Expired" : now === 0 ? "Checking expiry…" : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} left`}</span></div>{!expired && <Button asChild className="mt-4 h-10 w-full rounded-lg"><a href={intent.installationUrl} target="_blank" rel="noopener noreferrer">Continue to Salla <ExternalLink className="ml-2 size-4" /></a></Button>}{expired && <p className="mt-3 text-sm text-destructive">This authorization request expired. Start again to create a fresh request.</p>}<p className="mt-3 text-xs leading-5 text-muted-foreground">This secure request expires after 15 minutes. Keep this page open while you approve access.</p></div>}
    {matchingConnection && <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 p-4 text-sm text-emerald-800">Connected as <strong>{matchingConnection.storeName ?? matchingConnection.storeDomain}</strong>. You can close this window and start the initial import.</div>}
    <DialogFooter><Button type={intent ? "button" : "submit"} form={intent ? undefined : "connect-salla-form"} disabled={isLoading || (!!intent && !expired && !matchingConnection)} onClick={intent && matchingConnection ? finishConnection : intent && expired ? () => { reset(); setStoreUrl(""); } : undefined} variant={intent && matchingConnection ? "default" : "outline"} className="h-10 rounded-lg">{isLoading ? "Starting…" : intent ? matchingConnection ? "Done" : expired ? "Start over" : "Waiting for authorization…" : "Continue"}</Button><Button type="button" variant="ghost" className="h-10 rounded-lg" onClick={() => handleClose(false)}>{intent && !matchingConnection && !expired ? "Close and keep waiting" : "Cancel"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function normalizeInput(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extractHost(value: string): string {
  try { return normalizeHost(new URL(normalizeInput(value)).hostname); } catch { return ""; }
}

function normalizeHost(value: string): string { return value.toLowerCase().replace(/^www\./, ""); }
