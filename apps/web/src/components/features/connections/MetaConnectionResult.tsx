"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Megaphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { useCompleteMetaConnectionMutation, useGetMetaIntentQuery } from "@/services/adsApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { safeUuidRouteSegment } from "@/lib/safe-route-segment";

export function MetaConnectionResult() {
  const router = useRouter();
  const params = useSearchParams();
  const intentId = safeUuidRouteSegment(params.get("intentId") ?? "") ?? "";
  const callbackStatus = params.get("status")?.toUpperCase();
  const intent = useGetMetaIntentQuery(intentId, { skip: !intentId || callbackStatus === "FAILED", refetchOnMountOrArgChange: true });
  const [complete, completeState] = useCompleteMetaConnectionMutation();
  const [selectedOverride, setSelectedOverride] = useState<string[] | null>(null);
  const accounts = intent.data?.accounts ?? [];
  const selected = selectedOverride ?? accounts.map((account) => account.id);
  const allSelected = accounts.length > 0 && selected.length === accounts.length;

  const failed = callbackStatus === "FAILED" || callbackStatus === "CANCELLED" || callbackStatus === "EXPIRED";
  const completeLabel = completeState.isLoading ? "Connecting…" : `Connect ${selected.length} account${selected.length === 1 ? "" : "s"}`;

  if (!intentId) return <ResultShell icon={<AlertCircle />} title="Connection details are missing" description="The Meta callback did not include a valid connection request." action={() => router.replace("/connections")} actionLabel="Back to connections" />;
  if (failed) return <ResultShell icon={<AlertCircle />} title="Meta connection failed" description="Meta did not authorize this request. Start again from the connections page." action={() => router.replace("/connections")} actionLabel="Back to connections" />;
  if (intent.isLoading || !intent.data) return <main className="mx-auto max-w-xl px-6 py-16"><QuerySkeleton rows={3} /></main>;
  if (intent.isError) return <main className="mx-auto max-w-xl px-6 py-16"><QueryError title="Couldn’t verify the Meta connection" onRetry={() => void intent.refetch()} /><Button variant="ghost" className="mt-4" onClick={() => router.replace("/connections")}>Back to connections</Button></main>;
  if (intent.data.status === "COMPLETED") return <ResultShell icon={<CheckCircle2 />} title="Meta accounts connected" description="Your selected accounts are connected. Tarmeez will import their campaigns in the background." action={() => router.replace("/connections")} actionLabel="Back to connections" success />;
  if (intent.data.status !== "AUTHORIZED") return <ResultShell icon={<Clock3 />} title="Waiting for Meta" description="Meta has not finished authorizing this request. Return to Connections and try again if this takes too long." action={() => router.replace("/connections")} actionLabel="Back to connections" />;

  async function submit() {
    try { await complete({ intentId, accountIds: selected }).unwrap(); }
    catch { /* Error is displayed below the selector. */ }
  }

  return <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6"><section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Megaphone className="size-6" /></div><h1 className="mt-5 text-xl font-semibold">Choose Meta ad accounts</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Select the accounts this merchant user wants to monitor. You can add more later.</p><div className="mt-6 flex items-center justify-between gap-3 border-b pb-3"><p className="text-sm font-medium">Available accounts <span className="text-muted-foreground">({accounts.length})</span></p><Button variant="ghost" size="sm" onClick={() => setSelectedOverride(allSelected ? [] : accounts.map((account) => account.id))}>{allSelected ? "Clear all" : "Select all"}</Button></div><div className="mt-3 space-y-2">{accounts.map((account) => <label key={account.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40"><input type="checkbox" className="size-4 accent-primary" checked={selected.includes(account.id)} onChange={() => setSelectedOverride(selected.includes(account.id) ? selected.filter((id) => id !== account.id) : [...selected, account.id])} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{account.name ?? "Unnamed Meta account"}</span><span className="mt-1 block text-xs text-muted-foreground">{account.currency ?? "Currency unavailable"} · {account.id}</span></span></label>)}</div>{completeState.error && <p role="alert" className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{getApiErrorMessage(completeState.error)}</p>}<div className="mt-7 flex flex-wrap justify-end gap-2"><Button variant="ghost" className="min-h-11 rounded-lg" onClick={() => router.replace("/connections")}>Cancel</Button><Button className="min-h-11 rounded-lg" disabled={selected.length === 0 || completeState.isLoading} onClick={() => void submit()}>{completeLabel}</Button></div></section></main>;
}

function ResultShell({ icon, title, description, action, actionLabel, success = false }: { icon: React.ReactNode; title: string; description: string; action: () => void; actionLabel: string; success?: boolean }) {
  return <main className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-6"><section className="w-full rounded-2xl border bg-card p-8 text-center shadow-sm"><span className={`mx-auto grid size-12 place-items-center rounded-full ${success ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>{icon}</span><h1 className="mt-5 text-lg font-semibold">{title}</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p><Button className="mt-6 min-h-11 rounded-lg" onClick={action}>{actionLabel}</Button></section></main>;
}
