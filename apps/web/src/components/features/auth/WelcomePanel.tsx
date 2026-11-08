"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, Store } from "lucide-react";
import { useGetMeQuery, useLogoutMutation } from "@/services/authApi";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/common/Brand";

export function WelcomePanel() {
  const router = useRouter();
  const { data: principal, isLoading, isError, refetch } = useGetMeQuery();
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();

  async function handleLogout() {
    try { await logout().unwrap(); } catch { /* Client credentials are cleared even if the server is unavailable. */ }
    router.replace("/login");
  }

  return <main className="min-h-screen bg-muted/30">
    <header className="flex items-center justify-between border-b bg-background px-6 py-5 sm:px-10"><Brand /><Button variant="outline" className="h-9 rounded-lg" onClick={handleLogout} disabled={isLoggingOut}><LogOut className="mr-2 size-4" />{isLoggingOut ? "Signing out…" : "Sign out"}</Button></header>
    <section className="mx-auto max-w-3xl px-6 py-16 sm:px-10 sm:py-24">
      {isLoading && <div role="status" aria-label="Loading your account" className="animate-pulse space-y-4"><div className="h-8 w-64 rounded bg-muted"/><div className="h-4 w-80 rounded bg-muted"/><div className="mt-8 h-36 rounded-xl bg-muted"/></div>}
      {isError && <div className="rounded-xl border bg-background p-7"><h1 className="text-xl font-semibold">We couldn’t load your account</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Your session may have expired, or the service may be temporarily unavailable.</p><p role="alert" className="mt-3 text-sm text-destructive">Your sign-in may have expired. Please sign in again.</p><div className="mt-6 flex gap-3"><Button onClick={() => void refetch()} variant="outline">Try again</Button><Button asChild><Link href="/login">Sign in</Link></Button></div></div>}
      {principal && <><div className="mb-8 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{principal.role === "ADMIN" ? <ShieldCheck className="size-6" /> : <Store className="size-6" />}</div><p className="text-sm font-medium text-primary">You’re signed in</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Welcome to Tarmeez</h1><p className="mt-3 text-base text-muted-foreground">Your role is <span className="font-medium text-foreground">{principal.role === "ADMIN" ? "Administrator" : "Merchant"}</span>.</p><div className="mt-8 rounded-xl border bg-background p-6"><h2 className="font-semibold">Your workspace is ready</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">This is your signed-in landing page. We’ll bring your dashboard tools here next.</p></div></>}
    </section>
  </main>;
}
