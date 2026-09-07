"use client";
/* eslint-disable @next/next/no-img-element -- production images are pre-compressed WebP assets */

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cartKey, money, productShape, type CartLine, type Product, type Scent, type Variant } from "@/lib/catalog";
import { ProductCard } from "./components/product-card";
import { Modal } from "./components/modal";
import { CandlePreview } from "./components/candle-preview";
type SiteContent = Record<string, { value: string; kind: string }>;

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [scents, setScents] = useState<Scent[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<Record<string, CartLine & { product: Product; variant?: Variant; scent: Scent }>>({});
  const [favorites, setFavorites] = useState<number[]>([]);
  const [activeScent, setActiveScent] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderError, setOrderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const requestKey = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [content, setContent] = useState<SiteContent>({});
  const c = (key: string, fallback: string) => content[key]?.value || fallback;
  const loadCatalog = useCallback(() => Promise.all([
    fetch("/api/products", { cache: "no-store" }), fetch("/api/scents", { cache: "no-store" }),
  ]).then(async responses => {
    if (responses.some(response => !response.ok)) throw new Error();
    const [items, profiles] = await Promise.all(responses.map(response => response.json()));
    if (!Array.isArray(items) || !Array.isArray(profiles)) throw new Error();
    setProducts(items); setScents(profiles.filter((scent: Scent) => scent.active)); setCatalogError("");
  }).catch(() => setCatalogError("Не удалось загрузить каталог. Попробуйте ещё раз.")).finally(() => setLoading(false)), []);
  useEffect(() => { void loadCatalog(); fetch("/api/content").then(r => r.ok ? r.json() : {}).then(setContent).catch(() => undefined); return () => clearTimeout(toastTimer.current); }, [loadCatalog]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  const cartItems = useMemo(() => Object.entries(cart).flatMap(([key, line]) => {
    const live = products.find(p => p.id === line.productId);
    const product = live ?? line.product;
    const liveVariant = live?.variants.find(v => v.id === line.variantId);
    const variant = liveVariant ?? line.variant;
    const scentAvailable = scents.some(scent => scent.id === line.scent.id && scent.active);
    const stock = !live || !scentAvailable ? 0 : product.hasVariants ? (liveVariant?.active && liveVariant.scent.active ? liveVariant.stock : 0) : line.variantId === null ? product.stock : 0;
    const otherQuantity = Object.entries(cart).reduce((sum, [otherKey, other]) => sum + (otherKey !== key && other.productId === line.productId && other.variantId === line.variantId ? other.quantity : 0), 0);
    return [{ ...product, key, variant, scent: line.scent, scentId: line.scent.id, variantId: line.variantId, quantity: line.quantity, availableStock: Math.max(0, stock - otherQuantity), image: variant?.image ?? product.image }];
  }), [cart, products, scents]);
  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  const selectedScent = scents.find(profile => profile.id === activeScent) ?? scents[0];
  const notify = (message: string) => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(null), 2400); };
  const addToCart = (product: Product, variant?: Variant) => {
    if (!selectedScent) return;
    const key = cartKey(product.id, variant?.id ?? null, selectedScent.id);
    const quantity = (cart[key]?.quantity ?? 0) + 1;
    const stock = product.hasVariants ? variant?.stock ?? 0 : product.stock;
    const inCart = Object.values(cart).reduce((sum, line) => sum + (line.productId === product.id && line.variantId === (variant?.id ?? null) ? line.quantity : 0), 0);
    if (inCart + 1 > stock || quantity > 99) { notify("В корзине уже всё доступное количество этой формы"); return; }
    requestKey.current = null;
    setCart(current => ({ ...current, [key]: { productId: product.id, variantId: variant?.id ?? null, scentId: selectedScent.id, quantity, product, variant, scent: selectedScent } }));
    notify(`${product.name} · ${selectedScent.name} — в корзине`);
  };
  const changeQuantity = (key: string, delta: number, stock: number) => {
    requestKey.current = null;
    setCart(current => {
      const line = current[key]; if (!line) return current;
      const quantity = line.quantity + delta; const next = { ...current };
      if (quantity <= 0) delete next[key];
      else if (quantity <= Math.min(stock, 99) || delta < 0) next[key] = { ...line, quantity };
      return next;
    });
  };
  const handleSubscribe = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubscribed(true); };
  const closeCart = () => { if (submittingRef.current) return; setCartOpen(false); setCheckoutOpen(false); setOrderPlaced(false); };
  const handleOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (submittingRef.current || !cartItems.length) return;
    submittingRef.current = true; setSubmitting(true); setOrderError("");
    const form = new FormData(event.currentTarget);
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestKey: requestKey.current, customerName: form.get("name"), phone: form.get("phone"), email: form.get("email"), address: form.get("address"), delivery: form.get("delivery"), comment: form.get("comment"), items: cartItems.map(item => ({ productId: item.id, variantId: item.variantId, scentId: item.scentId, quantity: item.quantity })) }) });
      const data = await response.json();
      if (!response.ok) { setOrderError(data.error || "Не удалось отправить заказ"); if (response.status === 409) await loadCatalog(); return; }
      setOrderNumber(data.orderNumber); setOrderPlaced(true); setCart({}); requestKey.current = null; await loadCatalog();
    } catch { setOrderError("Связь прервалась. Нажмите «Отправить» ещё раз — повторный заказ не создастся."); }
    finally { submittingRef.current = false; setSubmitting(false); }
  };

  return (
    <main className="storefront" style={{ "--scent-accent": selectedScent?.color ?? "#752e43" } as CSSProperties}>
      <div className="announcement">
        <span>{c("announcement.main", "Бесплатная доставка от 4 500 ₽")}</span>
        <span className="announcement-note">{c("announcement.note", "Каждая свеча отлита вручную")}</span>
      </div>

      <header className="site-header">
        <button
          className={menuOpen ? "menu-button menu-button-open" : "menu-button"}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
        </button>

        <a className="wordmark" href="#top" aria-label="ТИХО — на главную">
          ТИХО<span>●</span>
        </a>

        <nav className={menuOpen ? "nav nav-open" : "nav"}>
          <a href="#catalog" onClick={() => setMenuOpen(false)}>Каталог</a>
          <a href="#scents" onClick={() => setMenuOpen(false)}>Ароматы</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>О нас</a>
          <a href="#delivery" onClick={() => setMenuOpen(false)}>Доставка</a>
        </nav>

        <button className="cart-button" type="button" onClick={() => { setMenuOpen(false); setCartOpen(true); }} aria-label={`Открыть корзину, товаров: ${cartCount}`}>
          Корзина <span>{cartCount}</span>
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Сделано руками. Зажигается сердцем.</div>
          <h1>
            {c("hero.title", "Свет, который")}
            <em>{c("hero.emphasis", "принимает форму")}</em>
          </h1>
          <p className="hero-lead">
            {c("hero.description", "Скульптурные свечи и авторские ароматы для тихих вечеров, долгих разговоров и дома, в который хочется возвращаться.")}
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#catalog">Выбрать свою свечу <span>↗</span></a>
            <a className="text-link" href="#about">Познакомиться с нами <span>→</span></a>
          </div>
          <div className="hero-meta">
            <span>100% соевый воск</span>
            <span>Фитили из дерева и хлопка</span>
            <span>До 60 часов горения</span>
          </div>
        </div>

        <div className="hero-visual">
          <img src={c("image.hero", "/images/hero-candles.webp")} alt="Коллекция скульптурных свечей ТИХО" fetchPriority="high" />
          <a className="hero-sticker" href="#scents"><span>ваш аромат</span><strong>ваш</strong><small>цвет</small></a>
          <div className="hero-caption">
            <span>01</span>
            <p><strong>Тёплый свет.</strong><br />Умиротворяющий аромат.</p>
          </div>
        </div>
      </section>

      <section className="intro-strip" aria-label="Философия бренда">
        <p>Маленькие объекты</p>
        <span>✦</span>
        <p className="intro-feature">больших чувств</p>
        <span>✦</span>
        <p>созданные медленно</p>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="collection-heading"><div><span className="section-index">01 / соберите свою свечу</span><h2>Один аромат.<br /><em>Любая форма.</em></h2></div><p>Начните с аромата — вся коллекция<br />окрасится в его цвет.</p></div>
        <div className="scent-picker" id="scents">
          <div className="picker-heading"><span>01 — Аромат и цвет</span><span>Выбор для всей коллекции</span></div>
          <div className="scent-options" role="group" aria-label="Аромат всей коллекции">
            {scents.map((profile, index) => <button key={profile.id} className={`scent-option${selectedScent?.id === profile.id ? " selected" : ""}`} aria-pressed={selectedScent?.id === profile.id} onClick={() => setActiveScent(profile.id)}>
              <span className="scent-option-dot" style={{ background: profile.color }}><span aria-hidden="true">{selectedScent?.id === profile.id ? "✓" : ""}</span></span>
              <span className="scent-option-text"><strong>{profile.name}</strong><small>{profile.colorName}</small></span><span className="scent-option-index">{String(index + 1).padStart(2, "0")}</span>
            </button>)}
          </div>
          {selectedScent && <div className="selected-composition" aria-live="polite"><span><i style={{ background: selectedScent.color }} />{selectedScent.name}</span><p>{selectedScent.description}</p><small>{selectedScent.notes.join(" · ")}</small></div>}
          {!loading && !catalogError && !scents.length && <p className="catalog-notice">Ароматы скоро появятся в коллекции.</p>}
        </div>
        <div className="catalog-caption"><span>02 — Выберите форму</span><span>{loading ? "Загружаем коллекцию…" : `${products.length} форм · ${selectedScent?.colorName ?? "коллекция"}`}</span></div>
        {catalogError && <div className="catalog-notice" role="alert">{catalogError}<button className="text-link" onClick={() => { setLoading(true); void loadCatalog(); }}>Повторить</button></div>}
        {!loading && !catalogError && products.length === 0 && <div className="catalog-notice">Новая коллекция скоро появится.</div>}
        {loading && !products.length && <div className="catalog-loading" role="status">Готовим вашу коллекцию…</div>}
        <div className="product-grid">
          {products.map((product, index) => <ProductCard key={product.id} product={product} index={index} scent={selectedScent} favorite={favorites.includes(product.id)} onFavorite={() => setFavorites(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])} onAdd={variant => addToCart(product, variant)} />)}
        </div>
        <p className="preview-note">На карточках — предпросмотр формы и цвета. Оттенок воска может немного отличаться в зависимости от освещения.</p>
      </section>

      <section className="manifesto">
        <div className="manifesto-image">
          <img src={c("image.collection", "/images/collection-candles.webp")} alt="Пять свечей из коллекции ТИХО" loading="lazy" />
          <span>Коллекция 01 / 2026</span>
        </div>
        <div className="manifesto-copy">
          <span className="section-index light">наш манифест</span>
          <blockquote>{c("manifesto.quote", "«Свеча — это маленькая архитектура настроения»")}</blockquote>
          <p>{c("manifesto.text", "Мы не торопим воск и не повторяем формы до идеальной одинаковости. В каждой свече остаётся след ручной работы — поэтому она живая.")}</p>
          <div className="manifesto-facts">
            <div><strong>7</strong><span>этапов<br />ручной работы</span></div>
            <div><strong>48ч</strong><span>на полное<br />застывание</span></div>
            <div><strong>0%</strong><span>парафина<br />и фталатов</span></div>
          </div>
        </div>
      </section>

      <section className="gift-section">
        <div className="gift-copy">
          <span className="section-index">подарки без повода</span>
          <h2>Дарите не вещь.<br /><em>Дарите ощущение.</em></h2>
          <p>Соберём набор из двух или трёх свечей, добавим открытку с вашими словами и упакуем так, что жалко открывать.</p>
          <a className="button button-outline" href="#delivery">Собрать подарок <span>↗</span></a>
        </div>
        <div className="gift-visual">
          <img src={c("image.gift", "/images/collection-candles.webp")} alt="Подарочная коллекция ароматических свечей" loading="lazy" />
          <div className="gift-label"><span>от</span><strong>4 900</strong><small>₽</small></div>
        </div>
      </section>

      <section className="about-section" id="about">
        <div className="about-image">
          <img src={c("image.about", "/images/workshop-candle-making.webp")} alt="Ручная заливка соевого воска в мастерской ТИХО" loading="lazy" />
          <span className="vertical-note">Сочи · маленькая мастерская · большие планы</span>
        </div>
        <div className="about-copy">
          <span className="section-index">03 / о нас</span>
          <h2>Сделано <em>не фабрикой,</em><br />а человеком</h2>
          <p className="about-lead">{c("about.lead", "ТИХО началось с желания вернуть дому его главное свойство — быть местом, где можно выдохнуть.")}</p>
          <p>{c("about.text", "Мы смешиваем ароматы маленькими партиями, вручную готовим формы и проверяем горение каждой новой композиции. Нам важны не скорость и тираж, а тот самый момент, когда вы зажигаете фитиль и пространство вокруг меняется.")}</p>
          <div className="signature">с теплом, команда тихо</div>
          <a className="text-link" href="#catalog">Смотреть коллекцию <span>→</span></a>
        </div>
      </section>

      <section className="reviews">
        <div className="section-heading reviews-heading">
          <div><span className="section-index">04 / говорят о нас</span><h2>Ваши тихие <em>истории</em></h2></div>
          <div className="review-score"><strong>4.9</strong><span>★★★★★<br />на основе 186 отзывов</span></div>
        </div>
        <div className="review-grid">
          <article><span>01</span><div className="stars">★★★★★</div><blockquote>«Пахнет так, будто дома испекли что-то тёплое, но без приторности. Теперь это мой ритуал по воскресеньям»</blockquote><p>— Марина, Москва</p></article>
          <article><span>02</span><div className="stars">★★★★★</div><blockquote>«Свеча “После дождя” — буквально воздух после летней грозы. И даже незажжённая выглядит как арт-объект»</blockquote><p>— Лиза, Краснодар</p></article>
          <article><span>03</span><div className="stars">★★★★★</div><blockquote>«Дарила набор подруге. Упаковка, открытка, сами свечи — всё очень личное и без ощущения масс-маркета»</blockquote><p>— Алина, Санкт-Петербург</p></article>
        </div>
      </section>

      <section className="delivery-section" id="delivery">
        <div className="delivery-intro">
          <span className="section-index light">доставка и забота</span>
          <h2>Привезём тепло<br /><em>куда скажете</em></h2>
        </div>
        <div className="delivery-list">
          <div><span>01</span><h3>По России</h3><p>СДЭК и Boxberry, 2–7 рабочих дней. Бесплатно от 4 500 ₽.</p></div>
          <div><span>02</span><h3>По Сочи</h3><p>Курьером в день заказа или самовывозом из мастерской.</p></div>
          <div><span>03</span><h3>В подарок</h3><p>Без чека в коробке, с вашей открыткой и точно в нужную дату.</p></div>
        </div>
      </section>

      <section className="newsletter">
        <span>письма, которые хочется открывать</span>
        <h2>{subscribed ? "Теперь будем на связи ♡" : "Редкие новости о новых ароматах"}</h2>
        {!subscribed && (
          <form onSubmit={handleSubscribe}>
            <label className="sr-only" htmlFor="email">Ваш email</label>
            <input id="email" type="email" placeholder="ВАШ EMAIL" required />
            <button type="submit">Подписаться <span>→</span></button>
          </form>
        )}
        <small>Никакого спама. Только красивое и полезное.</small>
      </section>

      <footer>
        <div className="footer-top">
          <a className="footer-wordmark" href="#top">ТИХО<span>●</span></a>
          <p>Свечи для дома,<br />в котором хорошо.</p>
          <div className="footer-links"><a href="#catalog">Каталог</a><a href="#about">О бренде</a><a href="#delivery">Доставка</a><a href="#delivery">Оплата</a></div>
          <div className="footer-links"><a href="mailto:hello@tiho-candles.ru">Email</a><a href="#top">Telegram</a><a href="#top">Instagram*</a><a href="/admin">Управление</a></div>
        </div>
        <div className="footer-bottom"><span>© 2026 ТИХО</span><span>Политика конфиденциальности</span><span>* Instagram принадлежит Meta, признанной экстремистской организацией в РФ</span></div>
      </footer>

      {cartOpen && <Modal className="cart-drawer cart-open" label="Корзина" onClose={closeCart}>
        <div inert={checkoutOpen || undefined}>
        <div className="cart-header"><div><span>ваш выбор</span><h2>Корзина <em>({cartCount})</em></h2></div><button onClick={closeCart} aria-label="Закрыть корзину">×</button></div>
        {cartItems.length === 0 ? (
          <div className="empty-cart"><div className="empty-flame">♢</div><h3>Здесь пока тихо</h3><p>Выберите форму и любимый аромат.</p><button className="button button-dark" onClick={() => setCartOpen(false)}>Перейти в каталог</button></div>
        ) : (
          <>
            <div className="cart-items">
              {cartItems.map((item) => (
                <article className="cart-item" key={item.key}>
                  <div className="cart-thumb"><CandlePreview shape={productShape(item)} color={item.scent.color} label={`${item.name}, ${item.scent.colorName}`} /></div>
                  <div className="cart-item-copy"><h3>{item.name}</h3><p>{item.scent.name} · {item.scent.colorName}</p>{item.quantity > item.availableStock && <p className="stock-error">Осталось {item.availableStock} шт.</p>}<div className="quantity"><button onClick={() => changeQuantity(item.key, -1, item.availableStock)} aria-label={`Уменьшить количество ${item.name}`}>−</button><span>{item.quantity}</span><button disabled={item.quantity >= Math.min(item.availableStock, 99)} onClick={() => changeQuantity(item.key, 1, item.availableStock)} aria-label={`Увеличить количество ${item.name}`}>＋</button></div></div>
                  <strong>{money(item.price * item.quantity)}</strong>
                </article>
              ))}
            </div>
            <div className="cart-footer">
              <div className="cart-total"><span>Итого</span><strong>{money(cartTotal)}</strong></div>
              <p>{cartTotal >= 4500 ? "Доставка будет бесплатной ♡" : `До бесплатной доставки ещё ${money(4500 - cartTotal)}`}</p>
              <button className="button button-dark checkout-button" disabled={cartItems.some(item => item.quantity > item.availableStock)} onClick={() => { setOrderPlaced(false); setOrderError(""); setCheckoutOpen(true); }}>Перейти к оформлению <span>→</span></button>
              <small>Менеджер уточнит доставку перед оплатой</small>
            </div>
          </>
        )}

        </div>
        {checkoutOpen && <div className="checkout-panel checkout-panel-open">
          {!orderPlaced ? (
            <>
              <div className="checkout-heading">
                <button autoFocus disabled={submitting} onClick={() => setCheckoutOpen(false)} aria-label="Вернуться в корзину">←</button>
                <div><span>почти готово</span><h2>Оформление</h2></div>
              </div>
              <form className="checkout-form" onSubmit={handleOrder}><fieldset className="checkout-fields" disabled={submitting}>
                <label>Как к вам обращаться?<input type="text" name="name" maxLength={160} autoComplete="name" placeholder="Имя" required /></label>
                <label>Телефон<input type="tel" name="phone" maxLength={40} autoComplete="tel" placeholder="+7 999 000-00-00" required /></label>
                <label>Email<input type="email" name="email" maxLength={254} autoComplete="email" placeholder="name@example.ru" required /></label>
                <label>Адрес доставки<textarea name="address" maxLength={1000} autoComplete="street-address" placeholder="Город, улица, дом, квартира или удобный пункт выдачи" required /></label>
                <fieldset><legend>Как доставить?</legend><label><input type="radio" name="delivery" value="Пункт выдачи" defaultChecked /> Пункт выдачи</label><label><input type="radio" name="delivery" value="Курьером" /> Курьером</label></fieldset>
                <label>Комментарий<textarea name="comment" maxLength={2000} placeholder="Пожелания к заказу (необязательно)" /></label>
                <div className="checkout-summary"><span>{cartCount} шт.</span><strong>{money(cartTotal)}</strong></div>
                {orderError && <p className="checkout-error" role="alert">{orderError}</p>}
                <button className="button button-dark checkout-button" disabled={submitting || cartItems.some(item => item.quantity > item.availableStock) || !cartItems.length} type="submit">{submitting ? "Отправляем…" : "Отправить заявку"} <span>→</span></button>
                <p>Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности.</p>
              </fieldset></form>
            </>
          ) : (
            <div className="order-success">
              <span>♡</span>
              <h2>Спасибо.<br /><em>Будем на связи</em></h2>
              <p>Заказ {orderNumber} принят. Мы проверим детали и скоро свяжемся с вами, чтобы подтвердить доставку.</p>
              <button className="button button-dark" onClick={() => { setOrderPlaced(false); setCheckoutOpen(false); setCartOpen(false); }}>Вернуться на сайт</button>
            </div>
          )}
        </div>}
      </Modal>}

      <div className={toast ? "toast toast-visible" : "toast"} role="status">{toast}<span>✓</span></div>
    </main>
  );
}
