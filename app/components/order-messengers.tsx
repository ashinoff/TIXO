"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyMessengerContacts, messengerKeys, messengerLink, messengerNames, normalizeMessengerContact, type Messenger, type MessengerContacts } from "../../lib/order-messaging";
import { ArrowIcon } from "./ui-icon";

export function OrderMessengers({ message }: { message: string }) {
  const [contacts, setContacts] = useState<MessengerContacts>(emptyMessengerContacts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [showText, setShowText] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/order-contacts", { cache: "no-store", signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const next = { ...emptyMessengerContacts };
      for (const kind of Object.keys(messengerKeys) as Messenger[]) next[kind] = normalizeMessengerContact(kind, data[kind] ?? "");
      if (!signal?.aborted) setContacts(next);
    } catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const dialog = panel.current?.closest<HTMLElement>(".cart-dialog");
    if (dialog) dialog.scrollTop = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load external merchant settings after mount
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true); setCopyStatus("Текст скопирован. Вставьте его в чат и нажмите «Отправить».");
    } catch {
      setShowText(true); setCopyStatus("Выделите и скопируйте текст ниже — браузер не разрешил автоматическое копирование.");
      requestAnimationFrame(() => { text.current?.focus({ preventScroll: true }); text.current?.select(); });
    }
  };
  const channels = (Object.keys(messengerKeys) as Messenger[]).flatMap(kind => {
    const link = messengerLink(kind, contacts[kind], message);
    return link ? [{ kind, ...link }] : [];
  });
  return <section ref={panel} className="order-messengers" aria-label="Заказ в мессенджере">
    <h4>{channels.length ? "Продолжим в мессенджере?" : "Ваш заказ под рукой"}</h4>
    {!!channels.length && <p>Выберите удобный чат с мастерской. В мессенджере нажмите «Отправить» — автоматически сообщение не отправляется.</p>}
    {loading && <p role="status">Загружаем способы связи…</p>}
    {error && <p>Не удалось загрузить способы связи. Заказ сохранён.<button type="button" className="text-link" onClick={() => { setLoading(true); setError(false); void load(); }}>Попробовать снова</button></p>}
    <div className="messenger-options">{channels.map(channel => <div className="messenger-option" key={channel.kind}>
      <a className="messenger-link" href={channel.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{messengerNames[channel.kind]} <ArrowIcon /></a>
      <small>{channel.prefilled ? "Чат откроется с готовым текстом заказа." : channel.kind === "instagram" ? "Сначала скопируйте заказ ниже, затем откройте Direct и вставьте текст." : "Заказ длинный: скопируйте его ниже и вставьте в открывшийся чат."}</small>
    </div>)}</div>
    <button type="button" className="copy-order" onClick={() => void copy()}>{copied ? "Скопировать ещё раз" : "Скопировать текст заказа"}</button>
    {copyStatus && <p className="copy-order-status" role="status">{copyStatus}</p>}
    <button type="button" className="text-link order-text-toggle" aria-expanded={showText} onClick={() => setShowText(value => !value)}>{showText ? "Скрыть текст заказа" : "Посмотреть текст заказа"}</button>
    {showText && <textarea ref={text} className="order-message-text" aria-label="Текст заказа для мессенджера" readOnly value={message} rows={10} />}
  </section>;
}
