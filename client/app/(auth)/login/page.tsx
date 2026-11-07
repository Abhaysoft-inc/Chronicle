import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
import { RedirectIfAuthed } from "@/features/auth/require-auth";

export const metadata: Metadata = { title: "Sign in · Chronicle" };

export default function LoginPage() {
  return (
    <RedirectIfAuthed>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted">Sign in to continue to your cases.</p>
      <AuthForm mode="login" />
    </RedirectIfAuthed>
  );
}
