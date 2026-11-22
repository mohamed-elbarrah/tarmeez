import Link from "next/link";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { RegisterForm } from "@/components/features/auth/RegisterForm";

export const metadata = { title: "Create account | Tarmeez" };

interface RegisterPageProps { searchParams: Promise<{ invitationToken?: string }> }

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { invitationToken } = await searchParams;
  return <AuthCard title={invitationToken ? "Join your team" : "Create your account"} description={invitationToken ? "Create an account to accept your Tarmeez workspace invitation." : "Start bringing your commerce data into clearer focus."} footer={<>Already have an account? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link></>}><RegisterForm invitationToken={invitationToken} /></AuthCard>;
}
