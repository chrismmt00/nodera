"use client";

/*
 * NoderaApp — faithful React port of "Nodera Prototype.dc.html" (design import).
 *
 * This is the interactive product prototype: a single-page app that walks
 * through every customer, provider, and operator screen with simulated state
 * (there is no live control-plane API yet — Phases 1+ in docs/TASKS.md). The
 * markup, styling, copy, and interaction model mirror the design 1:1.
 *
 * Styling is kept as inline strings (as in the design) and parsed into React
 * style objects by `css()`. `El` is a tiny box element that adds hover styles.
 */

import { Fragment, useEffect, useRef, useState } from "react";

/* Parse an inline CSS declaration string into a React style object. */
function css(str) {
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

/* Box element: base style `s`, optional hover style `sh`, any tag via `as`. */
function El({ as: Tag = "div", s, sh, children, ...rest }) {
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

const CART_EMAIL =
  "Hi Sam,\nJust a quick note — the items in your cart are still waiting for you. If anything held you back, reply and I'll help you sort it out.\n\nWarmly,\nThe Shop Team";

/* Impure id/random helpers live at module scope (outside the component) so they
 * stay out of render purity analysis — they're only ever called from handlers. */
function randomJobId() {
  return "job_" + Math.random().toString(36).slice(2, 8);
}
function randomKeySuffix() {
  return Math.random().toString(36).slice(2, 6);
}
function randomFreshKey() {
  return "nod_live_" + Math.random().toString(36).slice(2, 18);
}
function uniqueId() {
  return Date.now();
}

function seedJobs() {
  return [
    {
      id: "job_2x8d43",
      status: "succeeded",
      model: "llama",
      source: "playground",
      prompt:
        "Write a friendly follow-up email to a customer who left items in their cart.",
      when: "2m",
      duration: "8.4s",
      usage: "311 tokens · 8.4s compute · attempt 1 of 3",
      text: CART_EMAIL,
    },
    {
      id: "job_5rw882",
      status: "succeeded",
      model: "llama",
      source: "api",
      prompt: "Summarize this support ticket and suggest a reply.",
      when: "6m",
      duration: "5.8s",
      usage: "198 tokens · 5.8s compute · attempt 1 of 3",
      text: "Summary: customer reports duplicate charge on order #3341. Suggested reply drafted and delivered to your workflow via webhook.",
    },
    {
      id: "job_9f3k21",
      status: "succeeded",
      model: "sdxl",
      source: "playground",
      prompt: "A cozy cabin in snowy woods at dusk, warm light in the windows",
      when: "10m",
      duration: "41s",
      usage: "1 image · 41s compute · attempt 1 of 3",
    },
    {
      id: "job_7pq105",
      status: "failed",
      model: "llama",
      source: "api",
      prompt: "Generate 50 product descriptions for the fall catalog",
      when: "1d",
      duration: "",
      usage: "0 tokens · stopped at 120s · attempt 3 of 3",
      errorCode: "deadline_exceeded",
      errorSentence: "This took too long and was stopped — try again.",
    },
  ];
}

const INITIAL = {
  screen: "landing", // landing signin playground jobs jobdetail models keys connect billing providerstart link machine agent ops
  persona: "customer", // customer | provider
  // playground
  model: "llama",
  prompt:
    "Write a friendly follow-up email to a customer who left items in their cart.",
  promptError: false,
  modelMenuOpen: false,
  optionsOpen: false,
  maxTokens: "512",
  imgSize: "1024",
  runPhase: "idle", // idle sent waiting running done
  lastRun: null,
  // jobs
  jobFilter: "All",
  jobs: [],
  detailJobId: null,
  devDetailsOpen: false,
  // keys
  keys: [{ id: 1, label: "Default key", masked: "nod_••••••••4f2a", created: "Jul 10" }],
  keyModalOpen: false,
  keyModalStage: 1,
  newKeyLabel: "",
  freshKey: "",
  revokeModalOpen: false,
  revokeTargetId: null,
  // drawer
  automateOpen: false,
  snippetTab: "curl",
  keyInserted: false,
  copiedSnippet: false,
  copiedKey: false,
  copiedFresh: false,
  testEventSent: false,
  // provider
  earning: true,
  agentElapsedSec: 134,
  sdxlPct: 62,
  linked: false,
  // ops
  providerApproved: false,
  toast: "",
  toastNonce: 0,
};

export default function NoderaApp() {
  const [state, setState] = useState(() => ({ ...INITIAL, jobs: seedJobs() }));

  const patch = (u) =>
    setState((s) => ({ ...s, ...(typeof u === "function" ? u(s) : u) }));

  // Live snapshot of state for the persisted API-simulation interval, which
  // outlives individual renders. Written after commit (never during render),
  // read only inside the interval callback.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Auto-dismiss the toast 2.2s after each showToast. The nonce forces this to
  // re-fire even when the same message is shown twice in a row.
  useEffect(() => {
    if (!state.toast) return undefined;
    const t = setTimeout(() => patch({ toast: "" }), 2200);
    return () => clearTimeout(t);
  }, [state.toast, state.toastNonce]);

  function go(screen, extra) {
    patch(Object.assign({ screen, modelMenuOpen: false, automateOpen: false }, extra || {}));
  }

  function showToast(msg) {
    patch((s) => ({ toast: msg, toastNonce: s.toastNonce + 1 }));
  }

  // `override` lets a re-run/retry pass the exact model+prompt so it doesn't
  // depend on a stale closure from the render that scheduled it.
  function runJob(override) {
    const cur = state;
    if (cur.runPhase === "sent" || cur.runPhase === "waiting" || cur.runPhase === "running") return;
    const model = (override && override.model) || cur.model;
    const prompt = override && override.prompt != null ? override.prompt : cur.prompt;
    if (!prompt.trim()) {
      patch({ promptError: true });
      return;
    }
    const isText = model === "llama";
    const dur = isText ? "8.4s" : "41s";
    patch({ promptError: false, runPhase: "sent", screen: "playground", model, prompt });
    setTimeout(() => patch({ runPhase: "waiting" }), 500);
    setTimeout(() => patch({ runPhase: "running" }), 2100);
    setTimeout(() => {
      const job = {
        id: randomJobId(),
        status: "succeeded",
        model,
        prompt: prompt.trim(),
        when: "now",
        duration: dur,
        usage: isText
          ? "311 tokens · 8.4s compute · attempt 1 of 3"
          : "1 image · 41s compute · attempt 1 of 3",
        text: isText ? CART_EMAIL : undefined,
      };
      patch((st) => ({ runPhase: "done", lastRun: job, jobs: [job].concat(st.jobs) }));
    }, 5600);
  }

  function buildSnippet(s) {
    const src =
      s.lastRun ||
      (s.detailJobId && s.jobs.find((j) => j.id === s.detailJobId)) ||
      s.jobs[0];
    const model = src && src.model === "sdxl" ? "sdxl-1.0" : "llama-3.1-8b";
    const p = src ? src.prompt.slice(0, 48) + (src.prompt.length > 48 ? "…" : "") : "…";
    const key = s.keyInserted ? "nod_live_8c2ma9x4kq7t3f2a" : "YOUR_API_KEY";
    if (s.snippetTab === "curl") {
      return (
        'curl -X POST https://api.nodera.example/v1/jobs \\\n' +
        '  -H "x-api-key: ' + key + '" \\\n' +
        '  -H "Content-Type: application/json" \\\n' +
        "  -d '{ \"model\": \"" + model + '",\n' +
        '        "input": { "prompt": "' + p + '" } }\''
      );
    }
    return (
      'const res = await fetch("https://api.nodera.example/v1/jobs", {\n' +
      "  method: \"POST\",\n" +
      "  headers: {\n" +
      '    "x-api-key": "' + key + '",\n' +
      '    "Content-Type": "application/json"\n' +
      "  },\n" +
      "  body: JSON.stringify({\n" +
      '    model: "' + model + '",\n' +
      '    input: { prompt: "' + p + '" }\n' +
      "  })\n" +
      "});\n" +
      "const { job_id } = await res.json();"
    );
  }

  useEffect(() => {
    const tick = setInterval(() => {
      patch((s) => {
        if (!(s.earning || s.sdxlPct < 100)) return {};
        return {
          agentElapsedSec: s.earning ? s.agentElapsedSec + 1 : s.agentElapsedSec,
          sdxlPct: s.sdxlPct < 100 ? Math.min(100, s.sdxlPct + 0.4) : 100,
        };
      });
    }, 1000);

    const apiPrompts = [
      "Write a friendly follow-up email to a customer who left items in their cart.",
      "Summarize this support ticket and suggest a reply.",
      "Write a product description for SKU 8841 (waxed canvas tote).",
    ];
    const apiSim = setInterval(() => {
      const st = stateRef.current;
      if (st.persona !== "customer") return;
      if (st.screen === "landing" || st.screen === "signin") return;
      const id = randomJobId();
      const prompt = apiPrompts[Math.floor(Math.random() * apiPrompts.length)];
      const job = { id, status: "running", model: "llama", prompt, when: "now", duration: "", usage: "", source: "api" };
      patch((s2) => ({ jobs: [job].concat(s2.jobs) }));
      showToast("Job received via API — your workflow called POST /v1/jobs");
      setTimeout(
        () =>
          patch((s2) => ({
            jobs: s2.jobs.map((j) =>
              j.id === id
                ? {
                    ...j,
                    status: "succeeded",
                    duration: "6.2s",
                    usage: "214 tokens · 6.2s compute · attempt 1 of 3",
                    text: "Done — generated automatically for your workflow. The webhook has already delivered this result back to n8n.",
                  }
                : j
            ),
          })),
        6000
      );
    }, 22000);

    return () => {
      clearInterval(tick);
      clearInterval(apiSim);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── derived values (mirrors the prototype's renderVals) ──
  const s = state;
  const sc = s.screen;
  const nav = (name) => sc === name;
  const on = "#5de6ff";
  const off = "#6b7385";
  const none = "transparent";
  const navW = (n) => (nav(n) ? "600" : "400");
  const navC = (n) => (nav(n) ? on : off);
  const navB = (n) => (nav(n) ? on : none);

  const dotFor = (st) => (st === "succeeded" ? "#7cf5a8" : st === "failed" ? "#ff7a6b" : "#ffc76b");
  const glowFor = (st) =>
    "0 0 10px " + (st === "succeeded" ? "rgba(124,245,168,.9)" : st === "failed" ? "rgba(255,122,107,.9)" : "rgba(255,199,107,.9)");
  const statusLabel = (j) =>
    j.status === "succeeded" ? "Done in " + j.duration : j.status === "failed" ? "Failed — took too long" : "Running…";
  const statusColor = (j) => (j.status === "succeeded" ? "#7cf5a8" : j.status === "failed" ? "#ff7a6b" : "#ffc76b");
  const modelName = (m) => (m === "sdxl" ? "SDXL 1.0" : "Llama 3.1 8B");
  const openJob = (id) => () => go("jobdetail", { detailJobId: id, devDetailsOpen: false });

  const jobsAll = s.jobs;
  const filterMap = {
    All: () => true,
    Running: (j) => j.status === "running",
    Done: (j) => j.status === "succeeded",
    Failed: (j) => j.status === "failed",
  };
  const filtered = jobsAll.filter(filterMap[s.jobFilter] || (() => true));
  const detail = s.detailJobId ? jobsAll.find((j) => j.id === s.detailJobId) : null;

  const phase = s.runPhase;
  const stageIdx = { idle: -1, sent: 0, waiting: 1, running: 2, done: 3 }[phase];
  const stg = (i) => {
    const active = stageIdx === i && phase !== "done";
    const passed = stageIdx > i || phase === "done";
    const color = passed ? "#7cf5a8" : active ? "#ffc76b" : "#6b7385";
    return {
      c: color,
      d: passed ? "#7cf5a8" : active ? "#ffc76b" : "transparent",
      g: passed ? "0 0 10px rgba(124,245,168,.9)" : active ? "0 0 10px rgba(255,199,107,.9)" : "none",
      a: active ? "npulse 1.2s infinite" : "none",
    };
  };
  const s1 = stg(0);
  const s2 = stg(1);
  const s3 = stg(2);
  const s4 = {
    c: phase === "done" ? "#7cf5a8" : "#6b7385",
    d: phase === "done" ? "#7cf5a8" : "transparent",
    g: phase === "done" ? "0 0 10px rgba(124,245,168,.9)" : "none",
    a: "none",
  };
  const line = (i) => (stageIdx > i || phase === "done" ? "rgba(124,245,168,.5)" : "rgba(255,255,255,.12)");
  const canRun = phase === "idle" || phase === "done";
  const isText = s.model === "llama";
  const lastRun = s.lastRun;
  const mm = Math.floor(s.agentElapsedSec / 60);
  const ss = ("0" + Math.floor(s.agentElapsedSec % 60)).slice(-2);
  const pct = Math.round(s.sdxlPct);

  const v = {
    // nav
    showNav: sc !== "landing" && sc !== "signin" && sc !== "providerstart" && sc !== "link",
    isCustomer: s.persona === "customer",
    isProvider: s.persona === "provider",
    avatarLetter: s.persona === "customer" ? "C" : "P",
    avatarBg: s.persona === "customer" ? "linear-gradient(135deg,#5de6ff,#3a7bd5)" : "linear-gradient(135deg,#7cf5a8,#2e9e63)",
    switchPersona: () => {
      const toProvider = s.persona === "customer";
      go(toProvider ? "machine" : "playground", { persona: toProvider ? "provider" : "customer" });
      showToast(toProvider ? "Viewing as Pat (provider)" : "Viewing as Casey (customer)");
    },
    wPlayground: navW("playground"), cPlayground: navC("playground"), bPlayground: navB("playground"),
    wJobs: navW("jobs"), cJobs: navC("jobs"), bJobs: navB("jobs"),
    wModels: navW("models"), cModels: navC("models"), bModels: navB("models"),
    wConnect: navW("connect"), cConnect: navC("connect"),
    wKeys: navW("keys"), cKeys: navC("keys"),
    wBilling: navW("billing"), cBilling: navC("billing"),
    wMachine: navW("machine"), cMachine: navC("machine"), bMachine: navB("machine"),
    wAgent: navW("agent"), cAgent: navC("agent"), bAgent: navB("agent"),
    cOps: nav("ops") ? on : off,
    goLanding: () => go("landing"),
    goPlayground: () => go("playground"),
    goJobs: () => go("jobs"),
    goModels: () => go("models"),
    goKeys: () => go("keys"),
    goConnect: () => go("connect"),
    goBilling: () => go("billing"),
    goOps: () => go("ops"),
    goMachine: () => go("machine", { persona: "provider" }),
    goAgent: () => go("agent", { persona: "provider" }),
    goProviderStart: () => go("providerstart", { persona: "provider" }),
    goLink: () => go("link"),

    // screens
    onLanding: nav("landing"), onSignin: nav("signin"), onPlayground: nav("playground"),
    onJobs: nav("jobs"), onJobDetail: nav("jobdetail"), onModels: nav("models"),
    onKeys: nav("keys"), onConnect: nav("connect"), onBilling: nav("billing"), onProviderStart: nav("providerstart"),
    onLink: nav("link"), onMachine: nav("machine"), onAgent: nav("agent"), onOps: nav("ops"),

    // landing / signin
    signIn: () => go("signin"),
    pickAccount: () => {
      go("playground", { persona: "customer" });
      showToast("Signed in — workspace & API key created");
    },

    // playground
    modelLabel: isText ? "Llama 3.1 8B · writes text" : "SDXL 1.0 · creates images",
    modelHint: isText ? "emails, summaries, descriptions" : "images from a text description",
    toggleModelMenu: () => patch({ modelMenuOpen: !s.modelMenuOpen }),
    modelMenuOpen: s.modelMenuOpen,
    pickLlama: () =>
      patch({
        model: "llama",
        modelMenuOpen: false,
        prompt: s.model === "llama" ? s.prompt : "Write a friendly follow-up email to a customer who left items in their cart.",
        runPhase: "idle",
        lastRun: null,
      }),
    pickSdxl: () =>
      patch({
        model: "sdxl",
        modelMenuOpen: false,
        prompt: s.model === "sdxl" ? s.prompt : "A cozy cabin in snowy woods at dusk, warm light in the windows",
        runPhase: "idle",
        lastRun: null,
      }),
    llamaCheck: isText ? "✓ " : "",
    sdxlCheck: !isText ? "✓ " : "",
    llamaRowBg: isText ? "rgba(93,230,255,.08)" : "transparent",
    sdxlRowBg: !isText ? "rgba(93,230,255,.08)" : "transparent",
    prompt: s.prompt,
    setPrompt: (e) => patch({ prompt: e.target.value, promptError: false }),
    promptBorder: s.promptError ? "rgba(255,122,107,.6)" : "rgba(255,255,255,.1)",
    promptError: s.promptError,
    toggleOptions: () => patch({ optionsOpen: !s.optionsOpen }),
    optionsOpen: s.optionsOpen,
    optionsChevron: s.optionsOpen ? "▴" : "▾",
    optionsSummary: isText ? "max_tokens " + s.maxTokens : s.imgSize + "×" + s.imgSize,
    optionName: isText ? "Max length" : "Size",
    optionValue: isText ? s.maxTokens : s.imgSize,
    optionUnit: isText ? "tokens (up to 2048) — the only optional setting" : "px, square (default 1024) — the only optional setting",
    setOptionValue: (e) => patch(isText ? { maxTokens: e.target.value } : { imgSize: e.target.value }),
    runJob: () => runJob(),
    runLabel: canRun ? "Run ⏎" : "Running…",
    runBg: canRun ? "#5de6ff" : "rgba(255,255,255,.08)",
    runColor: canRun ? "#06121a" : "#6b7385",
    runCursor: canRun ? "pointer" : "default",
    runShadow: canRun ? "0 0 26px rgba(93,230,255,.35)" : "none",
    pipelineVisible: phase !== "idle",
    st1c: s1.c, st1d: s1.d, st1g: s1.g,
    st2c: s2.c, st2d: s2.d, st2g: s2.g, st2a: s2.a,
    st3c: s3.c, st3d: s3.d, st3g: s3.g, st3a: s3.a,
    st4c: s4.c, st4d: s4.d, st4g: s4.g,
    ln1: line(0), ln2: line(1), ln3: line(2),
    runningOn: stageIdx >= 2 ? "pats-gaming-pc" : "a machine",
    resultVisible: phase === "done" && !!lastRun,
    resultIsText: !!(lastRun && lastRun.model === "llama"),
    resultIsImage: !!(lastRun && lastRun.model === "sdxl"),
    resultText: (lastRun && lastRun.text) || "",
    lastDuration: (lastRun && lastRun.duration) || "",
    usageLine: lastRun ? lastRun.usage.toUpperCase() : "",
    recentJobs: jobsAll.slice(0, 3).map((j) => ({
      label:
        (j.status === "succeeded" ? "Done" : j.status === "failed" ? "Failed" : "Running…") +
        " · " + (j.model === "sdxl" ? "image" : "text") + (j.source === "api" ? " · API" : ""),
      when: j.when.toUpperCase(),
      dotColor: dotFor(j.status),
      dotGlow: glowFor(j.status),
      open: openJob(j.id),
    })),
    copyKey: () => {
      patch({ copiedKey: true });
      showToast("Key copied to clipboard");
      setTimeout(() => patch({ copiedKey: false }), 1800);
    },
    copyKeyLabel: s.copiedKey ? "Copied ✓" : "Copy",

    // jobs
    jobFilters: ["All", "Running", "Done", "Failed"].map((f) => ({
      label: f,
      pick: () => patch({ jobFilter: f }),
      weight: s.jobFilter === f ? "600" : "400",
      border: s.jobFilter === f ? "#e8ecf4" : "rgba(255,255,255,.12)",
      bg: s.jobFilter === f ? "#e8ecf4" : "rgba(255,255,255,.04)",
      color: s.jobFilter === f ? "#07080c" : "#6b7385",
    })),
    filteredJobs: filtered.map((j) => ({
      dotColor: dotFor(j.status),
      dotGlow: glowFor(j.status),
      statusLabel: statusLabel(j),
      statusColor: statusColor(j),
      promptShort: j.prompt.length > 46 ? j.prompt.slice(0, 46) + "…" : j.prompt,
      modelName: modelName(j.model),
      when: j.when.toUpperCase(),
      viaApi: j.source === "api",
      actionLabel: j.status === "succeeded" ? "Re-run" : j.status === "failed" ? "Retry" : "",
      action: (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        patch({ model: j.model, prompt: j.prompt, runPhase: "idle", lastRun: null });
        go("playground");
        setTimeout(() => runJob({ model: j.model, prompt: j.prompt }), 60);
      },
      open: openJob(j.id),
    })),
    jobsEmpty: filtered.length === 0,

    // job detail
    detailId: detail ? detail.id : "",
    detailPrompt: detail ? detail.prompt : "",
    detailModelLine: detail
      ? detail.model === "sdxl"
        ? "sdxl-1.0 · " + s.imgSize + " × " + s.imgSize
        : "llama-3.1-8b · max_tokens " + s.maxTokens
      : "",
    detailUsage: detail ? detail.usage : "",
    detailStatusLine: detail
      ? detail.status === "succeeded"
        ? "Done — finished in " + detail.duration
        : detail.status === "failed"
        ? "Failed after 3 attempts"
        : "Running…"
      : "",
    detailPillColor: detail ? statusColor(detail) : "#6b7385",
    detailPillBorder: detail
      ? detail.status === "succeeded"
        ? "rgba(124,245,168,.3)"
        : detail.status === "failed"
        ? "rgba(255,122,107,.35)"
        : "rgba(255,199,107,.35)"
      : "rgba(255,255,255,.12)",
    detailPillBg: detail
      ? detail.status === "succeeded"
        ? "rgba(124,245,168,.05)"
        : detail.status === "failed"
        ? "rgba(255,122,107,.06)"
        : "rgba(255,199,107,.06)"
      : "transparent",
    detailFailed: !!(detail && detail.status === "failed"),
    detailHasOutput: !!(detail && detail.status === "succeeded"),
    detailIsImage: !!(detail && detail.status === "succeeded" && detail.model === "sdxl"),
    detailIsText: !!(detail && detail.status === "succeeded" && detail.model === "llama"),
    detailText: (detail && detail.text) || "",
    detailErrorCode: (detail && detail.errorCode) || "",
    detailErrorSentence: (detail && detail.errorSentence) || "",
    detailRerun: () => {
      if (!detail) return;
      patch({ model: detail.model, prompt: detail.prompt, runPhase: "idle", lastRun: null });
      go("playground");
      setTimeout(() => runJob({ model: detail.model, prompt: detail.prompt }), 60);
    },
    toggleDevDetails: () => patch({ devDetailsOpen: !s.devDetailsOpen }),
    devDetailsOpen: s.devDetailsOpen,
    devChevron: s.devDetailsOpen ? "▴" : "▾",

    // models
    tryLlama: () => {
      patch({ model: "llama", prompt: "Write a friendly follow-up email to a customer who left items in their cart.", runPhase: "idle", lastRun: null });
      go("playground");
    },
    trySdxl: () => {
      patch({ model: "sdxl", prompt: "A cozy cabin in snowy woods at dusk, warm light in the windows", runPhase: "idle", lastRun: null });
      go("playground");
    },

    // keys
    keys: s.keys.map((k) => ({
      label: k.label,
      masked: k.masked,
      created: k.created,
      revoke: () => patch({ revokeModalOpen: true, revokeTargetId: k.id }),
    })),
    usageJobs: 128 + s.jobs.filter((j) => j.when === "now").length,
    spendTotal: "$" + ((92 + s.jobs.filter((j) => j.when === "now").length) * 0.004 + 36 * 0.04).toFixed(2),
    billTextJobs: 92 + s.jobs.filter((j) => j.when === "now").length,
    billTextSub: "$" + ((92 + s.jobs.filter((j) => j.when === "now").length) * 0.004).toFixed(2),
    billImageSub: "$1.44",
    openCreateKey: () => patch({ keyModalOpen: true, keyModalStage: 1, newKeyLabel: "" }),
    keyModalOpen: s.keyModalOpen,
    keyModalStage1: s.keyModalStage === 1,
    keyModalStage2: s.keyModalStage === 2,
    newKeyLabel: s.newKeyLabel,
    setNewKeyLabel: (e) => patch({ newKeyLabel: e.target.value }),
    closeKeyModal: () => patch({ keyModalOpen: false }),
    createKey: () => {
      const label = s.newKeyLabel.trim() || "Untitled key";
      const suffix = randomKeySuffix();
      patch((st) => ({
        keyModalStage: 2,
        freshKey: randomFreshKey(),
        keys: st.keys.concat([{ id: uniqueId(), label, masked: "nod_••••••••" + suffix, created: "Jul 11" }]),
      }));
    },
    freshKey: s.freshKey,
    copyFreshKey: () => {
      patch({ copiedFresh: true });
      showToast("Key copied — store it safely");
      setTimeout(() => patch({ copiedFresh: false }), 1800);
    },
    copyFreshLabel: s.copiedFresh ? "Copied ✓" : "Copy",
    revokeModalOpen: s.revokeModalOpen,
    revokeTarget: (s.keys.find((k) => k.id === s.revokeTargetId) || {}).label || "",
    closeRevoke: () => patch({ revokeModalOpen: false, revokeTargetId: null }),
    confirmRevoke: () => {
      patch((st) => ({ keys: st.keys.filter((k) => k.id !== st.revokeTargetId), revokeModalOpen: false, revokeTargetId: null }));
      showToast("Key revoked — it stopped working immediately");
    },

    // connect
    recipes: [
      { name: "n8n", desc: "HTTP Request node + Webhook node. Copy a ready-made pair.", cta: "Copy nodes →" },
      { name: "Make", desc: "HTTP module + custom webhook, step by step.", cta: "Open recipe →" },
      { name: "Zapier", desc: "Webhooks by Zapier, both directions.", cta: "Open recipe →" },
      { name: "My own code", desc: "curl + Node.js snippets, straight from any run.", cta: "Open docs →" },
    ],
    sendTestEvent: () => {
      patch({ testEventSent: true });
      showToast("Test event sent — job.succeeded delivered ✓");
      setTimeout(() => patch({ testEventSent: false }), 2400);
    },
    testEventLabel: s.testEventSent ? "Delivered ✓" : "Send a test event",

    // automate drawer
    automateOpen: s.automateOpen,
    openAutomate: () => patch({ automateOpen: true }),
    closeAutomate: () => patch({ automateOpen: false }),
    goConnectFromDrawer: () => go("connect"),
    tabCurl: () => patch({ snippetTab: "curl" }),
    tabNode: () => patch({ snippetTab: "node" }),
    curlTabBg: s.snippetTab === "curl" ? "rgba(93,230,255,.12)" : "transparent",
    curlTabColor: s.snippetTab === "curl" ? "#5de6ff" : "#6b7385",
    nodeTabBg: s.snippetTab === "node" ? "rgba(93,230,255,.12)" : "transparent",
    nodeTabColor: s.snippetTab === "node" ? "#5de6ff" : "#6b7385",
    snippetCode: buildSnippet(s),
    insertKey: () => {
      patch({ keyInserted: true });
      showToast("Key inserted into the snippet");
    },
    insertKeyLabel: s.keyInserted ? "Key inserted ✓" : "Insert my key",
    copySnippet: () => {
      patch({ copiedSnippet: true });
      showToast("Snippet copied");
      setTimeout(() => patch({ copiedSnippet: false }), 1800);
    },
    copySnippetLabel: s.copiedSnippet ? "Copied ✓" : "Copy",

    // provider link
    codeCells: ["7", "F", "3", "K", "2", "M"].map((ch, i) => ({
      ch,
      border: i === 5 && !s.linked ? "2px solid #5de6ff" : "1px solid rgba(255,255,255,.14)",
      glow: i === 5 && !s.linked ? "0 0 16px rgba(93,230,255,.3)" : "none",
    })),
    linkMachine: () => {
      if (!s.linked) {
        patch({ linked: true });
        showToast("Machine linked ✓");
      }
    },
    linked: s.linked,
    linkBtnLabel: s.linked ? "Linked ✓" : "Link machine",
    linkBtnBg: s.linked ? "#7cf5a8" : "#5de6ff",

    // machine + agent
    machineStatusLabel: s.earning ? "Online — running a job" : "Paused by owner",
    machinePillColor: s.earning ? "#7cf5a8" : "#6b7385",
    machinePillBorder: s.earning ? "rgba(124,245,168,.3)" : "rgba(255,255,255,.14)",
    machineCheckin: s.earning ? "12s ago" : "2s ago",
    provJobs: 14 + s.jobs.filter((j) => j.when === "now").length,
    provValue: "~$3.20",
    toggleEarning: () => {
      const nowEarning = !s.earning;
      patch({ earning: nowEarning });
      showToast(nowEarning ? "Earning — taking new jobs" : "Pausing — current job finishes first, then no new jobs");
    },
    earning: s.earning,
    earnLabel: s.earning ? "● Earning — press to pause" : "Paused — press to start earning",
    earnBg: s.earning ? "linear-gradient(135deg,rgba(124,245,168,.18),rgba(124,245,168,.06))" : "rgba(255,255,255,.05)",
    earnBorder: s.earning ? "rgba(124,245,168,.4)" : "rgba(255,255,255,.14)",
    earnColor: s.earning ? "#7cf5a8" : "#6b7385",
    earnGlow: s.earning ? "0 0 28px rgba(124,245,168,.18)" : "none",
    earnSub: s.earning ? "Pause finishes the current job first, then takes no new ones" : "Idle · not taking jobs · GPU is all yours",
    agentJobVisible: s.earning,
    agentIdleVisible: !s.earning,
    agentIdleLine: "Idle · not taking jobs · GPU is all yours",
    agentElapsed: mm + ":" + ss,
    sdxlPct: pct,
    sdxlPctLabel: pct >= 100 ? "READY" : pct + "% ~" + Math.max(1, Math.round((100 - pct) / 10)) + "M",

    // ops
    opsQueue: Math.max(0, 3 - s.jobs.filter((j) => j.when === "now").length),
    opsProviders: s.providerApproved ? 8 : 7,
    pendingProvider: !s.providerApproved,
    providerApproved: s.providerApproved,
    approveProvider: () => {
      patch({ providerApproved: true });
      showToast("jamies-rig approved");
    },

    // toast
    toast: s.toast,
  };

  return (
    <div style={css("min-height:100vh;display:flex;flex-direction:column;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:44px 44px")}>
      {/* ══════════ TOP NAV ══════════ */}
      {v.showNav && (
        <El
          data-screen-label="Nav"
          s="display:flex;align-items:center;gap:24px;padding:14px 28px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(10,12,18,.85);position:sticky;top:0;z-index:40;backdrop-filter:blur(10px)"
        >
          <El as="span" onClick={v.goLanding} s="font-weight:700;font-size:18px;letter-spacing:-.3px;cursor:pointer">
            nodera<El as="span" s="color:#5de6ff">_</El>
          </El>
          {v.isCustomer && (
            <>
              <El as="span" onClick={v.goPlayground} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wPlayground};color:${v.cPlayground};border-bottom:2px solid ${v.bPlayground};padding-bottom:12px;margin-bottom:-16px`} sh="color:#9df0ff">Playground</El>
              <El as="span" onClick={v.goJobs} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wJobs};color:${v.cJobs};border-bottom:2px solid ${v.bJobs};padding-bottom:12px;margin-bottom:-16px`} sh="color:#9df0ff">Jobs</El>
              <El as="span" onClick={v.goModels} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wModels};color:${v.cModels};border-bottom:2px solid ${v.bModels};padding-bottom:12px;margin-bottom:-16px`} sh="color:#9df0ff">Models</El>
            </>
          )}
          {v.isProvider && (
            <>
              <El as="span" onClick={v.goMachine} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wMachine};color:${v.cMachine};border-bottom:2px solid ${v.bMachine};padding-bottom:12px;margin-bottom:-16px`} sh="color:#9df0ff">My machines</El>
              <El as="span" onClick={v.goAgent} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wAgent};color:${v.cAgent};border-bottom:2px solid ${v.bAgent};padding-bottom:12px;margin-bottom:-16px`} sh="color:#9df0ff">Desktop app</El>
            </>
          )}
          <El as="span" s="flex:1" />
          {v.isCustomer && (
            <>
              <El as="span" onClick={v.goConnect} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wConnect};color:${v.cConnect}`} sh="color:#9df0ff">Connect →</El>
              <El as="span" onClick={v.goKeys} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wKeys};color:${v.cKeys}`} sh="color:#9df0ff">Keys &amp; usage</El>
              <El as="span" onClick={v.goBilling} s={`font-size:13.5px;cursor:pointer;font-weight:${v.wBilling};color:${v.cBilling}`} sh="color:#9df0ff">Billing</El>
            </>
          )}
          <El as="span" onClick={v.goOps} title="operator view" s={`font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1px;color:${v.cOps};cursor:pointer;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:3px 10px`} sh="color:#9df0ff">OPS</El>
          <El as="span" onClick={v.switchPersona} title="switch persona" s={`width:30px;height:30px;border-radius:50%;background:${v.avatarBg};color:#06121a;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;cursor:pointer`}>{v.avatarLetter}</El>
        </El>
      )}

      {/* ══════════ LANDING ══════════ */}
      {v.onLanding && (
        <El data-screen-label="Landing" s="flex:1;position:relative;overflow:hidden;animation:nfade .3s ease">
          <El s="position:absolute;top:-200px;left:50%;transform:translateX(-50%);width:900px;height:520px;background:radial-gradient(ellipse at center,rgba(93,230,255,.16) 0%,transparent 65%);pointer-events:none;animation:nfloat 9s ease-in-out infinite" />
          <El s="display:flex;align-items:center;gap:22px;padding:16px 32px;position:relative">
            <El as="span" s="font-weight:700;font-size:19px;letter-spacing:-.3px">nodera<El as="span" s="color:#5de6ff">_</El></El>
            <El as="span" s="flex:1" />
            <El as="span" s="font-size:13.5px;color:#6b7385;cursor:pointer" sh="color:#9df0ff">Docs</El>
            <El as="span" onClick={v.goProviderStart} s="font-size:13.5px;color:#6b7385;cursor:pointer" sh="color:#9df0ff">For providers</El>
            <El as="span" onClick={v.signIn} s="display:inline-flex;border-radius:9px;padding:7px 16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);font-size:13px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.1)">Sign in</El>
          </El>
          <El s="padding:64px 40px 28px;text-align:center;position:relative">
            <El as="span" s="display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:500;border:1px solid rgba(124,245,168,.3);background:rgba(124,245,168,.05);color:#7cf5a8;animation:nrise .5s ease both">
              <El as="span" s="width:7px;height:7px;border-radius:50%;background:#7cf5a8;box-shadow:0 0 10px rgba(124,245,168,.9);animation:npulse 2s infinite" />7 machines online now · median wait 22s
            </El>
            <El s="font-size:54px;font-weight:700;letter-spacing:-2px;line-height:1.05;margin-top:22px;animation:nrise .5s ease both;animation-delay:.08s">Run AI jobs without<br /><El as="span" s="color:#5de6ff;text-shadow:0 0 40px rgba(93,230,255,.45)">owning hardware.</El></El>
            <El s="font-size:17px;margin-top:16px;line-height:1.55;color:#6b7385;animation:nrise .5s ease both;animation-delay:.16s">Pick a model, send a prompt, pay per job.<br />No servers, no GPUs, no instance types.</El>
            <El s="margin-top:32px;display:flex;justify-content:center;gap:14px;animation:nrise .5s ease both;animation-delay:.24s">
              <El as="span" onClick={v.signIn} s="display:inline-flex;border-radius:11px;padding:13px 28px;background:#5de6ff;color:#06121a;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 0 26px rgba(93,230,255,.35);transition:box-shadow .25s,transform .25s" sh="box-shadow:0 0 46px rgba(93,230,255,.6);transform:translateY(-2px)">Sign in with Google — first job free</El>
              <El as="span" onClick={v.goProviderStart} s="display:inline-flex;border-radius:11px;padding:13px 24px;border:1px solid rgba(255,255,255,.16);font-size:15px;font-weight:500;cursor:pointer;transition:background .25s,transform .25s" sh="background:rgba(255,255,255,.06);transform:translateY(-2px)">Start earning →</El>
            </El>
            <El s="margin-top:14px;font-family:var(--font-ibm-plex-mono),monospace;font-size:11.5px;color:#6b7385;animation:nrise .5s ease both;animation-delay:.32s">no credit card · no setup · result in &lt;60s</El>
          </El>

          {/* live network ticker */}
          <El s="border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07);padding:11px 0;overflow:hidden;position:relative;background:rgba(11,13,19,.6)">
            <El s="display:flex;gap:46px;width:max-content;animation:nmarq 28s linear infinite;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;color:#6b7385;white-space:nowrap">
              {[0, 1].map((rep) => (
                <Fragment key={rep}>
                  <span>job_8f2k1a · text · <span style={css("color:#7cf5a8")}>done in 7.9s</span></span>
                  <span>job_6t4q8p · text · <span style={css("color:#5de6ff")}>via API</span> · <span style={css("color:#7cf5a8")}>done in 5.1s</span></span>
                  <span style={css("color:#7cf5a8")}>● pats-gaming-pc came online</span>
                  <span>job_3d9x2m · image · <span style={css("color:#7cf5a8")}>done in 38s</span></span>
                  <span>job_1m7c3v · text · <span style={css("color:#ffc76b")}>running…</span></span>
                  <span>job_9w2e5r · image · <span style={css("color:#5de6ff")}>via API</span> · <span style={css("color:#7cf5a8")}>done in 44s</span></span>
                  <span style={css("color:#7cf5a8")}>● jamies-rig came online</span>
                  <span>7 machines online · median wait 22s</span>
                </Fragment>
              ))}
            </El>
          </El>

          {/* how it works */}
          <El s="padding:48px 9% 6px;position:relative">
            <El s="text-align:center;font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;letter-spacing:2.5px;color:#5de6ff">HOW IT WORKS</El>
            <El s="text-align:center;font-size:28px;font-weight:700;letter-spacing:-.9px;margin-top:8px">Press Run once. Or never again.</El>
            <El s="display:flex;gap:16px;margin-top:26px">
              <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(16,19,28,.72);padding:22px 24px;animation:nrise .55s ease both;animation-delay:.05s;transition:border-color .25s,transform .25s" sh="border-color:rgba(93,230,255,.4);transform:translateY(-3px)">
                <El s="font-family:var(--font-ibm-plex-mono),monospace;color:#5de6ff;font-size:10.5px;letter-spacing:1.5px">01 / TRY IT</El>
                <El s="font-weight:600;font-size:15px;margin-top:10px">Sign in and press Run</El>
                <El s="font-size:13px;margin-top:7px;color:#6b7385;line-height:1.6">Pick a model, type a prompt, press one button. Your first result lands in under a minute — that&apos;s the only time anyone presses Run.</El>
              </El>
              <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(16,19,28,.72);padding:22px 24px;animation:nrise .55s ease both;animation-delay:.15s;transition:border-color .25s,transform .25s" sh="border-color:rgba(93,230,255,.4);transform:translateY(-3px)">
                <El s="font-family:var(--font-ibm-plex-mono),monospace;color:#5de6ff;font-size:10.5px;letter-spacing:1.5px">02 / AUTOMATE IT</El>
                <El s="font-weight:600;font-size:15px;margin-top:10px">Connect your workflow</El>
                <El s="font-size:13px;margin-top:7px;color:#6b7385;line-height:1.6">Hook up n8n, Make, Zapier, or your own code with one snippet. After that nobody presses anything — every call becomes a job automatically.</El>
                <El s="margin-top:10px;font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;background:#0b0d13;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px 11px;color:#9fb1cc;text-align:left">POST /v1/jobs → job_id</El>
              </El>
              <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(16,19,28,.72);padding:22px 24px;animation:nrise .55s ease both;animation-delay:.25s;transition:border-color .25s,transform .25s" sh="border-color:rgba(93,230,255,.4);transform:translateY(-3px)">
                <El s="font-family:var(--font-ibm-plex-mono),monospace;color:#5de6ff;font-size:10.5px;letter-spacing:1.5px">03 / WE DO THE REST</El>
                <El s="font-weight:600;font-size:15px;margin-top:10px">Queued, run, billed per job</El>
                <El s="font-size:13px;margin-top:7px;color:#6b7385;line-height:1.6">We find an available machine, run the job, retry failures on another machine, and bill per job — whether it came from the button or the API.</El>
              </El>
            </El>
          </El>

          {/* value strip */}
          <El s="display:flex;gap:0;justify-content:center;padding:26px 9% 0;position:relative;flex-wrap:wrap">
            <El as="span" s="font-size:12.5px;color:#6b7385;padding:0 18px;border-right:1px solid rgba(255,255,255,.1)"><El as="span" s="color:#e8ecf4;font-weight:600">Pay per job</El> — never rent a GPU by the hour</El>
            <El as="span" s="font-size:12.5px;color:#6b7385;padding:0 18px;border-right:1px solid rgba(255,255,255,.1)"><El as="span" s="color:#e8ecf4;font-weight:600">Never lose a job</El> — queued means it will run</El>
            <El as="span" s="font-size:12.5px;color:#6b7385;padding:0 18px"><El as="span" s="color:#e8ecf4;font-weight:600">Two models today</El> — text &amp; images, more as the network grows</El>
          </El>

          {/* provider band */}
          <El s="margin:40px 9% 52px;position:relative;border:1px solid rgba(124,245,168,.25);border-radius:16px;background:linear-gradient(135deg,rgba(124,245,168,.08),rgba(124,245,168,.01));padding:24px 28px;display:flex;align-items:center;gap:18px">
            <El s="flex:1">
              <El s="font-weight:700;font-size:17px;letter-spacing:-.3px">Have a good GPU doing nothing?</El>
              <El s="font-size:13px;color:#6b7385;margin-top:5px">Install one app, link with a code, earn from AI jobs. Pause anytime — your PC stays yours. Under 5 minutes.</El>
            </El>
            <El as="span" onClick={v.goProviderStart} s="display:inline-flex;border-radius:11px;padding:11px 24px;background:#7cf5a8;color:#06140b;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 0 24px rgba(124,245,168,.25);transition:box-shadow .25s,transform .25s" sh="box-shadow:0 0 40px rgba(124,245,168,.5);transform:translateY(-2px)">Start earning →</El>
          </El>
        </El>
      )}

      {/* ══════════ SIGN-IN ══════════ */}
      {v.onSignin && (
        <El data-screen-label="Sign in" s="flex:1;display:flex;align-items:center;justify-content:center;animation:nfade .3s ease">
          <El s="width:360px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(16,19,28,.9);padding:28px;text-align:center">
            <El s="font-size:15px;font-weight:600">Choose an account</El>
            <El s="font-size:12.5px;color:#6b7385;margin-top:2px">to continue to nodera</El>
            <El onClick={v.pickAccount} s="display:flex;align-items:center;gap:12px;margin-top:20px;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:11px 14px;cursor:pointer;text-align:left" sh="background:rgba(93,230,255,.07);border-color:rgba(93,230,255,.4)">
              <El as="span" s="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#5de6ff,#3a7bd5);color:#06121a;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">C</El>
              <span>
                <El s="font-size:13.5px;font-weight:500">Casey Rivera</El>
                <El s="font-size:12px;color:#6b7385">casey@gmail.com</El>
              </span>
            </El>
            <El s="font-size:11.5px;color:#6b7385;margin-top:16px">No email verification, no card, no setup screens.<br />Your workspace and API key are created during this step.</El>
          </El>
        </El>
      )}

      {/* ══════════ PLAYGROUND ══════════ */}
      {v.onPlayground && (
        <El data-screen-label="Playground" s="flex:1;display:flex;gap:18px;padding:24px 28px;max-width:1120px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="flex:1;display:flex;flex-direction:column;gap:14px">
            <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:18px 20px">
              <El s="display:flex;align-items:center;gap:12px;position:relative">
                <El as="span" onClick={v.toggleModelMenu} s="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 15px;font-size:12.5px;font-weight:500;border:1px solid rgba(93,230,255,.35);background:rgba(93,230,255,.07);color:#5de6ff;cursor:pointer" sh="background:rgba(93,230,255,.14)">{v.modelLabel} ▾</El>
                <El as="span" s="font-size:12.5px;color:#6b7385">{v.modelHint}</El>
                {v.modelMenuOpen && (
                  <El s="position:absolute;top:38px;left:0;width:320px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#10131c;box-shadow:0 16px 44px rgba(0,0,0,.6);z-index:30;overflow:hidden">
                    <El onClick={v.pickLlama} s={`padding:12px 16px;cursor:pointer;background:${v.llamaRowBg}`} sh="background:rgba(93,230,255,.1)">
                      <El s="font-size:13.5px;font-weight:600">{v.llamaCheck}Llama 3.1 8B — writes text</El>
                      <El s="font-size:12px;color:#6b7385">emails, summaries, descriptions</El>
                    </El>
                    <El onClick={v.pickSdxl} s={`padding:12px 16px;cursor:pointer;border-top:1px solid rgba(255,255,255,.07);background:${v.sdxlRowBg}`} sh="background:rgba(93,230,255,.1)">
                      <El s="font-size:13.5px;font-weight:600">{v.sdxlCheck}SDXL 1.0 — creates images</El>
                      <El s="font-size:12px;color:#6b7385">from a text description</El>
                    </El>
                  </El>
                )}
              </El>
              <textarea
                value={v.prompt}
                onChange={v.setPrompt}
                placeholder="Type what you want the model to do…"
                style={css(`width:100%;margin-top:12px;border:1px solid ${v.promptBorder};border-radius:10px;background:#0b0d13;padding:13px 15px;min-height:76px;font-size:14px;color:#e8ecf4;resize:vertical;outline:none`)}
              />
              {v.promptError && (
                <El s="font-size:12.5px;color:#ff7a6b;margin-top:6px">Type a prompt first — it&apos;s the only thing required.</El>
              )}
              <El s="display:flex;align-items:center;margin-top:12px;gap:14px">
                <El as="span" onClick={v.toggleOptions} s="font-size:12.5px;color:#6b7385;cursor:pointer" sh="color:#9df0ff">Options {v.optionsChevron} <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px">{v.optionsSummary}</El></El>
                <El as="span" s="flex:1" />
                <El as="span" onClick={v.runJob} s={`display:inline-flex;border-radius:10px;padding:10px 38px;background:${v.runBg};color:${v.runColor};font-size:14px;font-weight:700;cursor:${v.runCursor};box-shadow:${v.runShadow}`} sh="box-shadow:0 0 40px rgba(93,230,255,.5)">{v.runLabel}</El>
              </El>
              {v.optionsOpen && (
                <El s="margin-top:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#0b0d13;padding:12px 15px;display:flex;align-items:center;gap:10px;font-size:13px">
                  <El as="span" s="color:#6b7385">{v.optionName}</El>
                  <input
                    value={v.optionValue}
                    onChange={v.setOptionValue}
                    style={css("width:90px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#10131c;color:#e8ecf4;padding:5px 9px;font-family:var(--font-ibm-plex-mono),monospace;font-size:12px;outline:none")}
                  />
                  <El as="span" s="color:#6b7385;font-size:12px">{v.optionUnit}</El>
                </El>
              )}
            </El>

            {/* live pipeline */}
            {v.pipelineVisible && (
              <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:13px 20px;display:flex;align-items:center;gap:16px;font-size:12.5px">
                <El as="span" s={`color:${v.st1c}`}><El as="span" s={`display:inline-block;width:7px;height:7px;border-radius:50%;background:${v.st1d};box-shadow:${v.st1g};margin-right:7px`} />Sent</El>
                <El as="span" s={`flex:1;height:1px;background:${v.ln1}`} />
                <El as="span" s={`color:${v.st2c}`}><El as="span" s={`display:inline-block;width:7px;height:7px;border-radius:50%;background:${v.st2d};box-shadow:${v.st2g};margin-right:7px;animation:${v.st2a}`} />Waiting for a machine…</El>
                <El as="span" s={`flex:1;height:1px;background:${v.ln2}`} />
                <El as="span" s={`color:${v.st3c}`}><El as="span" s={`display:inline-block;width:7px;height:7px;border-radius:50%;background:${v.st3d};box-shadow:${v.st3g};margin-right:7px;animation:${v.st3a}`} />Running on {v.runningOn}</El>
                <El as="span" s={`flex:1;height:1px;background:${v.ln3}`} />
                <El as="span" s={`color:${v.st4c}`}><El as="span" s={`display:inline-block;width:7px;height:7px;border-radius:50%;background:${v.st4d};box-shadow:${v.st4g};margin-right:7px`} />Done</El>
              </El>
            )}

            {/* result */}
            {v.resultVisible && (
              <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:18px 20px;animation:nfade .35s ease">
                <El s="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <El as="span" s="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:4px 13px;font-size:11.5px;font-weight:500;border:1px solid rgba(124,245,168,.3);background:rgba(124,245,168,.05);color:#7cf5a8"><El as="span" s="width:7px;height:7px;border-radius:50%;background:#7cf5a8;box-shadow:0 0 10px rgba(124,245,168,.9)" />Done in {v.lastDuration}</El>
                  <El as="span" s="flex:1" />
                  <El as="span" s="display:inline-flex;border-radius:9px;padding:6px 14px;border:1px solid rgba(255,255,255,.14);font-size:12px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.07)">Download</El>
                  <El as="span" onClick={v.runJob} s="display:inline-flex;border-radius:9px;padding:6px 14px;border:1px solid rgba(255,255,255,.14);font-size:12px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.07)">Re-run</El>
                  <El as="span" onClick={v.openAutomate} s="display:inline-flex;border-radius:9px;padding:6px 14px;border:1px solid rgba(93,230,255,.4);color:#5de6ff;font-size:12px;font-weight:500;cursor:pointer" sh="background:rgba(93,230,255,.1)">⟨/⟩ Automate this</El>
                </El>
                {v.resultIsText && (
                  <El s="margin-top:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#0b0d13;padding:15px 17px;font-size:14px;line-height:1.65;color:#d7deeb;white-space:pre-wrap">{v.resultText}</El>
                )}
                {v.resultIsImage && (
                  <El s="margin-top:12px;width:280px;height:280px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 35% 70%,#2a3550 0%,#141a28 55%),#0b0d13;display:flex;align-items:center;justify-content:center;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;color:#6b7385;text-align:center">rendered image<br />output.png</El>
                )}
                <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;color:#6b7385;margin-top:9px">{v.usageLine}</El>
              </El>
            )}
          </El>

          {/* right rail */}
          <El s="width:266px;display:flex;flex-direction:column;gap:12px">
            <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:14px 16px">
              <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385;margin-bottom:10px">RECENT JOBS</El>
              {v.recentJobs.map((j, i) => (
                <El key={i} onClick={j.open} s="display:flex;gap:9px;align-items:center;font-size:12.5px;padding:5px 6px;margin:0 -6px;border-radius:7px;cursor:pointer" sh="background:rgba(255,255,255,.05)">
                  <El as="span" s={`display:inline-block;width:7px;height:7px;border-radius:50%;background:${j.dotColor};box-shadow:${j.dotGlow}`} />
                  <El as="span">{j.label}</El>
                  <El as="span" s="margin-left:auto;font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;color:#6b7385">{j.when}</El>
                </El>
              ))}
              <El onClick={v.goJobs} s="margin-top:10px;font-size:12.5px;color:#5de6ff;font-weight:500;cursor:pointer" sh="color:#9df0ff">All jobs →</El>
            </El>
            <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:14px 16px">
              <El s="font-weight:600;font-size:13px">Your API key is ready</El>
              <El s="margin:8px 0;background:#0b0d13;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:6px 9px;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;color:#9fb1cc">nod_••••••••4f2a</El>
              <El s="font-size:12.5px;color:#5de6ff;font-weight:500"><El as="span" onClick={v.copyKey} s="cursor:pointer" sh="color:#9df0ff">{v.copyKeyLabel}</El> · <El as="span" onClick={v.goKeys} s="cursor:pointer" sh="color:#9df0ff">Manage keys</El></El>
            </El>
            <El s="border:1px solid rgba(93,230,255,.3);border-radius:12px;background:rgba(93,230,255,.05);padding:14px 16px">
              <El s="font-weight:600;font-size:13px">Using n8n, Make, or Zapier?</El>
              <El s="font-size:12.5px;margin-top:4px;color:#6b7385">Turn any run into a workflow step in ~2 minutes.</El>
              <El onClick={v.goConnect} s="margin-top:8px;font-size:12.5px;color:#5de6ff;font-weight:600;cursor:pointer" sh="color:#9df0ff">Connect your workflow →</El>
            </El>
          </El>
        </El>
      )}

      {/* ══════════ JOBS LIST ══════════ */}
      {v.onJobs && (
        <El data-screen-label="Jobs" s="flex:1;padding:24px 28px;max-width:980px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="display:flex;gap:8px">
            {v.jobFilters.map((f, i) => (
              <El key={i} as="span" onClick={f.pick} s={`display:inline-flex;align-items:center;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:${f.weight};border:1px solid ${f.border};background:${f.bg};color:${f.color};cursor:pointer`} sh="border-color:rgba(93,230,255,.5)">{f.label}</El>
            ))}
            <El as="span" s="flex:1" />
            <El as="span" s="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:3px 12px;font-size:11.5px;border:1px solid rgba(124,245,168,.3);color:#7cf5a8"><El as="span" s="width:7px;height:7px;border-radius:50%;background:#7cf5a8;box-shadow:0 0 10px rgba(124,245,168,.9);animation:npulse 2s infinite" />live</El>
          </El>
          <El s="margin-top:14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);overflow:hidden">
            {v.filteredJobs.map((j, i) => (
              <El key={i} onClick={j.open} s="display:flex;gap:14px;align-items:center;padding:13px 18px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer" sh="background:rgba(255,255,255,.04)">
                <El as="span" s={`display:inline-block;width:7px;height:7px;border-radius:50%;background:${j.dotColor};box-shadow:${j.dotGlow}`} />
                <El as="span" s={`width:160px;font-weight:500;color:${j.statusColor};font-size:13px`}>{j.statusLabel}</El>
                <El as="span" s="width:58px;display:inline-flex">{j.viaApi && (<El as="span" s="display:inline-flex;border-radius:999px;padding:1px 9px;font-size:9.5px;font-family:var(--font-ibm-plex-mono),monospace;letter-spacing:.5px;border:1px solid rgba(93,230,255,.35);color:#5de6ff;align-self:center">API</El>)}</El>
                <El as="span" s="flex:1;font-size:13px;color:#6b7385;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">&quot;{j.promptShort}&quot; · {j.modelName}</El>
                {j.actionLabel && (
                  <El as="span" onClick={j.action} s="font-size:12px;color:#5de6ff;font-weight:500" sh="color:#9df0ff">{j.actionLabel}</El>
                )}
                <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;color:#6b7385;width:52px;text-align:right">{j.when}</El>
              </El>
            ))}
            {v.jobsEmpty && (
              <El s="padding:44px;text-align:center">
                <El s="font-size:15px;font-weight:600">No jobs here yet</El>
                <El s="font-size:12.5px;color:#6b7385;margin-top:4px">Run one from the Playground — it takes about 10 seconds.</El>
                <El as="span" onClick={v.goPlayground} s="display:inline-flex;margin-top:14px;border-radius:10px;padding:9px 20px;background:#5de6ff;color:#06121a;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 0 22px rgba(93,230,255,.3)">Open Playground</El>
              </El>
            )}
          </El>
        </El>
      )}

      {/* ══════════ JOB DETAIL ══════════ */}
      {v.onJobDetail && (
        <El data-screen-label="Job detail" s="flex:1;padding:24px 28px;max-width:900px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="display:flex;align-items:center;gap:12px">
            <El as="span" onClick={v.goJobs} s="font-size:13px;color:#6b7385;cursor:pointer" sh="color:#9df0ff">← Jobs</El>
            <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:12px;color:#9fb1cc">{v.detailId}</El>
            <El as="span" s="flex:1" />
            <El as="span" onClick={v.detailRerun} s="display:inline-flex;border-radius:9px;padding:7px 15px;border:1px solid rgba(255,255,255,.14);font-size:12.5px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.07)">Re-run</El>
            <El as="span" onClick={v.openAutomate} s="display:inline-flex;border-radius:9px;padding:7px 15px;border:1px solid rgba(93,230,255,.4);color:#5de6ff;font-size:12.5px;font-weight:500;cursor:pointer" sh="background:rgba(93,230,255,.1)">⟨/⟩ Automate this</El>
          </El>
          <El s="margin-top:14px">
            <El as="span" s={`display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 15px;font-size:12.5px;font-weight:500;border:1px solid ${v.detailPillBorder};background:${v.detailPillBg};color:${v.detailPillColor}`}><El as="span" s={`width:7px;height:7px;border-radius:50%;background:${v.detailPillColor}`} />{v.detailStatusLine}</El>
          </El>
          <El s="display:flex;gap:18px;margin-top:16px">
            <El s="flex:1;display:flex;flex-direction:column;gap:12px">
              <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:15px 17px">
                <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385">INPUT</El>
                <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;color:#6b7385;margin-top:7px">{v.detailModelLine}</El>
                <El s="font-size:14px;margin-top:5px">&quot;{v.detailPrompt}&quot;</El>
              </El>
              <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:15px 17px">
                <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385">USAGE</El>
                <El s="font-size:13px;margin-top:7px;color:#d7deeb">{v.detailUsage}</El>
              </El>
              {v.detailFailed && (
                <El s="border:1px solid rgba(255,122,107,.35);border-radius:12px;background:rgba(255,122,107,.06);padding:15px 17px">
                  <El s="font-weight:500;color:#ff7a6b;font-size:13.5px">{v.detailErrorSentence}</El>
                  <El s="display:flex;gap:12px;margin-top:10px;align-items:center">
                    <El as="span" onClick={v.detailRerun} s="display:inline-flex;border-radius:9px;padding:7px 18px;background:#ff7a6b;color:#1a0805;font-size:12.5px;font-weight:700;cursor:pointer" sh="box-shadow:0 0 18px rgba(255,122,107,.4)">Retry</El>
                    <El as="span" s="font-size:12px;color:#6b7385">Retry sends the same input as a new job</El>
                    <El as="span" s="flex:1" />
                    <El as="span" onClick={v.toggleDevDetails} s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;color:#6b7385;cursor:pointer" sh="color:#9df0ff">Developer details {v.devChevron}</El>
                  </El>
                  {v.devDetailsOpen && (
                    <El s="margin-top:10px;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;line-height:1.7;background:#0b0d13;border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:11px 13px;color:#c9d4e8">{`{ "error": { "code": "${v.detailErrorCode}",`}<br />{`  "message": "${v.detailErrorSentence}" } }`}</El>
                  )}
                </El>
              )}
            </El>
            {v.detailHasOutput && (
              <El s="width:320px">
                <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:13px">
                  <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385;margin-bottom:9px">OUTPUT</El>
                  {v.detailIsImage && (
                    <>
                      <El s="width:100%;height:290px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 35% 70%,#2a3550 0%,#141a28 55%),#0b0d13;display:flex;align-items:center;justify-content:center;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;color:#6b7385;text-align:center">rendered image<br />output.png</El>
                      <El s="display:flex;gap:10px;margin-top:10px;align-items:center">
                        <El as="span" s="display:inline-flex;border-radius:9px;padding:6px 15px;background:#5de6ff;color:#06121a;font-size:12px;font-weight:700;cursor:pointer">Download</El>
                        <El as="span" s="font-size:11.5px;color:#6b7385">output.png · 1.2 MB</El>
                      </El>
                    </>
                  )}
                  {v.detailIsText && (
                    <El s="border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#0b0d13;padding:13px 15px;font-size:13.5px;line-height:1.65;color:#d7deeb;white-space:pre-wrap">{v.detailText}</El>
                  )}
                </El>
              </El>
            )}
          </El>
        </El>
      )}

      {/* ══════════ MODELS ══════════ */}
      {v.onModels && (
        <El data-screen-label="Models" s="flex:1;padding:24px 28px;max-width:940px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="display:flex;gap:16px">
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px 22px">
              <El s="display:flex;align-items:center;gap:10px">
                <El as="span" s="font-weight:700;font-size:17px;letter-spacing:-.3px">Llama 3.1 8B</El>
                <El as="span" s="display:inline-flex;border-radius:999px;padding:2px 11px;font-size:11px;border:1px solid rgba(93,230,255,.35);background:rgba(93,230,255,.07);color:#5de6ff">text</El>
              </El>
              <El s="font-size:14px;margin-top:8px">Writes text — good for emails, summaries, product descriptions.</El>
              <El s="font-size:12.5px;color:#6b7385;margin-top:10px">You give it: a prompt (required) · max length (optional, default 512)</El>
              <El s="font-size:12.5px;color:#6b7385">Typical run: a few seconds · max 2 minutes</El>
              <El as="span" onClick={v.tryLlama} s="display:inline-flex;margin-top:16px;border-radius:10px;padding:9px 20px;background:#5de6ff;color:#06121a;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 0 22px rgba(93,230,255,.3)" sh="box-shadow:0 0 36px rgba(93,230,255,.5)">Try it in the Playground</El>
            </El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px 22px">
              <El s="display:flex;align-items:center;gap:10px">
                <El as="span" s="font-weight:700;font-size:17px;letter-spacing:-.3px">SDXL 1.0</El>
                <El as="span" s="display:inline-flex;border-radius:999px;padding:2px 11px;font-size:11px;border:1px solid rgba(190,140,255,.4);background:rgba(190,140,255,.08);color:#c99dff">image</El>
              </El>
              <El s="font-size:14px;margin-top:8px">Creates images from a text description.</El>
              <El s="font-size:12.5px;color:#6b7385;margin-top:10px">You give it: a prompt (required) · size (default 1024 × 1024)</El>
              <El s="font-size:12.5px;color:#6b7385">Typical run: under a minute · max 5 minutes</El>
              <El as="span" onClick={v.trySdxl} s="display:inline-flex;margin-top:16px;border-radius:10px;padding:9px 20px;background:#5de6ff;color:#06121a;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 0 22px rgba(93,230,255,.3)" sh="box-shadow:0 0 36px rgba(93,230,255,.5)">Try it in the Playground</El>
            </El>
          </El>
          <El s="font-size:12px;color:#6b7385;margin-top:14px">Cards and forms are generated from the models API — new menu models appear here automatically.</El>
        </El>
      )}

      {/* ══════════ KEYS & USAGE ══════════ */}
      {v.onKeys && (
        <El data-screen-label="Keys and usage" s="flex:1;padding:24px 28px;max-width:820px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="display:flex;align-items:center">
            <El as="span" s="font-weight:700;font-size:19px;letter-spacing:-.4px">API keys &amp; usage</El>
            <El as="span" s="flex:1" />
            <El as="span" onClick={v.openCreateKey} s="display:inline-flex;border-radius:9px;padding:7px 16px;border:1px solid rgba(93,230,255,.4);color:#5de6ff;font-size:12.5px;font-weight:600;cursor:pointer" sh="background:rgba(93,230,255,.1)">+ Create key</El>
          </El>
          <El s="margin-top:14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);overflow:hidden">
            {v.keys.map((k, i) => (
              <El key={i} s="display:flex;gap:14px;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px">
                <El as="span" s="width:150px;font-weight:500">{k.label}</El>
                <El as="span" s="flex:1;font-family:var(--font-ibm-plex-mono),monospace;font-size:11.5px;color:#9fb1cc">{k.masked}</El>
                <El as="span" s="font-size:12px;color:#6b7385">created {k.created}</El>
                <El as="span" onClick={k.revoke} s="color:#ff7a6b;font-size:12px;font-weight:500;cursor:pointer" sh="text-decoration:underline">Revoke</El>
              </El>
            ))}
          </El>
          <El s="font-size:12px;color:#6b7385;margin-top:8px">New keys are shown once — copy immediately. Revoking takes effect instantly.</El>
          <El s="font-weight:700;font-size:16px;letter-spacing:-.3px;margin-top:26px">Usage this month</El>
          <El s="display:flex;gap:12px;margin-top:10px">
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:16px;text-align:center"><El s="font-size:28px;font-weight:700;letter-spacing:-.8px">{v.usageJobs}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">JOBS</El></El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:16px;text-align:center"><El s="font-size:28px;font-weight:700;letter-spacing:-.8px">41k</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">TOKENS OUT</El></El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:16px;text-align:center"><El s="font-size:28px;font-weight:700;letter-spacing:-.8px">36</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">IMAGES</El></El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:16px;text-align:center"><El s="font-size:28px;font-weight:700;letter-spacing:-.8px">1.2h</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">COMPUTE</El></El>
          </El>
          <El s="font-size:12px;color:#6b7385;margin-top:8px">Measured, not billed — billing isn&apos;t live yet.</El>
        </El>
      )}

      {/* ══════════ BILLING ══════════ */}
      {v.onBilling && (
        <El data-screen-label="Billing" s="flex:1;padding:24px 28px;max-width:860px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="display:flex;align-items:center;gap:12px">
            <El as="span" s="font-weight:700;font-size:19px;letter-spacing:-.4px">Billing &amp; spend</El>
            <El as="span" s="display:inline-flex;border-radius:999px;padding:3px 12px;font-size:11px;border:1px solid rgba(255,199,107,.35);color:#ffc76b">estimates — charging goes live after v1</El>
          </El>
          <El s="display:flex;gap:14px;margin-top:16px">
            <El s="flex:1.2;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px 22px">
              <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385">SPEND THIS MONTH</El>
              <El s="font-size:38px;font-weight:700;letter-spacing:-1.4px;margin-top:8px;color:#7cf5a8">{v.spendTotal}</El>
              <El s="font-size:12.5px;color:#6b7385;margin-top:4px">Billed per job, after the job runs. Playground runs and API jobs bill identically — failed jobs are free.</El>
            </El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px 22px">
              <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385">PAYMENT METHOD</El>
              <El s="display:flex;align-items:center;gap:10px;margin-top:12px">
                <El as="span" s="border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:4px 9px;font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1px">VISA</El>
                <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:12px;color:#9fb1cc">•••• 4242</El>
              </El>
              <El s="font-size:12.5px;color:#5de6ff;font-weight:500;margin-top:12px;cursor:pointer" sh="color:#9df0ff">Update card</El>
              <El s="font-size:12px;color:#6b7385;margin-top:8px">You&apos;re never charged up front — no pre-bought credits, no hourly rentals.</El>
            </El>
          </El>
          <El s="font-weight:600;font-size:14px;margin-top:22px">This month, by model</El>
          <El s="margin-top:9px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);overflow:hidden">
            <El s="display:flex;gap:14px;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px">
              <El as="span" s="width:170px;font-weight:500">Llama 3.1 8B <El as="span" s="color:#6b7385">· text</El></El>
              <El as="span" s="flex:1;color:#6b7385">{v.billTextJobs} jobs × $0.004 avg</El>
              <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:12px">{v.billTextSub}</El>
            </El>
            <El s="display:flex;gap:14px;align-items:center;padding:12px 18px;font-size:13px">
              <El as="span" s="width:170px;font-weight:500">SDXL 1.0 <El as="span" s="color:#6b7385">· image</El></El>
              <El as="span" s="flex:1;color:#6b7385">36 jobs × $0.04</El>
              <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:12px">{v.billImageSub}</El>
            </El>
          </El>
          <El s="font-weight:600;font-size:14px;margin-top:22px">Invoices</El>
          <El s="margin-top:9px;border:1px dashed rgba(255,255,255,.14);border-radius:12px;padding:22px;text-align:center;font-size:12.5px;color:#6b7385">No invoices yet — your first invoice arrives when charging goes live. Until then everything on this page is measured, not billed.</El>
        </El>
      )}

      {/* ══════════ CONNECT ══════════ */}
      {v.onConnect && (
        <El data-screen-label="Connect" s="flex:1;padding:24px 28px;max-width:1000px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="font-weight:700;font-size:22px;letter-spacing:-.5px">Connect your workflow</El>
          <El s="font-size:13.5px;color:#6b7385;margin-top:3px">Everything you need is already set up — this page just hands it to you in the right shape.</El>
          <El s="display:flex;gap:14px;margin-top:20px">
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:17px 19px">
              <El s="font-weight:600;font-size:14px"><El as="span" s="color:#5de6ff">1.</El> Your key</El>
              <El s="margin-top:9px;background:#0b0d13;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 10px;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;color:#9fb1cc">nod_••••••••4f2a</El>
              <El onClick={v.copyKey} s="font-size:12.5px;color:#5de6ff;font-weight:500;margin-top:7px;cursor:pointer" sh="color:#9df0ff">{v.copyKeyLabel}</El>
              <El s="font-size:12px;color:#6b7385;margin-top:7px">Existed since you signed up — nothing to request.</El>
            </El>
            <El s="flex:1.3;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:17px 19px">
              <El s="font-weight:600;font-size:14px"><El as="span" s="color:#5de6ff">2.</El> Send a job</El>
              <El s="margin-top:9px;font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;line-height:1.7;background:#0b0d13;border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:11px 13px;color:#c9d4e8">POST /v1/jobs<br />x-api-key: YOUR_KEY<br />{'{ "model": "llama-3.1-8b",'}<br />{'  "input": { "prompt": "…" } }'}</El>
              <El s="font-size:12px;color:#6b7385;margin-top:7px">Returns a job_id instantly — your workflow never blocks. Add an Idempotency-Key so engine retries never duplicate jobs.</El>
            </El>
            <El s="flex:1.3;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:17px 19px">
              <El s="font-weight:600;font-size:14px"><El as="span" s="color:#5de6ff">3.</El> Get told when it&apos;s done</El>
              <El s="font-size:12.5px;margin-top:9px;color:#d7deeb">Add <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px">webhook_url</El> to the job, or poll <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px">GET /v1/jobs/:id</El>.</El>
              <El s="margin-top:9px;background:#0b0d13;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 10px;font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px;color:#9fb1cc">signing secret: whsec_••••7d1c</El>
              <El s="display:flex;gap:12px;margin-top:10px;align-items:center">
                <El as="span" onClick={v.sendTestEvent} s="display:inline-flex;border-radius:8px;padding:6px 13px;border:1px solid rgba(255,255,255,.14);font-size:11.5px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.07)">{v.testEventLabel}</El>
                <El as="span" s="font-size:11.5px;color:#5de6ff;font-weight:500;cursor:pointer" sh="color:#9df0ff">Verify snippet</El>
              </El>
            </El>
          </El>
          <El s="font-weight:600;font-size:14px;margin-top:24px">Recipes</El>
          <El s="display:flex;gap:12px;margin-top:9px">
            {v.recipes.map((r, i) => (
              <El key={i} s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:13px 15px;cursor:pointer" sh="border-color:rgba(93,230,255,.4)">
                <El s="font-weight:600;font-size:13.5px">{r.name}</El>
                <El s="font-size:12px;color:#6b7385;margin-top:3px">{r.desc}</El>
                <El s="font-size:12px;color:#5de6ff;font-weight:500;margin-top:7px">{r.cta}</El>
              </El>
            ))}
          </El>
        </El>
      )}

      {/* ══════════ PROVIDER: START / INSTALL ══════════ */}
      {v.onProviderStart && (
        <El data-screen-label="Provider start" s="flex:1;display:flex;align-items:center;justify-content:center;padding:30px;animation:nfade .3s ease">
          <El s="width:560px">
            <El s="text-align:center">
              <El as="span" s="display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:500;border:1px solid rgba(124,245,168,.3);background:rgba(124,245,168,.05);color:#7cf5a8">FOR PROVIDERS</El>
              <El s="font-size:32px;font-weight:700;letter-spacing:-1px;margin-top:14px">Earn from your idle GPU.</El>
              <El s="font-size:14px;color:#6b7385;margin-top:6px">One command, one code, under 5 minutes. Your PC stays yours — pause anytime.</El>
            </El>
            <El s="margin-top:22px;font-family:var(--font-ibm-plex-mono),monospace;font-size:12px;line-height:1.8;background:#0b0d13;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px 18px;color:#c9d4e8">
              <El as="span" s="color:#6b7385">$</El> npx nodera-provider<br />
              <El as="span" s="color:#7cf5a8">✓</El> Docker found<br />
              <El as="span" s="color:#7cf5a8">✓</El> NVIDIA driver found<br />
              <El as="span" s="color:#7cf5a8">✓</El> GPU detected: RTX 4090 · 24 GB<br />
              <br />
              Almost there! Go to <El as="span" s="color:#5de6ff">nodera.com/link</El> and enter:<br />
              <El as="span" s="font-size:20px;letter-spacing:4px;color:#e8ecf4">&nbsp;&nbsp;7F3-K2M</El>
            </El>
            <El s="text-align:center;margin-top:20px">
              <El as="span" onClick={v.goLink} s="display:inline-flex;border-radius:11px;padding:12px 28px;background:#7cf5a8;color:#06140b;font-size:14.5px;font-weight:700;cursor:pointer;box-shadow:0 0 26px rgba(124,245,168,.3)" sh="box-shadow:0 0 40px rgba(124,245,168,.5)">I have my code — link my machine →</El>
            </El>
          </El>
        </El>
      )}

      {/* ══════════ PROVIDER: LINK ══════════ */}
      {v.onLink && (
        <El data-screen-label="Link machine" s="flex:1;display:flex;align-items:center;justify-content:center;padding:30px;animation:nfade .3s ease">
          <El s="width:480px;text-align:center">
            <El s="font-size:26px;font-weight:700;letter-spacing:-.6px">Link your machine</El>
            <El s="font-size:13.5px;color:#6b7385;margin-top:5px">Your Nodera app is showing a short code. Type it here.</El>
            <El s="display:flex;justify-content:center;gap:9px;margin-top:26px;align-items:center">
              {v.codeCells.map((c, i) => (
                <El key={i} as="span" s={`width:46px;height:56px;line-height:56px;font-size:25px;font-family:var(--font-ibm-plex-mono),monospace;background:#0b0d13;border:${c.border};border-radius:11px;box-shadow:${c.glow}`}>{c.ch}</El>
              ))}
            </El>
            <El s="margin-top:26px">
              <El as="span" onClick={v.linkMachine} s={`display:inline-flex;border-radius:11px;padding:12px 34px;background:${v.linkBtnBg};color:#06121a;font-size:14.5px;font-weight:700;cursor:pointer;box-shadow:0 0 26px rgba(93,230,255,.3)`} sh="box-shadow:0 0 40px rgba(93,230,255,.5)">{v.linkBtnLabel}</El>
            </El>
            {v.linked && (
              <El s="margin-top:26px;border:1px solid rgba(124,245,168,.35);background:rgba(124,245,168,.06);border-radius:12px;padding:14px 18px;font-size:13.5px;text-align:left;animation:nfade .35s ease">
                <El as="span" s="color:#7cf5a8;font-weight:600">✓ pats-gaming-pc is linked.</El> <El as="span" s="color:#6b7385">Models are downloading on your machine — jobs start flowing when they&apos;re ready.</El>
                <El onClick={v.goMachine} s="color:#5de6ff;font-weight:500;margin-top:6px;cursor:pointer" sh="color:#9df0ff">See your machine →</El>
              </El>
            )}
          </El>
        </El>
      )}

      {/* ══════════ PROVIDER: MACHINE (WEB) ══════════ */}
      {v.onMachine && (
        <El data-screen-label="My machines" s="flex:1;padding:24px 28px;max-width:760px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px 22px">
            <El s="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <El as="span" s="font-weight:700;font-size:17px;letter-spacing:-.3px">pats-gaming-pc</El>
              <El as="span" s={`display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:3px 12px;font-size:11.5px;border:1px solid ${v.machinePillBorder};color:${v.machinePillColor}`}><El as="span" s={`width:7px;height:7px;border-radius:50%;background:${v.machinePillColor};box-shadow:0 0 10px ${v.machinePillColor};animation:npulse 2s infinite`} />{v.machineStatusLabel}</El>
              <El as="span" s="flex:1" />
              <El as="span" s="font-size:11.5px;color:#6b7385">last check-in {v.machineCheckin}</El>
            </El>
            <El s="font-size:12.5px;color:#6b7385;margin-top:5px">RTX 4090 · 24 GB VRAM · 1 job at a time</El>
            <El s="display:flex;gap:8px;margin-top:12px">
              <El as="span" s="display:inline-flex;border-radius:999px;padding:3px 12px;font-size:11px;border:1px solid rgba(255,255,255,.12);color:#d7deeb">✓ llama-3.1-8b ready</El>
              <El as="span" s="display:inline-flex;border-radius:999px;padding:3px 12px;font-size:11px;border:1px solid rgba(255,255,255,.12);color:#d7deeb">✓ sdxl-1.0 ready</El>
            </El>
            <El s="display:flex;gap:12px;margin-top:18px">
              <El s="flex:1;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:#0b0d13;padding:14px;text-align:center"><El s="font-size:26px;font-weight:700;letter-spacing:-.6px">{v.provJobs}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">JOBS TODAY</El></El>
              <El s="flex:1;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:#0b0d13;padding:14px;text-align:center"><El s="font-size:26px;font-weight:700;letter-spacing:-.6px">2.1h</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">COMPUTE TODAY</El></El>
              <El s="flex:1;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:#0b0d13;padding:14px;text-align:center"><El s="font-size:26px;font-weight:700;letter-spacing:-.6px;color:#7cf5a8">{v.provValue}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">EST. VALUE*</El></El>
            </El>
            <El s="font-size:11.5px;color:#6b7385;margin-top:9px">*Estimate from metered usage. Real payouts come after v1 — never fake numbers.</El>
          </El>
          <El s="font-size:12px;color:#6b7385;margin-top:10px">Same truth as the desktop app — check from anywhere whether the machine at home is actually earning. <El as="span" onClick={v.goAgent} s="color:#5de6ff;cursor:pointer;font-weight:500">Open desktop app view →</El></El>
        </El>
      )}

      {/* ══════════ PROVIDER: DESKTOP AGENT ══════════ */}
      {v.onAgent && (
        <El data-screen-label="Desktop agent" s="flex:1;display:flex;align-items:center;justify-content:center;padding:30px;animation:nfade .3s ease">
          <El s="width:440px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0a0c11;box-shadow:0 24px 70px rgba(0,0,0,.6)">
            <El s="display:flex;align-items:center;gap:8px;padding:11px 15px;border-bottom:1px solid rgba(255,255,255,.08)">
              <El as="span" s="display:inline-flex;gap:6px"><El as="span" s="width:11px;height:11px;border-radius:50%;background:#e8564f" /><El as="span" s="width:11px;height:11px;border-radius:50%;background:#f0b429" /><El as="span" s="width:11px;height:11px;border-radius:50%;background:#43b05c" /></El>
              <El as="span" s="flex:1;text-align:center;font-size:12px;font-weight:500;color:#6b7385">Nodera Provider</El>
              <El as="span" s="width:54px" />
            </El>
            <El s="padding:22px 24px">
              <El onClick={v.toggleEarning} s={`background:${v.earnBg};border:1px solid ${v.earnBorder};border-radius:13px;padding:17px 0;text-align:center;font-size:16px;font-weight:700;color:${v.earnColor};cursor:pointer;box-shadow:${v.earnGlow};transition:all .25s`} sh="filter:brightness(1.15)">{v.earnLabel}</El>
              <El s="font-size:11.5px;color:#6b7385;margin-top:7px;text-align:center">{v.earnSub}</El>
              {v.agentJobVisible && (
                <El s="margin-top:16px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:12px 15px;font-size:13px">
                  <El as="span" s="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ffc76b;box-shadow:0 0 10px rgba(255,199,107,.9);margin-right:9px;animation:npulse 1.6s infinite" /><El as="span" s="font-weight:500">Running a job</El> <El as="span" s="color:#6b7385">— llama-3.1-8b · </El><El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;color:#ffc76b;font-size:11px">{v.agentElapsed}</El>
                </El>
              )}
              {v.agentIdleVisible && (
                <El s="margin-top:16px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:12px 15px;font-size:13px;color:#6b7385">
                  <El as="span" s="display:inline-block;width:7px;height:7px;border-radius:50%;border:1px solid #464d5e;margin-right:9px" />{v.agentIdleLine}
                </El>
              )}
              <El s="margin-top:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:14px 16px">
                <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1.5px;color:#6b7385">MODELS ON THIS MACHINE</El>
                <El s="display:flex;align-items:center;gap:10px;margin-top:11px">
                  <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;width:98px;font-size:10.5px">llama-3.1-8b</El>
                  <El as="span" s="flex:1;height:7px;border-radius:999px;background:#7cf5a8;box-shadow:0 0 8px rgba(124,245,168,.5)" />
                  <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;width:66px;text-align:right;color:#6b7385">READY</El>
                </El>
                <El s="display:flex;align-items:center;gap:10px;margin-top:9px">
                  <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;width:98px;font-size:10.5px">sdxl-1.0</El>
                  <El as="span" s={`flex:1;height:7px;border-radius:999px;background:linear-gradient(90deg,#5de6ff 0 ${v.sdxlPct}%,rgba(255,255,255,.1) ${v.sdxlPct}%);box-shadow:0 0 8px rgba(93,230,255,.35)`} />
                  <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;width:66px;text-align:right;color:#6b7385">{v.sdxlPctLabel}</El>
                </El>
              </El>
              <El s="display:flex;gap:10px;margin-top:10px">
                <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:13px;text-align:center"><El s="font-size:23px;font-weight:700;letter-spacing:-.5px">{v.provJobs}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">JOBS TODAY</El></El>
                <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:13px;text-align:center"><El s="font-size:23px;font-weight:700;letter-spacing:-.5px;color:#7cf5a8">{v.provValue}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">EST. VALUE*</El></El>
              </El>
              <El s="font-size:11px;color:#6b7385;margin-top:9px">*Estimates only — payouts arrive post-v1 · <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px">RTX 4090 · 24GB</El> detected automatically</El>
            </El>
          </El>
        </El>
      )}

      {/* ══════════ OPS ══════════ */}
      {v.onOps && (
        <El data-screen-label="Ops" s="flex:1;padding:24px 28px;max-width:860px;width:100%;margin:0 auto;animation:nfade .3s ease">
          <El s="display:flex;align-items:center;gap:12px">
            <El as="span" s="font-weight:700;font-size:19px;letter-spacing:-.4px">Network status</El>
            <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10px;letter-spacing:1px;color:#6b7385">OPERATOR ONLY</El>
            <El as="span" s="flex:1" />
            <El as="span" s="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:3px 12px;font-size:11.5px;border:1px solid rgba(124,245,168,.3);color:#7cf5a8"><El as="span" s="width:7px;height:7px;border-radius:50%;background:#7cf5a8;box-shadow:0 0 10px rgba(124,245,168,.9)" />healthy</El>
          </El>
          <El s="display:flex;gap:12px;margin-top:16px">
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px;text-align:center"><El s="font-size:36px;font-weight:700;letter-spacing:-1.2px">{v.opsQueue}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">JOBS IN QUEUE</El></El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px;text-align:center"><El s="font-size:36px;font-weight:700;letter-spacing:-1.2px">{v.opsProviders}</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">PROVIDERS ONLINE</El></El>
            <El s="flex:1;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:20px;text-align:center"><El s="font-size:36px;font-weight:700;letter-spacing:-1.2px">22s</El><El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:9.5px;letter-spacing:1px;color:#6b7385">MEDIAN WAIT</El></El>
          </El>
          <El s="font-weight:600;font-size:14px;margin-top:22px">Providers awaiting approval</El>
          {v.pendingProvider && (
            <El s="margin-top:9px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.03);padding:13px 18px;display:flex;gap:14px;align-items:center;font-size:13px">
              <El as="span" s="flex:1"><El as="span" s="font-weight:500">jamies-rig</El> <El as="span" s="color:#6b7385">· RTX 3080 · 10 GB · registered 20 min ago</El></El>
              <El as="span" onClick={v.approveProvider} s="display:inline-flex;border-radius:9px;padding:6px 16px;background:#7cf5a8;color:#06140b;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 0 18px rgba(124,245,168,.25)" sh="box-shadow:0 0 30px rgba(124,245,168,.45)">Approve</El>
              <El as="span" s="color:#6b7385;font-size:12px;cursor:pointer" sh="color:#ff7a6b">Reject</El>
            </El>
          )}
          {v.providerApproved && (
            <El s="margin-top:9px;border:1px solid rgba(124,245,168,.3);border-radius:12px;background:rgba(124,245,168,.05);padding:13px 18px;font-size:13px;color:#7cf5a8;animation:nfade .3s ease">✓ jamies-rig approved — it starts receiving runs on its next check-in.</El>
          )}
          <El s="font-size:12px;color:#6b7385;margin-top:12px">Unapproved providers register fine but receive no runs — approval friction lives here, never in the installer.</El>
        </El>
      )}

      {/* ══════════ AUTOMATE DRAWER ══════════ */}
      {v.automateOpen && (
        <>
          <El onClick={v.closeAutomate} s="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60;backdrop-filter:blur(3px)" />
          <El s="position:fixed;top:0;right:0;bottom:0;width:520px;background:#0d0f16;border-left:1px solid rgba(255,255,255,.12);z-index:61;padding:24px 26px;overflow:auto;box-shadow:-24px 0 70px rgba(0,0,0,.6);animation:nfade .25s ease">
            <El s="display:flex;align-items:center">
              <El as="span" s="font-weight:700;font-size:17px;letter-spacing:-.4px">Automate this exact job</El>
              <El as="span" s="flex:1" />
              <El as="span" onClick={v.closeAutomate} s="color:#6b7385;cursor:pointer;font-size:18px" sh="color:#e8ecf4">✕</El>
            </El>
            <El s="font-size:12.5px;color:#6b7385;margin-top:5px">This code reproduces the job you just ran — same model, same prompt, same options.</El>
            <El s="display:flex;margin-top:16px">
              <El as="span" onClick={v.tabCurl} s={`padding:6px 18px;font-size:12.5px;font-weight:600;border:1px solid rgba(255,255,255,.14);border-bottom:none;border-radius:9px 0 0 0;background:${v.curlTabBg};color:${v.curlTabColor};cursor:pointer`}>curl</El>
              <El as="span" onClick={v.tabNode} s={`padding:6px 18px;font-size:12.5px;font-weight:600;border:1px solid rgba(255,255,255,.14);border-bottom:none;border-left:none;border-radius:0 9px 0 0;background:${v.nodeTabBg};color:${v.nodeTabColor};cursor:pointer`}>Node.js</El>
            </El>
            <El s="font-family:var(--font-ibm-plex-mono),monospace;font-size:11px;line-height:1.75;background:#0b0d13;border:1px solid rgba(255,255,255,.14);border-radius:0 10px 10px 10px;padding:14px 16px;color:#c9d4e8;white-space:pre-wrap">{v.snippetCode}</El>
            <El s="display:flex;gap:10px;margin-top:14px;align-items:center">
              <El as="span" onClick={v.insertKey} s="display:inline-flex;border-radius:9px;padding:8px 17px;background:#5de6ff;color:#06121a;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 0 20px rgba(93,230,255,.3)" sh="box-shadow:0 0 34px rgba(93,230,255,.5)">{v.insertKeyLabel}</El>
              <El as="span" onClick={v.copySnippet} s="display:inline-flex;border-radius:9px;padding:8px 17px;border:1px solid rgba(255,255,255,.14);font-size:12.5px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.07)">{v.copySnippetLabel}</El>
              <El as="span" s="flex:1" />
              <El as="span" s="font-size:12px;color:#6b7385">Hand this to your developer →</El>
            </El>
            <El s="font-size:12px;color:#6b7385;margin-top:12px">Returns a <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px">job_id</El> instantly; poll <El as="span" s="font-family:var(--font-ibm-plex-mono),monospace;font-size:10.5px">GET /v1/jobs/:id</El> or get a webhook when it&apos;s done.</El>
            <El onClick={v.goConnectFromDrawer} s="margin-top:18px;border:1px solid rgba(93,230,255,.3);border-radius:11px;background:rgba(93,230,255,.05);padding:13px 16px;cursor:pointer" sh="background:rgba(93,230,255,.1)">
              <El s="font-weight:600;font-size:13px">Building a workflow in n8n, Make, or Zapier?</El>
              <El s="font-size:12.5px;color:#5de6ff;font-weight:500;margin-top:4px">Open the Connect guide →</El>
            </El>
          </El>
        </>
      )}

      {/* ══════════ CREATE KEY MODAL ══════════ */}
      {v.keyModalOpen && (
        <>
          <El onClick={v.closeKeyModal} s="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60;backdrop-filter:blur(3px)" />
          <El s="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:400px;background:#0d0f16;border:1px solid rgba(255,255,255,.14);border-radius:14px;z-index:61;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.7);animation:nfade .25s ease">
            {v.keyModalStage1 && (
              <>
                <El s="font-weight:700;font-size:16px">Create a key</El>
                <El s="font-size:12.5px;color:#6b7385;margin-top:3px">What&apos;s it for? (just a label)</El>
                <input
                  value={v.newKeyLabel}
                  onChange={v.setNewKeyLabel}
                  placeholder="e.g. my n8n workflow"
                  style={css("width:100%;margin-top:12px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#0b0d13;color:#e8ecf4;padding:9px 12px;font-size:13.5px;outline:none")}
                />
                <El s="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
                  <El as="span" onClick={v.closeKeyModal} s="font-size:13px;color:#6b7385;align-self:center;cursor:pointer" sh="color:#e8ecf4">Cancel</El>
                  <El as="span" onClick={v.createKey} s="display:inline-flex;border-radius:9px;padding:8px 18px;background:#5de6ff;color:#06121a;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 0 20px rgba(93,230,255,.3)">Create key</El>
                </El>
              </>
            )}
            {v.keyModalStage2 && (
              <>
                <El s="font-weight:700;font-size:16px">Here&apos;s your key</El>
                <El s="margin-top:12px;background:#0b0d13;border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:10px 12px;font-family:var(--font-ibm-plex-mono),monospace;font-size:12px;color:#9fb1cc">{v.freshKey}</El>
                <El s="font-size:12.5px;color:#ff7a6b;margin-top:10px">Copy it now — for your security it won&apos;t be shown again.</El>
                <El s="display:flex;gap:10px;margin-top:16px">
                  <El as="span" onClick={v.copyFreshKey} s="display:inline-flex;border-radius:9px;padding:8px 18px;background:#5de6ff;color:#06121a;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 0 20px rgba(93,230,255,.3)">{v.copyFreshLabel}</El>
                  <El as="span" onClick={v.closeKeyModal} s="display:inline-flex;border-radius:9px;padding:8px 18px;border:1px solid rgba(255,255,255,.14);font-size:13px;font-weight:500;cursor:pointer" sh="background:rgba(255,255,255,.07)">Done</El>
                </El>
              </>
            )}
          </El>
        </>
      )}

      {/* ══════════ REVOKE MODAL ══════════ */}
      {v.revokeModalOpen && (
        <>
          <El onClick={v.closeRevoke} s="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60;backdrop-filter:blur(3px)" />
          <El s="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:400px;background:#0d0f16;border:1px solid rgba(255,255,255,.14);border-radius:14px;z-index:61;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.7);animation:nfade .25s ease">
            <El s="font-weight:700;font-size:16px">Revoke &quot;{v.revokeTarget}&quot;?</El>
            <El s="font-size:13px;margin-top:8px;color:#d7deeb">Anything using this key stops working <b>immediately</b>. This can&apos;t be undone.</El>
            <El s="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
              <El as="span" onClick={v.closeRevoke} s="font-size:13px;color:#6b7385;align-self:center;cursor:pointer" sh="color:#e8ecf4">Keep it</El>
              <El as="span" onClick={v.confirmRevoke} s="display:inline-flex;border-radius:9px;padding:8px 18px;background:#ff7a6b;color:#1a0805;font-size:13px;font-weight:700;cursor:pointer" sh="box-shadow:0 0 18px rgba(255,122,107,.4)">Revoke</El>
            </El>
          </El>
        </>
      )}

      {/* ══════════ TOAST ══════════ */}
      {v.toast && (
        <El s="position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:80;background:#10131c;border:1px solid rgba(124,245,168,.4);color:#7cf5a8;border-radius:999px;padding:9px 22px;font-size:13px;font-weight:500;box-shadow:0 10px 34px rgba(0,0,0,.5);animation:nfade .25s ease">{v.toast}</El>
      )}
    </div>
  );
}
