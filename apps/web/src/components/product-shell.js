"use client";

import Link from "next/link";
import { Button, C, El, css } from "@/components/ui.js";

export function ProductShell({ children, email, onSignOut }) {
  return (
    <div className="nodera-shell">
      <header className="nodera-topbar">
        <Link href="/" className="nodera-brand">
          nodera<span>_</span>
        </Link>
        {email ? (
          <nav aria-label="Customer navigation" className="nodera-nav-links">
            <Link href="/playground" aria-current="page">Playground</Link>
          </nav>
        ) : null}
        <El s="flex:1" />
        {email ? (
          <div className="nodera-account">
            <span title={email}>{email}</span>
            <Button variant="secondary" onClick={onSignOut}>Sign out</Button>
          </div>
        ) : null}
      </header>
      <main className="nodera-page">{children}</main>
    </div>
  );
}

export function PageState({ title, children, tone = "default" }) {
  const color = tone === "error" ? C.red : C.dim;
  return (
    <div className="nodera-centered-state">
      <El s="font-size:15px;font-weight:600">{title}</El>
      {children ? <El s={`font-size:13px;color:${color};margin-top:6px;line-height:1.5`}>{children}</El> : null}
    </div>
  );
}
