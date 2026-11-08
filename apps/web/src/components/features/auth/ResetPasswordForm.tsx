"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useResetPasswordMutation } from "@/services/authApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";

interface ResetPasswordFormProps { initialEmail: string }

export function ResetPasswordForm({ initialEmail }: ResetPasswordFormProps) {
  const router = useRouter();
  const [resetPassword, { isLoading, error }] = useResetPasswordMutation();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await resetPassword({ email: email.trim().toLowerCase(), code, newPassword }).unwrap(); setDone(true); }
    catch { /* Error is rendered from the mutation state. */ }
  }
  if (done) return <div role="status" className="space-y-4"><p className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6">Your password has been reset. Please sign in with your new password.</p><Button type="button" className="h-11 w-full rounded-lg" onClick={() => router.replace("/login")}>Continue to sign in</Button></div>;
  return <form onSubmit={handleSubmit} className="space-y-4">
    <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
    <div className="space-y-2"><label htmlFor="code" className="text-sm font-medium">Reset code</label><input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
    <div className="space-y-2"><label htmlFor="newPassword" className="text-sm font-medium">New password</label><input id="newPassword" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /><p className="text-xs text-muted-foreground">At least 8 characters; use a password you haven’t used before.</p></div>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}
    <Button type="submit" disabled={isLoading || !email.trim() || code.length !== 6 || newPassword.length < 8} className="h-11 w-full rounded-lg">{isLoading ? "Updating password…" : "Reset password"}</Button>
    <div className="text-center"><Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">Request another code</Link></div>
  </form>;
}
