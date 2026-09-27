"use client";
/* eslint-disable @next/next/no-img-element -- small transparent local assets and original uploaded artwork */
import { useState } from "react";
import type { CandleForm } from "@/lib/catalog";
import { formPortrait } from "@/lib/form-portraits";
import { CandlePreview } from "./candle-preview";

export function FormMiniature({ form }: { form: CandleForm }) {
  const portrait = formPortrait(form);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = portrait?.src ?? form.silhouette;
  return <span className="filter-form-preview" data-small={portrait?.small || undefined} aria-hidden="true">
    {src && src !== failedSource
      ? <img className={portrait ? "form-miniature" : "form-miniature form-miniature-uploaded"} src={src} alt="" width="640" height="640" loading="lazy" decoding="async" draggable={false} onError={() => setFailedSource(src)} />
      : <span className="form-miniature-fallback"><CandlePreview shape={form.shape} color="#cbbb9f" /></span>}
  </span>;
}
