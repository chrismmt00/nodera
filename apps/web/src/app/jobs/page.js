"use client";

import { useEffect, useState } from "react";
import { JobsDashboard } from "@/components/jobs-dashboard.js";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { SignInCard } from "@/components/sign-in-card.js";
import { C, El } from "@/components/ui.js";
import { api, logout, whoAmI } from "@/lib/client/api.js";

export default function JobsPage() {
  const [view, setView] = useState({ state: "loading", user: null, jobs: [], error: null });

  useEffect(() => {
    let canceled = false;
    whoAmI()
      .then(async (user) => ({ user, jobs: user.authenticated ? (await api.jobs("?limit=20")).jobs : [] }))
      .then(({ user, jobs }) => {
        if (!canceled) setView({ state: "ready", user, jobs, error: null });
      })
      .catch((error) => {
        if (!canceled) setView({ state: "error", user: null, jobs: [], error: error.message });
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
    return <ProductShell showNavigation><PageState title="Loading jobs..." /></ProductShell>;
  }
  if (view.state === "error") {
    return (
      <ProductShell showNavigation>
        <PageState title="Jobs could not load" tone="error">{view.error}</PageState>
      </ProductShell>
    );
  }
  if (!view.user.authenticated) {
    return (
      <ProductShell showNavigation>
        <SignInCard title="Sign in to view jobs" description="Watch live statuses and review your workspace activity." />
      </ProductShell>
    );
  }

  return (
    <ProductShell email={view.user.email} onSignOut={signOut} wide>
      <div className="nodera-page-heading">
        <div>
          <El as="h1" s="font-size:20px;font-weight:700;margin:0">Jobs</El>
          <El s={`font-size:13px;color:${C.dim};margin-top:4px`}>Newest workspace activity, refreshed automatically.</El>
        </div>
      </div>
      <JobsDashboard initialJobs={view.jobs} poll />
    </ProductShell>
  );
}
