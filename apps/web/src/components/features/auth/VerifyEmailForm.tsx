"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVerifyEmailMutation } from "@/services/authApi";
import { getApiErrorMessage } from "@/lib/api-error";

interface VerifyEmailFormProps { email: string }

export function VerifyEmailForm({ email }: VerifyEmailFormProps) {
  const router = useRouter();
  const [verify, { isLoading, error }] = useVerifyEmailMutation();
  const [code, setCode] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { const session = await verify({ email, code }).unwrap(); router.replace(session.user.role === "MERCHANT" ? "/dashboard" : "/welcome"); }
    catch { /* Error is rendered from the mutation state. */ }
  }

  return <form onSubmit={handleSubmit} className="space-y-5">
    <div className="space-y-2"><label htmlFor="code" className="text-sm font-medium">Verification code</label><input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit code" className="h-12 w-full rounded-lg border bg-background px-3.5 text-center font-mono text-lg tracking-[0.4em] outline-none transition placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
    <p className="text-sm leading-6 text-muted-foreground">We sent a code to <span className="font-medium text-foreground">{email}</span>. Codes expire after 10 minutes. Check your inbox and spam folder.</p>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}
    <Button type="submit" disabled={isLoading || code.length !== 6} className="h-11 w-full rounded-lg text-sm">{isLoading ? "Verifying…" : "Verify email"}{!isLoading && <ArrowRight className="ml-2 size-4" />}</Button>
  </form>;
}
