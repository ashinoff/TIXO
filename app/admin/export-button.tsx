"use client";
import { useRef, useState } from "react";
type Kind = "all" | "inventory" | "costing" | "orders" | "expenses";
export function ExportButton({ kind, label = "Скачать Excel", params = {}, disabled = false }: { kind: Kind; label?: string; params?: Record<string, string>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const downloading = useRef(false);
  const download = async () => {
    if (downloading.current) return;
    downloading.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/reports/export?${new URLSearchParams({ ...params, kind })}`, { cache: "no-store" });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "Не удалось выгрузить отчёт"); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `tixo-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выгрузить отчёт"); }
    finally { downloading.current = false; setBusy(false); }
  };
  return <span className="export-control"><button type="button" disabled={busy || disabled} onClick={() => void download()}>{busy ? "Готовим Excel…" : label}</button>{error && <small className="editor-error" role="alert">{error}</small>}</span>;
}
