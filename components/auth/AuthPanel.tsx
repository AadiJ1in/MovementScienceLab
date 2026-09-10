"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";

function authRedirectUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const url = configuredSiteUrl || window.location.origin;
  return url.endsWith("/") ? url : `${url}/`;
}

export function AuthPanel({ onUserChange }: { onUserChange: (user: User | null) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const configured = hasSupabaseConfig();

  useEffect(() => {
    if (!configured) {
      setInitializing(false);
      return;
    }

    let active = true;
    const supabase = createBrowserSupabaseClient();

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setMessage(`Could not verify the current session: ${error.message}`);
        setUser(null);
        onUserChange(null);
      } else {
        setUser(data.user);
        onUserChange(data.user);
      }
      setInitializing(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      onUserChange(nextUser);
      setInitializing(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured, onUserChange]);

  if (!configured) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        Local capture mode. Add Supabase environment variables to enable authenticated persistence.
      </div>
    );
  }

  if (initializing) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        Verifying session…
      </div>
    );
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.signOut();
    if (error) setMessage(`Could not sign out: ${error.message}`);
    setSigningOut(false);
  }

  if (user) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Signed in as <strong>{user.email ?? user.id}</strong></span>
          <button
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
      </div>
    );
  }

  async function sendMagicLink() {
    if (sendingLink) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setSendingLink(true);
    setMessage(null);
    const { error } = await createBrowserSupabaseClient().auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: authRedirectUrl() },
    });
    setMessage(error ? error.message : "Check your email for the sign-in link.");
    setSendingLink(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-medium text-zinc-900">Sign in to save sessions</p>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void sendMagicLink();
          }}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <button
          onClick={() => void sendMagicLink()}
          disabled={!email.trim() || sendingLink}
          className="rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sendingLink ? "Sending…" : "Email link"}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-zinc-600">{message}</p>}
    </div>
  );
}
