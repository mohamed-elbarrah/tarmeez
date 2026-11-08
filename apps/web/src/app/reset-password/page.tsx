import Link from "next/link";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { ResetPasswordForm } from "@/components/features/auth/ResetPasswordForm";

export const metadata = { title: "Choose a new password | Tarmeez" };

interface ResetPasswordPageProps { searchParams: Promise<{ email?: string }> }

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { email = "" } = await searchParams;
  return <AuthCard title="Choose a new password" description="Use the code we emailed you to securely reset your password." footer={<Link className="font-medium text-primary hover:underline" href="/login">Back to sign in</Link>}><ResetPasswordForm initialEmail={email.trim().toLowerCase()} /></AuthCard>;
}
