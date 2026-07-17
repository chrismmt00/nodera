"use client";

import { useState } from "react";
import { JobComposer } from "@/components/model-runner.js";
import { Button, C, El, Panel } from "@/components/ui.js";
import {
  formatRuntime,
  modalityLabel,
  modelFields,
  modelTitle,
  parameterSummary,
} from "@/lib/client/model-form.js";

export function ModelGallery({ models }) {
  const [selectedSlug, setSelectedSlug] = useState(models[0]?.slug || "");
  const selected = models.find((model) => model.slug === selectedSlug) || models[0];

  if (!models.length) {
    return (
      <Panel s="padding:22px">
        <El s={`color:${C.dim};font-size:14px`}>No models are available right now.</El>
      </Panel>
    );
  }

  return (
    <div className="nodera-models-layout">
      <div className="nodera-model-card-grid" aria-label="Available models">
        {models.map((model) => (
          <ModelCard
            key={model.slug}
            model={model}
            active={model.slug === selected.slug}
            onSelect={() => setSelectedSlug(model.slug)}
          />
        ))}
      </div>
      <div className="nodera-model-composer">
        <div className="nodera-selected-model-heading">
          <div>
            <El s={`font-size:11px;color:${C.accent};font-family:var(--font-ibm-plex-mono),monospace;text-transform:uppercase`}>
              {modalityLabel(selected.modality)}
            </El>
            <El as="h2" s="font-size:17px;margin:3px 0 0">{modelTitle(selected)}</El>
          </div>
          <El s={`font-size:11px;color:${C.dim};font-family:var(--font-ibm-plex-mono),monospace`}>
            {selected.slug}
          </El>
        </div>
        <JobComposer key={selected.slug} model={selected} />
      </div>
    </div>
  );
}

function ModelCard({ model, active, onSelect }) {
  return (
    <Panel s="padding:16px;min-height:224px">
      <div className="nodera-model-card">
        <div className="nodera-model-card-top">
          <span>{modalityLabel(model.modality)}</span>
          <code>{formatRuntime(model.max_runtime_s)}</code>
        </div>
        <El as="h2" s="font-size:17px;margin:12px 0 0;letter-spacing:0">{modelTitle(model)}</El>
        <El s={`font-size:13px;color:${C.dim};line-height:1.55;margin-top:8px`}>{model.description}</El>
        <div className="nodera-model-meta">
          <span>{parameterSummary(model)}</span>
          <span>{modelFields(model).map((field) => field.label).join(", ")}</span>
        </div>
        <Button type="button" variant={active ? "primary" : "secondary"} onClick={onSelect}>
          {active ? "Selected" : "Try model"}
        </Button>
      </div>
    </Panel>
  );
}
