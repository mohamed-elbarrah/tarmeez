"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAcceptInvitationMutation } from "@/services/authApi";
import { getApiErrorMessage } from "@/lib/api-error";

interface AcceptInvitationFormProps { invitationToken: string }

export function AcceptInvitationForm({ invitationToken }: AcceptInvitationFormProps) {
  const router = useRouter();
  const [acceptInvitation, { isLoading, error }] = useAcceptInvitationMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await acceptInvitation({ email: email.trim().toLowerCase(), password, invitationToken }).unwrap(); router.replace("/welcome"); }
    catch { /* Error is rendered from the mutation state. */ }
  }
  return <form onSubmit={handleSubmit} className="space-y-5">
    <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Account email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
    <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Current password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}
    <Button type="submit" disabled={isLoading || !email.trim() || !password} className="h-11 w-full rounded-lg">{isLoading ? "Accepting invitation…" : "Accept invitation"}{!isLoading && <ArrowRight className="ml-2 size-4" />}</Button>
  </form>;
}
