"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { JobDetail } from "@/components/job-detail.js";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { SignInCard } from "@/components/sign-in-card.js";
import { api, logout, whoAmI } from "@/lib/client/api.js";

export default function JobDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [view, setView] = useState({ state: "loading", user: null, job: null, error: null });

  useEffect(() => {
    if (!id) return undefined;
    let canceled = false;
    whoAmI()
      .then(async (user) => ({ user, job: user.authenticated ? await api.job(id) : null }))
      .then(({ user, job }) => {
        if (!canceled) setView({ state: "ready", user, job, error: null });
      })
      .catch((error) => {
        if (!canceled) setView({ state: "error", user: null, job: null, error: error.message });
      });
    return () => {
      canceled = true;
    };
  }, [id]);

  async function signOut() {
    await logout();
    location.reload();
  }

  if (view.state === "loading") {
    return <ProductShell showNavigation><PageState title="Loading job..." /></ProductShell>;
  }
  if (view.state === "error") {
    return (
      <ProductShell showNavigation>
        <PageState title="Job could not load" tone="error">{view.error}</PageState>
      </ProductShell>
    );
  }
  if (!view.user.authenticated) {
    return (
      <ProductShell showNavigation>
        <SignInCard title="Sign in to view this job" description="Open results, inputs, and downloads for your workspace." />
      </ProductShell>
    );
  }

  return (
    <ProductShell email={view.user.email} onSignOut={signOut} wide>
      <JobDetail initialJob={view.job} />
    </ProductShell>
  );
}
