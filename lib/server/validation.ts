export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function integer(value: unknown, label: string, min = 0, max = 2147483647) {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || (typeof value === "string" && !/^\d+$/.test(value))) {
    throw new InputError(`${label}: укажите целое число`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new InputError(`${label}: число должно быть от ${min} до ${max}`);
  return result;
}

export function textValue(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new InputError(`Проверьте поле «${label}»`);
  return value.trim();
}

export function parseScent(body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Проверьте данные аромата");
  const color = textValue(body.color, "Цвет", 7).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new InputError("Цвет должен быть в формате #AABBCC");
  if (!Array.isArray(body.notes) || body.notes.length > 12) throw new InputError("Укажите до 12 нот аромата");
  if (typeof body.active !== "boolean") throw new InputError("Укажите доступность аромата");
  return {
    name: textValue(body.name, "Название аромата", 120),
    description: textValue(body.description, "Описание", 2000, false),
    notes: body.notes.map(note => textValue(note, "Нота аромата", 80, false)).filter(Boolean),
    color, colorName: textValue(body.colorName, "Название цвета", 80), active: body.active,
  };
}

export function parseOrder(body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Проверьте данные заказа");
  const customerName = textValue(body.customerName, "Имя", 160);
  const phone = textValue(body.phone, "Телефон", 40);
  const email = textValue(body.email, "Email", 254);
  const address = textValue(body.address, "Адрес", 1000);
  const delivery = textValue(body.delivery, "Доставка", 100);
  const comment = textValue(body.comment ?? "", "Комментарий", 2000, false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+\d\s()\-]{7,40}$/.test(phone) || phone.replace(/\D/g, "").length < 7) throw new InputError("Проверьте телефон и email");
  const requestKey = body.requestKey === undefined ? null : textValue(body.requestKey, "Номер запроса", 36);
  if (requestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) throw new InputError("Некорректный номер запроса");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new InputError("Проверьте состав заказа");
  const lines = new Map<string, { productId: number; variantId: number | null; quantity: number }>();
  for (const value of body.items) {
    if (!value || typeof value !== "object") throw new InputError("Проверьте состав заказа");
    const productId = integer(value.productId, "Товар", 1);
    const variantId = value.variantId == null ? null : integer(value.variantId, "Вариант", 1);
    const key = `${productId}:${variantId}`;
    const quantity = integer(value.quantity, "Количество", 1, 99) + (lines.get(key)?.quantity ?? 0);
    if (quantity > 99) throw new InputError("Не более 99 свечей одного варианта в заказе");
    lines.set(key, { productId, variantId, quantity });
  }
  return { customerName, phone, email, address, delivery, comment, requestKey, items: [...lines.values()] };
}
