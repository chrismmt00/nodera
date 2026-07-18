"use client";

import { useEffect, useState } from "react";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { SignInCard } from "@/components/sign-in-card.js";
import { UsageDashboard } from "@/components/usage-dashboard.js";
import { C, El } from "@/components/ui.js";
import { account, logout, whoAmI } from "@/lib/client/api.js";

export default function UsagePage() {
  const [view, setView] = useState({ state: "loading", user: null, report: null, error: null });

  useEffect(() => {
    let canceled = false;
    whoAmI()
      .then(async (user) => ({ user, report: user.authenticated ? await account.usage() : null }))
      .then(({ user, report }) => {
        if (!canceled) setView({ state: "ready", user, report, error: null });
      })
      .catch((error) => {
        if (!canceled) setView({ state: "error", user: null, report: null, error: error.message });
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
    return <ProductShell showNavigation><PageState title="Loading usage..." /></ProductShell>;
  }
  if (view.state === "error") {
    return (
      <ProductShell showNavigation>
        <PageState title="Usage could not load" tone="error">{view.error}</PageState>
      </ProductShell>
    );
  }
  if (!view.user.authenticated) {
    return (
      <ProductShell showNavigation>
        <SignInCard title="Sign in to view usage" description="Review metered jobs, tokens, images, and compute time for your workspace." />
      </ProductShell>
    );
  }

  return (
    <ProductShell email={view.user.email} onSignOut={signOut} wide>
      <div className="nodera-page-heading">
        <div>
          <El as="h1" s="font-size:20px;font-weight:700;margin:0">Usage</El>
          <El s={`font-size:13px;color:${C.dim};margin-top:4px`}>
            {view.report.period.label} metering for jobs finalized this month.
          </El>
        </div>
      </div>
      <UsageDashboard report={view.report} />
    </ProductShell>
  );
}
