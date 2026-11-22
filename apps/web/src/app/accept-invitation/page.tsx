import Link from "next/link";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { AcceptInvitationForm } from "@/components/features/auth/AcceptInvitationForm";

export const metadata = { title: "Accept invitation | Tarmeez" };

interface AcceptInvitationPageProps { searchParams: Promise<{ invitationToken?: string }> }

export default async function AcceptInvitationPage({ searchParams }: AcceptInvitationPageProps) {
  const { invitationToken = "" } = await searchParams;
  return <AuthCard title="Join your workspace" description="Sign in to accept the invitation sent to your email address." footer={<>New to Tarmeez? <Link className="font-medium text-primary hover:underline" href={invitationToken ? `/register?invitationToken=${encodeURIComponent(invitationToken)}` : "/register"}>Create an account</Link></>}>
    {invitationToken ? <AcceptInvitationForm invitationToken={invitationToken} /> : <p role="alert" className="text-sm text-destructive">This invitation link is missing its invitation token. Open the link from your invitation email again.</p>}
  </AuthCard>;
}
