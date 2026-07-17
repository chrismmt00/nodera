"use client";

import { useState } from "react";
import { devLogin } from "@/lib/client/api.js";
import { Button, C, El, Panel } from "@/components/ui.js";

export function SignInCard({
  title = "Sign in to Nodera",
  description = "Your workspace and first API key are created automatically.",
}) {
  const [email, setEmail] = useState("you@example.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleDevLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await devLogin(email);
      location.reload();
    } catch (loginError) {
      setError(loginError.message);
      setBusy(false);
    }
  }

  return (
    <div className="nodera-signin-wrap">
      <Panel s="padding:26px;max-width:420px;width:100%">
        <El as="h1" s="font-size:18px;font-weight:700;margin:0">{title}</El>
        <El s={`color:${C.dim};font-size:13px;line-height:1.5;margin-top:6px`}>{description}</El>
        <a href="/api/auth/google/start" className="nodera-google-button">Continue with Google</a>
        <El s={`border-top:1px solid ${C.border};padding-top:16px;margin-top:18px;color:${C.faint};font-size:11px`}>
          Local development
        </El>
        <form onSubmit={handleDevLogin} className="nodera-dev-login">
          <label htmlFor="dev-email" className="nodera-field-label">Email</label>
          <input
            id="dev-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="nodera-input"
            required
          />
          <Button type="submit" busy={busy} variant="secondary">
            {busy ? "Signing in..." : "Dev sign in"}
          </Button>
        </form>
        {error ? <El role="alert" s={`color:${C.red};font-size:13px;margin-top:10px`}>{error}</El> : null}
      </Panel>
    </div>
  );
}
