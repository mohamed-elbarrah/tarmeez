"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLoginMutation } from "@/services/authApi";
import { getApiErrorMessage } from "@/lib/api-error";

export function LoginForm() {
  const router = useRouter();
  const [login, { isLoading, error }] = useLoginMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const session = await login({ email: email.trim().toLowerCase(), password }).unwrap();
      router.replace(session.user.role === "MERCHANT" ? "/dashboard" : "/welcome");
    } catch { /* Error is rendered from the mutation state. */ }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email address</label><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><label htmlFor="password" className="text-sm font-medium">Password</label><a href="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</a></div><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}
      <Button type="submit" disabled={isLoading || !email.trim() || !password} className="h-11 w-full rounded-lg text-sm">{isLoading ? "Signing in…" : "Sign in"}{!isLoading && <ArrowRight className="ml-2 size-4" />}</Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" /> Your account is protected with secure authentication</p>
    </form>
  );
}
