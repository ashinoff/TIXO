"use client";
export function OrderConsent({ version, checked, onChange, disabled }: { version: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="order-consent">
    <label><input name="privacyConsent" type="checkbox" required checked={checked} disabled={disabled || !version} onChange={event => onChange(event.target.checked)} /><span>Даю <a href="/consent" target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a> для оформления заказа.</span></label>
    <p>Как используются данные — в <a href="/privacy" target="_blank" rel="noopener noreferrer">политике обработки персональных данных</a>.</p>
  </div>;
}
