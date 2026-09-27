import { messengerKeys, type Messenger } from "./order-messaging";

type Handoff = { requestKey: string; channel: Messenger; expires: number };
const storageKey = "tixo.atelier.handoffs.v1";
let memory: Handoff[] = [];
const sending = new Set<string>();
const keyOf = (item: Handoff) => `${item.requestKey}:${item.channel}`;
function read() {
  try { memory = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]"); } catch { /* Use memory when browser storage is unavailable. */ }
  if (!Array.isArray(memory)) memory = [];
  return memory.filter(item => item && typeof item.requestKey === "string" && typeof item.channel === "string" && Object.hasOwn(messengerKeys, item.channel) && item.expires > Date.now()).slice(-100);
}
function write(items: Handoff[]) {
  memory = items;
  try { window.sessionStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* Retry from memory while the page is open. */ }
}
export async function flushMessengerHandoffs() {
  const queued = read(); write(queued);
  await Promise.all(queued.map(async item => {
    const key = keyOf(item);
    if (sending.has(key)) return;
    sending.add(key);
    try {
      const response = await fetch("/api/orders/messenger", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestKey: item.requestKey, channel: item.channel }), keepalive: true });
      if (response.ok || response.status === 400) write(read().filter(value => keyOf(value) !== key));
    } catch { /* Keep it for the next online/focus event or page load. */ }
    finally { sending.delete(key); }
  }));
}
export function recordMessengerHandoff(requestKey: string | undefined, channel: Messenger) {
  if (!requestKey || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(requestKey)) return;
  const item = { requestKey, channel, expires: Date.now() + 24 * 60 * 60 * 1000 };
  write([...read().filter(value => keyOf(value) !== keyOf(item)), item]);
  void flushMessengerHandoffs();
}
