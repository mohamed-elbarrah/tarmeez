import Link from "next/link";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { VerifyEmailForm } from "@/components/features/auth/VerifyEmailForm";

export const metadata = { title: "Verify email | Tarmeez" };

interface VerifyEmailPageProps { searchParams: Promise<{ email?: string }> }

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { email = "" } = await searchParams;
  const safeEmail = email.trim().toLowerCase();
  return <AuthCard title="Check your email" description="One quick step to finish setting up your account." footer={<>Entered the wrong email? <Link className="font-medium text-primary hover:underline" href="/register">Go back</Link></>}>
    {safeEmail ? <VerifyEmailForm email={safeEmail} /> : <div className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">The verification link is missing an email address.</p><Link href="/register" className="text-sm font-medium text-primary hover:underline">Return to create account</Link></div>}
  </AuthCard>;
}
