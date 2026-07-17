"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, C, El } from "@/components/ui.js";

export function ProductShell({ children, email, onSignOut, showNavigation = false, wide = false }) {
  const pathname = usePathname();
  const links = [
    { href: "/playground", label: "Playground" },
    { href: "/account", label: "Account" },
    { href: "/docs", label: "Docs" },
  ];
  const visibleLinks = email ? links : links.filter((link) => link.href !== "/account");
  return (
    <div className="nodera-shell">
      <header className="nodera-topbar">
        <Link href="/" className="nodera-brand">
          nodera<span>_</span>
        </Link>
        {email || showNavigation ? (
          <nav aria-label="Customer navigation" className="nodera-nav-links">
            {visibleLinks.map((link) => (
              <Link
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
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
      <main className={`nodera-page${wide ? " is-wide" : ""}`}>{children}</main>
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
