"use client";
/* eslint-disable @next/next/no-img-element -- original transparent artwork */
import { useState } from "react";
import type { CandleForm } from "@/lib/catalog";
import { formPortrait } from "@/lib/form-portraits";

/** One artwork source for the storefront, form cards and form editor. Legacy masks stay in saved data only. */
export function FormMiniature({ form }: { form: CandleForm }) {
  const portrait = formPortrait(form);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const src = [form.filterImage, portrait?.src].find((url): url is string => Boolean(url) && !failedSources.includes(url!));
  return <span className="filter-form-preview" data-small={portrait?.small || undefined} aria-hidden="true">
    {src ? <img className="form-miniature" src={src} alt="" width="640" height="640" loading="lazy" decoding="async" draggable={false} onError={() => setFailedSources(current => [...current, src])} />
      : <span className="form-miniature-empty">Миниатюра пока не добавлена</span>}
  </span>;
}
