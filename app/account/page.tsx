"use client";

import { useCallback, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel } from "@/components/auth/AuthPanel";

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const handleUserChange = useCallback((next: User | null) => setUser(next), []);

  return (
    <main className="min-h-screen bg-[#f5f5f2] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          {user ? "Your Movement Science account" : "Sign in to save and compare assessments"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
          Sign in with your email to save sessions, build a personal movement baseline, and review compatible progress over time. Camera assessment can still run locally without an account.
        </p>

        <div className="mt-8 border border-zinc-200 bg-white p-5 sm:p-7">
          <AuthPanel onUserChange={handleUserChange} />
        </div>

        <div className="mt-6 grid gap-px bg-zinc-200 sm:grid-cols-3">
          {[
            ["Saved sessions", "Keep compatible movement assessments tied to your account."],
            ["Personal baseline", "Compare measurements with your own prior sessions rather than a generic score."],
            ["Privacy", "Camera video is processed in the browser by default; the assessment does not require video upload."],
          ].map(([title, text]) => (
            <section key={title} className="bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
