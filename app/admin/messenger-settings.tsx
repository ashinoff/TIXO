"use client";
import { useState, type FormEvent } from "react";
import { messengerKeys, messengerNames, readMessengerContacts, normalizeMessengerContact, type Messenger } from "../../lib/order-messaging";

export function MessengerSettings({ content, onSaved }: { content: Record<string, { value: string }>; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => readMessengerContacts(content));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const contacts = Object.fromEntries((Object.keys(messengerKeys) as Messenger[]).map(kind => [kind, normalizeMessengerContact(kind, draft[kind])]));
      const response = await fetch("/api/order-contacts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(contacts) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить контакты.");
      setDraft(data); setSaved(true); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить контакты."); }
    finally { setSaving(false); }
  };
  return <form className="messenger-settings content-card" onSubmit={save}>
    <span className="admin-kicker">Связь с покупателем</span><h3>Мессенджеры для заказов</h3>
    <p>После оформления покупатель сможет открыть ваш чат с текстом заказа. Заказ уже сохранён в разделе «Заказы». Оставьте поле пустым, чтобы скрыть этот мессенджер.</p>
    <fieldset disabled={saving}>
      {(Object.keys(messengerKeys) as Messenger[]).map(kind => <label key={kind}>{messengerNames[kind]}
        <input value={draft[kind]} type={kind === "whatsapp" ? "tel" : "text"} autoComplete="off" maxLength={200} placeholder={kind === "whatsapp" ? "+7 999 123-45-67" : "@имя_аккаунта"} onChange={event => { setDraft(current => ({ ...current, [kind]: event.target.value })); setSaved(false); }} />
        <small>{kind === "whatsapp" ? "Номер магазина с кодом страны. Можно вставить ссылку wa.me." : "Личный аккаунт или аккаунт Telegram Business, в который можно написать. Не канал и не бот. Допустима ссылка t.me."}</small>
      </label>)}
      <button type="submit">{saving ? "Сохраняем…" : "Сохранить контакты"}</button>
    </fieldset>
    {error && <p className="editor-error" role="alert">{error}</p>}{saved && <p role="status">Контакты сохранены.</p>}
  </form>;
}
