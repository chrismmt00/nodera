"use client";

import { useEffect, useState } from "react";
import { ModelRunner } from "@/components/model-runner.js";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { Button, C, El, Panel } from "@/components/ui.js";
import { api, devLogin, logout, whoAmI } from "@/lib/client/api.js";

export default function PlaygroundPage() {
  const [view, setView] = useState({ state: "loading", user: null, models: [], error: null });

  useEffect(() => {
    let canceled = false;
    whoAmI()
      .then(async (user) => ({ user, models: user.authenticated ? (await api.models()).models : [] }))
      .then(({ user, models }) => {
        if (!canceled) setView({ state: "ready", user, models, error: null });
      })
      .catch((error) => {
        if (!canceled) setView({ state: "error", user: null, models: [], error: error.message });
      });
    return () => {
      canceled = true;
    };
  }, []);

  async function signOut() {
    await logout();
    location.reload();
  }

  if (view.state === "loading") {
    return <ProductShell><PageState title="Loading your workspace..." /></ProductShell>;
  }
  if (view.state === "error") {
    return (
      <ProductShell>
        <PageState title="The playground could not load" tone="error">{view.error}</PageState>
      </ProductShell>
    );
  }
  if (!view.user.authenticated) {
    return <ProductShell><SignIn /></ProductShell>;
  }

  return (
    <ProductShell email={view.user.email} onSignOut={signOut}>
      <div className="nodera-page-heading">
        <div>
          <El as="h1" s="font-size:20px;font-weight:700;margin:0">Playground</El>
          <El s={`font-size:13px;color:${C.dim};margin-top:4px`}>Choose a model, describe the result, and follow the live job status.</El>
        </div>
      </div>
      <ModelRunner models={view.models} />
    </ProductShell>
  );
}

function SignIn() {
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
        <El as="h1" s="font-size:18px;font-weight:700;margin:0">Sign in to run a model</El>
        <El s={`color:${C.dim};font-size:13px;line-height:1.5;margin-top:6px`}>
          Your workspace and first API key are created automatically.
        </El>
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
          <Button type="submit" busy={busy} variant="secondary">{busy ? "Signing in..." : "Dev sign in"}</Button>
        </form>
        {error ? <El role="alert" s={`color:${C.red};font-size:13px;margin-top:10px`}>{error}</El> : null}
      </Panel>
    </div>
  );
}
