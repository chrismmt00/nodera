"use client";

// Shared styling helpers, extracted from NoderaApp (the design import) so real
// pages speak the same visual language: inline CSS strings parsed to React
// style objects, plus the design's color tokens. No new UI library.
import { useState } from "react";

export function css(str) {
  const out = {};
  if (!str) return out;
  for (const decl of String(str).split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const value = decl.slice(i + 1).trim();
    const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = value;
  }
  return out;
}

export function El({ as: Tag = "div", s, sh, children, ...rest }) {
  const [hov, setHov] = useState(false);
  const style = sh ? { ...css(s), ...(hov ? css(sh) : {}) } : css(s);
  const hoverProps = sh
    ? { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false) }
    : null;
  return (
    <Tag style={style} {...hoverProps} {...rest}>
      {children}
    </Tag>
  );
}

export const C = {
  bg: "#07080c",
  panel: "#0d0f16",
  panel2: "#11141d",
  border: "#1e2431",
  text: "#e8ecf4",
  dim: "#8b93a7",
  faint: "#4a5164",
  accent: "#5de6ff",
  green: "#7cf5a8",
  amber: "#ffcf70",
  red: "#ff8080",
};

export function Panel({ children, s = "", ...rest }) {
  return (
    <El
      s={`border:1px solid ${C.border};border-radius:12px;background:rgba(255,255,255,.03);${s}`}
      {...rest}
    >
      {children}
    </El>
  );
}

export function Button({ children, busy = false, variant = "primary", style, ...rest }) {
  const primary = variant === "primary";
  const base = css(
    `border-radius:9px;padding:9px 18px;font:inherit;font-size:13px;font-weight:600;` +
      `border:1px solid ${primary ? C.accent : C.border};` +
      `background:${primary ? C.accent : C.panel2};` +
      `color:${primary ? "#06121a" : C.text};cursor:${busy ? "wait" : "pointer"};` +
      `opacity:${busy ? ".65" : "1"}`
  );
  return (
    <button disabled={busy || rest.disabled} style={{ ...base, ...style }} {...rest}>
      {children}
    </button>
  );
}

export function StatusDot({ color = C.accent, pulse = false }) {
  return (
    <span
      aria-hidden="true"
      style={css(
        `display:inline-block;width:7px;height:7px;flex:0 0 7px;border-radius:50%;` +
          `background:${color};box-shadow:0 0 10px ${color};` +
          `${pulse ? "animation:npulse 1.4s infinite" : ""}`
      )}
    />
  );
}

// Human-readable job status (never show a raw enum alone — USER-STORIES C4).
export function humanStatus(status) {
  return (
    {
      queued: "Waiting for an available machine…",
      assigned: "Assigned to a machine…",
      running: "Running…",
      succeeded: "Done",
      failed: "Failed",
      canceled: "Canceled",
    }[status] || status
  );
}
