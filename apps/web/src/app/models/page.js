"use client";

import { useEffect, useState } from "react";
import { ModelGallery } from "@/components/model-gallery.js";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { SignInCard } from "@/components/sign-in-card.js";
import { C, El } from "@/components/ui.js";
import { api, logout, whoAmI } from "@/lib/client/api.js";

export default function ModelsPage() {
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
    return <ProductShell showNavigation><PageState title="Loading models..." /></ProductShell>;
  }
  if (view.state === "error") {
    return (
      <ProductShell showNavigation>
        <PageState title="Models could not load" tone="error">{view.error}</PageState>
      </ProductShell>
    );
  }
  if (!view.user.authenticated) {
    return (
      <ProductShell showNavigation>
        <SignInCard title="Sign in to browse models" description="Pick a menu model and run it from the same public API your apps use." />
      </ProductShell>
    );
  }

  return (
    <ProductShell email={view.user.email} onSignOut={signOut} wide>
      <div className="nodera-page-heading">
        <div>
          <El as="h1" s="font-size:20px;font-weight:700;margin:0">Models</El>
          <El s={`font-size:13px;color:${C.dim};margin-top:4px`}>Pick an active model, describe the result, and start a job.</El>
        </div>
      </div>
      <ModelGallery models={view.models} />
    </ProductShell>
  );
}
