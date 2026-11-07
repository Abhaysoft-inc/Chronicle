import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
import { RedirectIfAuthed } from "@/features/auth/require-auth";

export const metadata: Metadata = { title: "Create account · Chronicle" };

export default function SignupPage() {
  return (
    <RedirectIfAuthed>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted">Start turning records into a timeline an expert can trust.</p>
      <AuthForm mode="signup" />
    </RedirectIfAuthed>
  );
}
