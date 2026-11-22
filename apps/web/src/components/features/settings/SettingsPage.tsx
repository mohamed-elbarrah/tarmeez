"use client";

import { useState, type FormEvent } from "react";
import { Building2, Check, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common/PageHeader";
import { QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { useGetMerchantProfileQuery, useUpdateMerchantNameMutation } from "@/services/merchantApi";
import { getApiErrorMessage } from "@/lib/api-error";

export function SettingsPage() {
  const { data: profile, isLoading, isError, refetch } = useGetMerchantProfileQuery();
  const [updateName, mutation] = useUpdateMerchantNameMutation();
  const [name, setName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const owner = profile?.role === "OWNER";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    try { await updateName({ name: (name ?? profile.merchant.name).trim() }).unwrap(); setSaved(true); }
    catch { setSaved(false); }
  }

  if (isLoading) return <div className="space-y-6"><PageHeader title="Settings" description="Workspace identity and account details." /><QuerySkeleton rows={3} /></div>;
  if (isError || !profile) return <div className="space-y-6"><PageHeader title="Settings" description="Workspace identity and account details." /><QueryError title="Couldn’t load workspace settings" onRetry={() => void refetch()} /></div>;

  return <div className="space-y-8"><PageHeader eyebrow="Workspace" title="Settings" description="Manage your workspace identity and view account access details." />
    <Card><CardHeader><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/8 text-primary"><Building2 className="size-5" /></span><div><CardTitle>Workspace profile</CardTitle><CardDescription>Basic identity shared with your workspace.</CardDescription></div></div></CardHeader><CardContent><form onSubmit={submit} className="max-w-xl space-y-4"><div className="space-y-2"><label htmlFor="workspaceName" className="text-sm font-medium">Workspace name</label><Input id="workspaceName" value={name ?? profile.merchant.name} onChange={(event) => { setName(event.target.value); setSaved(false); }} maxLength={120} required disabled={!owner} className="h-11 rounded-lg" /><p className="text-xs text-muted-foreground">Workspace names can contain up to 120 characters.</p></div>{owner ? <><Button type="submit" className="h-10 rounded-lg" disabled={mutation.isLoading || !(name ?? profile.merchant.name).trim() || (name ?? profile.merchant.name).trim() === profile.merchant.name}>{mutation.isLoading ? "Saving…" : "Save changes"}</Button>{saved && <p role="status" className="inline-flex items-center gap-1.5 pl-3 text-sm text-emerald-700"><Check className="size-4" />Workspace name updated</p>}</> : <p className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground"><LockKeyhole className="size-4 shrink-0" />Only the workspace owner can edit workspace settings.</p>}{mutation.error && <p role="alert" className="text-sm text-destructive">{getApiErrorMessage(mutation.error)}</p>}</form></CardContent></Card>
    <Card><CardHeader><CardTitle>Account</CardTitle><CardDescription>Your current sign-in and workspace permissions.</CardDescription></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><Detail label="Name" value={profile.user.name} /><Detail label="Email" value={profile.user.email} /><div><p className="text-xs text-muted-foreground">Workspace role</p><Badge variant={owner ? "secondary" : "outline"} className="mt-2 rounded-full">{owner ? "Owner" : "Viewer"}</Badge></div><div><p className="text-xs text-muted-foreground">Workspace status</p><Badge variant={profile.merchant.status === "ACTIVE" ? "secondary" : "destructive"} className="mt-2 rounded-full">{profile.merchant.status === "ACTIVE" ? "Active" : "Suspended"}</Badge></div><Detail label="Member since" value={formatDate(profile.createdAt)} /></CardContent></Card>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1.5 text-sm font-medium">{value}</p></div>; }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(value)); }
