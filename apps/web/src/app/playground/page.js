"use client";

import { useEffect, useState } from "react";
import { ModelRunner } from "@/components/model-runner.js";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { SignInCard } from "@/components/sign-in-card.js";
import { C, El } from "@/components/ui.js";
import { api, logout, whoAmI } from "@/lib/client/api.js";

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
    return <ProductShell><SignInCard title="Sign in to run a model" /></ProductShell>;
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
