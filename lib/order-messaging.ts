import { money, type OrderItem } from "./catalog";

export const messengerKeys = {
  whatsapp: "atelier.contact.whatsapp",
  telegram: "atelier.contact.telegram",
} as const;
export type Messenger = keyof typeof messengerKeys;
export type MessengerContacts = Record<Messenger, string>;
export const emptyMessengerContacts: MessengerContacts = { whatsapp: "", telegram: "" };
export const messengerNames: Record<Messenger, string> = { whatsapp: "WhatsApp", telegram: "Telegram" };
// Historical orders retain their original handoff labels; new orders offer only two channels.
export const orderMessengerNames = { ...messengerNames, instagram: "Instagram" };
export type OrderMessenger = keyof typeof orderMessengerNames;

/** Only merchant destinations, never arbitrary URLs supplied to the storefront. */
export function normalizeMessengerContact(kind: Messenger, input: unknown): string {
  if (!Object.hasOwn(messengerKeys, kind)) throw new Error("Выберите WhatsApp или Telegram.");
  if (typeof input !== "string" || input.length > 200) throw new Error(`Проверьте контакт ${messengerNames[kind]}.`);
  let value = input.trim();
  if (!value) return "";
  if (/^(https:\/\/|wa\.me\/|t\.me\/)/i.test(value)) {
    const url = new URL(value.startsWith("https://") ? value : `https://${value}`);
    const hosts = { whatsapp: ["wa.me"], telegram: ["t.me"] };
    if (url.protocol !== "https:" || !hosts[kind].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !/^\/[^/]+\/?$/.test(url.pathname)) throw new Error(`Укажите прямой контакт ${messengerNames[kind]}, без дополнительных параметров.`);
    value = url.pathname.replace(/^\/|\/$/g, "");
  }
  if (kind === "whatsapp") {
    if (!/^\+?[\d\s().-]+$/.test(value)) throw new Error("WhatsApp: укажите номер с кодом страны, например +7 999 123-45-67.");
    value = value.replace(/\D/g, "");
    if (!/^[1-9]\d{6,14}$/.test(value)) throw new Error("WhatsApp: укажите полный номер с кодом страны.");
  } else {
    value = value.replace(/^@/, "");
    const valid = /^[a-z][a-z0-9_]{4,31}$/i.test(value);
    const reserved = /^(share|joinchat|addstickers|addemoji|login|proxy|socks|iv|boost|giftcode)$/i;
    if (!valid || reserved.test(value)) throw new Error(`${messengerNames[kind]}: укажите имя аккаунта или прямую ссылку на него.`);
  }
  return value;
}

export function readMessengerContacts(content: Record<string, { value?: unknown }>): MessengerContacts {
  const contacts = { ...emptyMessengerContacts };
  for (const kind of Object.keys(messengerKeys) as Messenger[]) {
    try { contacts[kind] = normalizeMessengerContact(kind, content[messengerKeys[kind]]?.value ?? ""); } catch { /* Invalid legacy settings must not produce external links. */ }
  }
  return contacts;
}

type OrderMessageSource = {
  orderNumber: string; customerName: string; phone: string;
  address: string; delivery: string; comment: string; items: OrderItem[]; total: number;
};

/** Uses the stored order snapshot, including server-checked prices and old retry data. */
export function orderMessage(order: OrderMessageSource): string {
  const quotePending = order.items.some(item => item.quotePending);
  const lines = order.items.map((item, index) => {
    const details = [item.formName && item.formName !== item.name ? `Форма: ${item.formName}` : "", item.colorName ? `Цвет: ${item.colorName}` : "", item.accentColorName ? `Декор: ${item.accentColorName}` : "", item.scentName ? `Аромат: ${item.scentName}` : ""].filter(Boolean);
    return [`${index + 1}. ${item.name}`, ...details, `${item.quantity} шт. · ${item.quotePending ? "стоимость по согласованию" : `${money(item.price)} / шт. = ${money(item.price * item.quantity)}`}`].join("\n");
  });
  return [
    `Здравствуйте! Мой заказ ТИХО № ${order.orderNumber}.`,
    lines.join("\n\n"),
    quotePending ? `Свечи из коллекции: ${money(order.total)}.\nСтоимость индивидуальных свечей — по согласованию.` : `Итого за свечи: ${money(order.total)}.`,
    "Доставка оплачивается отдельно. Оплата и детали заказа — по согласованию.",
    [`Имя: ${order.customerName}`, `Телефон: ${order.phone}`, `Доставка: ${order.delivery === "pickup" ? "В пункт выдачи" : order.delivery === "courier" ? "Курьером" : order.delivery}`, `Адрес: ${order.address}`].join("\n"),
    order.comment ? `Комментарий: ${order.comment}` : "",
  ].filter(Boolean).join("\n\n");
}

export function messengerLink(kind: Messenger, contact: string, message: string) {
  const normalized = normalizeMessengerContact(kind, contact);
  if (!normalized) return null;
  const base = kind === "whatsapp" ? `https://wa.me/${normalized}` : `https://t.me/${normalized}`;
  const draft = `${base}?text=${encodeURIComponent(message)}`;
  // Long orders remain intact in the copyable text rather than being silently truncated.
  const prefilled = [...message].length <= 4096 && draft.length <= 8000;
  return { href: prefilled ? draft : base, prefilled };
}
