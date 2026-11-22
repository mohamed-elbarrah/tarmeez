import { Suspense } from "react";
import { MetaConnectionResult } from "@/components/features/connections/MetaConnectionResult";

export const metadata = { title: "Connect Meta Ads — Tarmeez" };

export default function MetaConnectionResultPage() {
  return <Suspense fallback={<main className="mx-auto max-w-xl px-6 py-16"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></main>}><MetaConnectionResult /></Suspense>;
}
