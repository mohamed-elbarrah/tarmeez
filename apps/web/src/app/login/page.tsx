import Link from "next/link";
import { AuthCard } from "@/components/features/auth/AuthCard";
import { LoginForm } from "@/components/features/auth/LoginForm";

export const metadata = { title: "Sign in | Tarmeez" };

export default function LoginPage() {
  return <AuthCard title="Welcome back" description="Sign in to your Tarmeez workspace and pick up where you left off." footer={<>New to Tarmeez? <Link className="font-medium text-primary hover:underline" href="/register">Create an account</Link></>}><LoginForm /></AuthCard>;
}
