"use client";
import { useState, type FormEvent } from "react";
import { readLegalSettings, type LegalSettings as Settings } from "../../lib/legal";

export function LegalSettings({ content, onSaved }: { content: Record<string, { value: string }>; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => readLegalSettings(content));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/legal", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить сведения.");
      setDraft(data.settings); setSaved(true); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить сведения."); }
    finally { setSaving(false); }
  };
  const field = (key: keyof Settings, label: string, type = "text") => <label key={key}>{label}<input type={type} value={draft[key]} maxLength={600} onChange={event => { setDraft(value => ({ ...value, [key]: event.target.value })); setSaved(false); }} /></label>;
  return <form className="legal-settings content-card" onSubmit={save}>
    <span className="admin-kicker">Документы сайта</span><h3>Владелец и обращения о данных</h3>
    <p>Эти сведения публикуются в политике и согласии. Владельцем может быть физическое лицо. Указывайте только реальные сведения; паспортные данные не нужны.</p>
    {(!draft.ownerName || !draft.ownerAddress) && <p className="legal-settings-notice">ФИО и адрес оператора пока не заполнены. На сайте используется общее обозначение владельца мастерской. Это временная редакция: публикация документов не заменяет идентификацию оператора, уведомление Роскомнадзора и проверку размещения данных.</p>}
    <fieldset disabled={saving}>{field("ownerName", "ФИО или наименование владельца")}{field("ownerAddress", "Адрес для обращений")}{field("contactEmail", "Почта для обращений", "email")}{field("contactPhone", "Телефон для обращений", "tel")}
      <label>Дополнительные реквизиты<textarea maxLength={2000} rows={3} value={draft.registrationDetails} onChange={event => { setDraft(value => ({ ...value, registrationDetails: event.target.value })); setSaved(false); }} /></label>
      <button type="submit">{saving ? "Сохраняем…" : "Сохранить сведения"}</button>
    </fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}{saved && <p role="status">Сведения сохранены. Новая версия согласия применяется к следующим заказам.</p>}
    <nav aria-label="Открыть документы"><a href="/privacy" target="_blank" rel="noopener noreferrer">Политика обработки данных ↗</a><a href="/consent" target="_blank" rel="noopener noreferrer">Согласие на обработку данных ↗</a></nav>
  </form>;
}
