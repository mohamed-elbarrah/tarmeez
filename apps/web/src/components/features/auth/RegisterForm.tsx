"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegisterMutation } from "@/services/authApi";
import { getApiErrorMessage } from "@/lib/api-error";

interface RegisterFormProps { invitationToken?: string }

export function RegisterForm({ invitationToken }: RegisterFormProps) {
  const router = useRouter();
  const [register, { isLoading, error }] = useRegisterMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await register({ name: name.trim(), email: email.trim().toLowerCase(), password, ...(invitationToken ? { invitationToken } : {}) }).unwrap();
      if (result.emailVerificationRequired) router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch { /* Error is rendered from the mutation state. */ }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2"><label htmlFor="name" className="text-sm font-medium">Your name</label><input id="name" name="name" type="text" autoComplete="name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
      <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Work email</label><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /></div>
      <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="h-11 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20" /><p className="text-xs text-muted-foreground">Use at least 8 characters.</p></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">{getApiErrorMessage(error)}</p>}
      <Button type="submit" disabled={isLoading || !name.trim() || !email.trim() || password.length < 8} className="h-11 w-full rounded-lg text-sm">{isLoading ? "Creating account…" : "Create account"}{!isLoading && <ArrowRight className="ml-2 size-4" />}</Button>
      <p className="px-2 text-center text-xs leading-5 text-muted-foreground">We’ll send a verification code to confirm your email.</p>
    </form>
  );
}
