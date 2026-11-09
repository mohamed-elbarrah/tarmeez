"use client";

import { useState, type FormEvent } from "react";
import { MailPlus, MoreHorizontal, RefreshCw, ShieldCheck, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, QueryError, QuerySkeleton } from "@/components/common/QueryState";
import { useGetMerchantProfileQuery, useGetTeamQuery, useGetInvitationsQuery, useInviteTeamMemberMutation, useResendInvitationMutation, useRemoveTeamMemberMutation, useRevokeInvitationMutation } from "@/services/merchantApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TeamPage() {
  const profile = useGetMerchantProfileQuery();
  const team = useGetTeamQuery();
  const isOwner = profile.data?.role === "OWNER";
  const invitations = useGetInvitationsQuery(undefined, { skip: !isOwner });
  const [selected, setSelected] = useState<{ kind: "member" | "invitation"; id: string; label: string } | null>(null);
  const [removeMember, memberState] = useRemoveTeamMemberMutation();
  const [revokeInvitation, invitationState] = useRevokeInvitationMutation();
  async function confirmRemove() {
    if (!selected) return;
    try {
      if (selected.kind === "member") await removeMember(selected.id).unwrap();
      else await revokeInvitation(selected.id).unwrap();
      setSelected(null);
    } catch { /* The alert remains open; error appears in the list. */ }
  }

  return <div className="space-y-8">
    <PageHeader eyebrow="Workspace" title="Team" description="See who has access to this workspace and manage viewer invitations." action={isOwner ? <InviteDialog /> : undefined} />
    {profile.isError && <QueryError title="Couldn’t verify team permissions" onRetry={() => void profile.refetch()} />}
    {team.isLoading ? <QuerySkeleton rows={4} /> : team.isError ? <QueryError title="Couldn’t load your team" onRetry={() => void team.refetch()} /> : team.data?.length ? <section className="space-y-4"><div><h2 className="text-sm font-semibold">Members <span className="ml-1 text-muted-foreground">{team.data.length}</span></h2><p className="mt-1 text-sm text-muted-foreground">People who can access this merchant workspace.</p></div><div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Member</TableHead><TableHead>Role</TableHead><TableHead>Added</TableHead><TableHead className="pr-4 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{team.data.map((member) => <TableRow key={member.id}><TableCell className="pl-4"><div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{member.user.name.slice(0, 1).toUpperCase()}</span><div><p className="font-medium">{member.user.name}{member.user.id === profile.data?.user.id && <span className="ml-2 text-xs text-muted-foreground">You</span>}</p><p className="mt-0.5 text-xs text-muted-foreground">{member.user.email}</p></div></div></TableCell><TableCell><Badge variant={member.role === "OWNER" ? "secondary" : "outline"} className="rounded-full">{member.role === "OWNER" ? <ShieldCheck className="mr-1 size-3" /> : null}{member.role === "OWNER" ? "Owner" : "Viewer"}</Badge></TableCell><TableCell className="text-muted-foreground">{formatDate(member.createdAt)}</TableCell><TableCell className="pr-4 text-right">{isOwner && member.role === "VIEWER" && <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setSelected({ kind: "member", id: member.id, label: member.user.name })}><UserMinus className="mr-2 size-3.5" />Remove</Button>}</TableCell></TableRow>)}</TableBody></Table></div></section> : <EmptyState title="No team members" description="Workspace members will appear here." />}

    {isOwner && <section className="space-y-4"><div><h2 className="text-sm font-semibold">Invitations</h2><p className="mt-1 text-sm text-muted-foreground">Invitations expire after seven days. Resending rotates the old invite link.</p></div>{invitations.isLoading ? <QuerySkeleton rows={2} /> : invitations.isError ? <QueryError title="Couldn’t load invitations" onRetry={() => void invitations.refetch()} /> : invitations.data?.length ? <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Email</TableHead><TableHead>Access</TableHead><TableHead>Status</TableHead><TableHead>Expires</TableHead><TableHead className="pr-4 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{invitations.data.map((invite) => { const expired = new Date(invite.expiresAt) <= new Date(); return <TableRow key={invite.id}><TableCell className="pl-4 font-medium">{invite.email}</TableCell><TableCell><Badge variant="outline" className="rounded-full">Viewer</Badge></TableCell><TableCell><Badge variant={expired ? "outline" : "secondary"} className="rounded-full">{expired ? "Expired" : "Pending"}</Badge></TableCell><TableCell className="text-muted-foreground">{formatDate(invite.expiresAt)}</TableCell><TableCell className="pr-4 text-right"><InvitationActions invitationId={invite.id} expired={expired} onRevoke={() => setSelected({ kind: "invitation", id: invite.id, label: invite.email })} /></TableCell></TableRow>; })}</TableBody></Table></div> : <EmptyState title="No invitations pending" description="Invite a teammate as a viewer. They’ll receive an email with a secure invite link." action={<InviteDialog compact />} />}</section>}

    {!isOwner && <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">You have viewer access. Only the workspace owner can invite or remove members.</div>}
    <AlertDialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{selected?.kind === "member" ? "Remove team member?" : "Revoke this invitation?"}</AlertDialogTitle><AlertDialogDescription>{selected?.kind === "member" ? `${selected.label} will lose workspace access and their refresh sessions will be revoked.` : `The invitation sent to ${selected?.label} will stop working.`}</AlertDialogDescription>{(memberState.error || invitationState.error) && <p role="alert" className="text-sm text-destructive">{getApiErrorMessage(memberState.error ?? invitationState.error)}</p>}</AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={memberState.isLoading || invitationState.isLoading}>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" disabled={memberState.isLoading || invitationState.isLoading} onClick={(event) => { event.preventDefault(); void confirmRemove(); }}>{memberState.isLoading || invitationState.isLoading ? "Working…" : selected?.kind === "member" ? "Remove member" : "Revoke invitation"}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function InviteDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [invite, { isLoading, error }] = useInviteTeamMemberMutation();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await invite({ email: email.trim().toLowerCase() }).unwrap(); setEmail(""); setOpen(false); }
    catch { /* Error is shown in the form. */ }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="h-10 rounded-lg" variant={compact ? "outline" : "default"}><MailPlus className="mr-2 size-4" />Invite teammate</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Invite a teammate</DialogTitle><DialogDescription>They’ll be invited as a viewer and can read this workspace. The invitation expires in seven days.</DialogDescription></DialogHeader><form id="invite-member-form" onSubmit={submit} className="space-y-2"><label htmlFor="invite-email" className="text-sm font-medium">Email address</label><Input id="invite-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" className="h-11 rounded-lg" />{error && <p role="alert" className="pt-1 text-sm text-destructive">{getApiErrorMessage(error)}</p>}</form><DialogFooter><Button type="button" variant="outline" className="rounded-lg" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="invite-member-form" className="rounded-lg" disabled={isLoading || !email.trim()}>{isLoading ? "Sending invite…" : "Send invitation"}</Button></DialogFooter></DialogContent></Dialog>;
}

function InvitationActions({ invitationId, expired, onRevoke }: { invitationId: string; expired: boolean; onRevoke: () => void }) {
  const [resend, state] = useResendInvitationMutation();
  async function resendInvite() { try { await resend(invitationId).unwrap(); } catch { /* Error rendered inline. */ } }
  return <div className="flex flex-col items-end gap-1"><div className="flex items-center justify-end gap-1"><Button size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => void resendInvite()} disabled={state.isLoading}><RefreshCw className={`mr-1.5 size-3.5 ${state.isLoading ? "animate-spin" : ""}`} />{expired ? "Resend invite" : "Resend"}</Button><Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Revoke invitation" onClick={onRevoke}><MoreHorizontal className="size-4" /></Button></div>{state.error && <span role="alert" className="max-w-48 text-right text-[11px] text-destructive">{getApiErrorMessage(state.error)}</span>}</div>;
}

function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
