"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useForgotPasswordMutation } from "@/services/authApi";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [requestCode, { isLoading, error, isSuccess }] = useForgotPasswordMutation();
  const [email, setEmail] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await requestCode({ email: email.trim().toLowerCase() }).unwrap(); }
    catch { /* Error is rendered from the mutation state. */ }
  }
  if (isSuccess) return <div role="status" className="space-y-4"><p className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6">If an account exists for <strong className="font-medium">{email}</strong>, we’ve sent a password reset code. Check your inbox.</p><Link href={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`} className="inline-flex text-sm font-medium text-primary hover:underline">Enter reset code</Link></div>;
  return <form onSubmit={handleSubmit} className="space-y-5"><div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}<Button type="submit" disabled={isLoading || !email.trim()} className="h-11 w-full rounded-lg">{isLoading ? "Sending…" : "Send reset code"}</Button></form>;
}
