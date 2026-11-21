import type { Metadata } from "next";
import { Suspense } from "react";
import { SallaConnectionResult } from "@/components/features/connections/SallaConnectionResult";

export const metadata: Metadata = { title: "Salla connection | Tarmeez" };

export default function SallaConnectionResultRoute() {
  return <Suspense fallback={<ResultFallback />}><SallaConnectionResult /></Suspense>;
}

function ResultFallback() {
  return <main className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-6"><p role="status" className="text-sm text-muted-foreground">Checking your Salla connection…</p></main>;
}
