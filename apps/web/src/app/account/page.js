"use client";

import { useEffect, useState } from "react";
import { ProductShell, PageState } from "@/components/product-shell.js";
import { SignInCard } from "@/components/sign-in-card.js";
import { Button, C, El, Panel, StatusDot, humanStatus } from "@/components/ui.js";
import { account, api, logout, whoAmI } from "@/lib/client/api.js";

export default function AccountPage() {
  const [view, setView] = useState({ state: "loading", user: null, keys: [], jobs: [], error: null });

  useEffect(() => {
    let canceled = false;
    whoAmI()
      .then(async (user) => {
        if (!user.authenticated) return { user, keys: [], jobs: [] };
        const [keyData, jobData] = await Promise.all([account.keys(), api.jobs("?limit=5")]);
        return { user, keys: keyData.api_keys, jobs: jobData.jobs };
      })
      .then(({ user, keys, jobs }) => {
        if (!canceled) setView({ state: "ready", user, keys, jobs, error: null });
      })
      .catch((error) => {
        if (!canceled) setView({ state: "error", user: null, keys: [], jobs: [], error: error.message });
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
    return <ProductShell><PageState title="Loading your account..." /></ProductShell>;
  }
  if (view.state === "error") {
    return <ProductShell><PageState title="Your account could not load" tone="error">{view.error}</PageState></ProductShell>;
  }
  if (!view.user.authenticated) {
    return (
      <ProductShell>
        <SignInCard title="Sign in to manage your account" description="Create and revoke API keys, and review your recent jobs." />
      </ProductShell>
    );
  }

  return (
    <ProductShell email={view.user.email} onSignOut={signOut}>
      <div className="nodera-page-heading">
        <div>
          <El as="h1" s="font-size:20px;font-weight:700;margin:0">Account</El>
          <El s={`font-size:13px;color:${C.dim};margin-top:4px`}>Manage access to your workspace and review recent activity.</El>
        </div>
      </div>
      <div className="nodera-account-layout">
        <ApiKeysPanel initialKeys={view.keys} />
        <RecentJobs jobs={view.jobs} />
      </div>
    </ProductShell>
  );
}

function ApiKeysPanel({ initialKeys }) {
  const [keys, setKeys] = useState(initialKeys);
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function createKey(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await account.createKey(label);
      setKeys((current) => [created.api_key, ...current]);
      setRevealed({ id: created.api_key.key_id, plaintext: created.plaintext });
      setLabel("");
      setCopied(false);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopied(true);
    } catch {
      setError("Your browser blocked copying. Select the key and copy it manually.");
    }
  }

  async function revokeKey(id) {
    setBusy(true);
    setError(null);
    try {
      const result = await account.revokeKey(id);
      setKeys((current) => current.map((key) => (key.key_id === id ? result.api_key : key)));
      if (revealed?.id === id) setRevealed(null);
      setConfirmId(null);
    } catch (revokeError) {
      setError(revokeError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel s="overflow:hidden">
      <div className="nodera-section-heading">
        <div>
          <El s="font-size:15px;font-weight:700">API keys</El>
          <El s={`font-size:12px;color:${C.dim};margin-top:3px`}>New keys are shown once. Revocation takes effect immediately.</El>
        </div>
      </div>

      <form className="nodera-key-form" onSubmit={createKey}>
        <label htmlFor="key-label" className="nodera-field-label">Key label</label>
        <div>
          <input
            id="key-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="nodera-input"
            placeholder="e.g. production workflow"
            maxLength={64}
            required
          />
          <Button type="submit" busy={busy}>Create key</Button>
        </div>
      </form>

      {revealed ? (
        <div className="nodera-key-reveal" aria-live="polite">
          <El s={`font-size:12px;font-weight:600;color:${C.green}`}>Copy this key now. It will not be shown again.</El>
          <code>{revealed.plaintext}</code>
          <Button type="button" variant="secondary" onClick={copyKey}>{copied ? "Copied" : "Copy key"}</Button>
        </div>
      ) : null}

      {error ? <El role="alert" s={`color:${C.red};font-size:12px;padding:0 18px 12px`}>{error}</El> : null}

      <div className="nodera-key-list">
        {keys.length === 0 ? (
          <El s={`color:${C.dim};font-size:13px;padding:18px`}>No API keys yet.</El>
        ) : keys.map((key) => {
          const revoked = Boolean(key.revoked_at);
          return (
            <div className="nodera-key-row" key={key.key_id}>
              <div>
                <El s="font-size:13px;font-weight:600">{key.label}</El>
                <El s={`font-size:11px;color:${C.dim};margin-top:3px`}>Created {formatDate(key.created_at)}</El>
              </div>
              <El s={`display:flex;align-items:center;gap:7px;font-size:12px;color:${revoked ? C.dim : C.green}`}>
                <StatusDot color={revoked ? C.faint : C.green} />
                {revoked ? "Revoked" : "Active"}
              </El>
              <div className="nodera-key-action">
                {revoked ? null : confirmId === key.key_id ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => setConfirmId(null)}>Keep</Button>
                    <Button
                      type="button"
                      busy={busy}
                      onClick={() => revokeKey(key.key_id)}
                      style={{ background: C.red, borderColor: C.red, color: "#1a0805" }}
                    >
                      Revoke now
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setConfirmId(key.key_id)}>Revoke</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function RecentJobs({ jobs }) {
  return (
    <Panel s="overflow:hidden">
      <div className="nodera-section-heading">
        <div>
          <El s="font-size:15px;font-weight:700">Recent jobs</El>
          <El s={`font-size:12px;color:${C.dim};margin-top:3px`}>Newest activity from the public jobs API.</El>
        </div>
      </div>
      {jobs.length === 0 ? (
        <El s={`color:${C.dim};font-size:13px;padding:18px`}>No jobs yet. Your first playground run will appear here.</El>
      ) : (
        <div className="nodera-recent-jobs">
          {jobs.map((job) => (
            <div className="nodera-job-row" key={job.job_id}>
              <El s="display:flex;align-items:center;gap:8px;font-size:12px">
                <StatusDot color={statusColor(job.status)} pulse={!job.finalized_at} />
                {humanStatus(job.status)}
              </El>
              <El s={`font-size:12px;color:${C.text}`}>{job.model}</El>
              <El s={`font-size:11px;color:${C.dim};text-align:right`}>{formatDate(job.created_at)}</El>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function statusColor(status) {
  if (status === "succeeded") return C.green;
  if (status === "failed" || status === "canceled") return C.red;
  return C.accent;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
