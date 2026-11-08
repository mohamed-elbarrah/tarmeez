import Link from "next/link";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/features/auth/ForgotPasswordForm";

export const metadata = { title: "Reset password | Tarmeez" };

export default function ForgotPasswordPage() {
  return <AuthCard title="Forgot your password?" description="Enter the email address associated with your account and we’ll send a reset code." footer={<Link className="font-medium text-primary hover:underline" href="/login">Back to sign in</Link>}><ForgotPasswordForm /></AuthCard>;
}
