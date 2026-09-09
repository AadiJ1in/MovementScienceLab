"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";

export function AuthPanel({ onUserChange }: { onUserChange: (user: User | null) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const configured = hasSupabaseConfig();

  useEffect(() => {
    if (!configured) return;
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      onUserChange(data.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      onUserChange(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [configured, onUserChange]);

  if (!configured) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        Local capture mode. Add Supabase environment variables to enable authenticated persistence.
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
        <span>Signed in as <strong>{user.email ?? user.id}</strong></span>
        <button
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5"
          onClick={() => createBrowserSupabaseClient().auth.signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  async function sendMagicLink() {
    setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-medium text-zinc-900">Sign in to save sessions</p>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <button
          onClick={sendMagicLink}
          disabled={!email}
          className="rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          Email link
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
